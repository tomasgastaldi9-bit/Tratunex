-- CRM-04 incremental proposal. Tomás versions/applies the shared migration.
-- Requires CRM-03 contacts.sql and PLAT-02/03. No existing migration is changed.
begin;

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  contact_id uuid not null,
  title text not null check(length(btrim(title)) > 0),
  stage text not null default 'new' check(stage in ('new','contacted','potential_client','follow_up','won','lost','disqualified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id),
  unique(company_id,contact_id,id),
  foreign key(company_id,contact_id) references public.contacts(company_id,id)
);
create index deals_company_stage_id_idx on public.deals(company_id,stage,id);
create index deals_company_contact_id_idx on public.deals(company_id,contact_id,id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  contact_id uuid not null,
  deal_id uuid,
  kind text not null check(length(btrim(kind)) > 0),
  occurred_at timestamptz not null default clock_timestamp(),
  summary text not null check(length(btrim(summary)) > 0),
  actor_type text not null check(actor_type in ('user','voice','system')),
  actor_id uuid not null,
  foreign key(company_id,contact_id) references public.contacts(company_id,id),
  foreign key(company_id,contact_id,deal_id) references public.deals(company_id,contact_id,id)
);
create index activity_company_time_id_idx on public.activity_log(company_id,occurred_at desc,id desc);
create index activity_company_contact_time_id_idx on public.activity_log(company_id,contact_id,occurred_at desc,id desc);

alter table public.deals enable row level security;
alter table public.activity_log enable row level security;
revoke all on public.deals,public.activity_log from public,anon,authenticated,service_role;
grant select on public.deals,public.activity_log to authenticated,service_role;
create policy deals_member_read on public.deals for select to authenticated
  using(exists(select 1 from public.company_members m where m.company_id = deals.company_id and m.user_id = (select auth.uid())));
create policy activity_member_read on public.activity_log for select to authenticated
  using(exists(select 1 from public.company_members m where m.company_id = activity_log.company_id and m.user_id = (select auth.uid())));

create function app_private.pipeline_deal_dto(p public.deals) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(p) || jsonb_build_object(
    'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_at',to_char(p.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;
create function app_private.pipeline_activity_dto(p public.activity_log) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(p) || jsonb_build_object('occurred_at',to_char(p.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;

create function app_private.pipeline_execute_internal(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid; v_actor uuid; v_type text; v_action text;
  v_claimed boolean; v_cached jsonb; v_data jsonb; v_result jsonb;
  v_deal public.deals; v_activity public.activity_log;
  v_contact uuid; v_title text; v_stage text; v_expected text;
  v_limit integer := 50; v_cursor uuid; v_seen integer := 0; v_more boolean := false; v_last uuid;
  v_items jsonb := '[]'::jsonb; v_label text; v_previous_label text; v_cursor_at timestamptz;
  v_error text; v_error_code text; v_retryable boolean;
begin
  perform app_private.contact_shape(p_ctx,array['company_id','actor_type','actor_id','action_id'],array['company_id','actor_type','actor_id']);
  v_company := app_private.contact_text(p_ctx,'company_id')::uuid;
  v_actor := app_private.contact_text(p_ctx,'actor_id')::uuid;
  v_type := app_private.contact_text(p_ctx,'actor_type');
  -- Revalidate authority before reads and before returning a cached mutation.
  if v_type = 'user' then
    if auth.uid() is distinct from v_actor or not exists(select 1 from public.company_members where company_id = v_company and user_id = v_actor) then
      raise exception 'FORBIDDEN: Se requiere membresía vigente de la empresa';
    end if;
  elsif v_type in ('voice','system') then
    if current_setting('role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN: Se requieren credenciales de servidor'; end if;
    if not exists(select 1 from public.companies where id = v_company) then raise exception 'NOT_FOUND: Empresa no disponible'; end if;
  else raise exception 'FORBIDDEN: Actor no admitido'; end if;

  if p_operation in ('listDeals','listActivities') then
    if p_operation = 'listDeals' then
      perform app_private.contact_shape(p_input,array['limit','cursor','contact_id','stage'],array[]::text[]);
      if p_input ? 'stage' then
        v_stage := app_private.contact_text(p_input,'stage');
        if v_stage not in ('new','contacted','potential_client','follow_up','won','lost','disqualified') then raise exception 'VALIDATION_ERROR: Etapa inválida'; end if;
      end if;
    else perform app_private.contact_shape(p_input,array['limit','cursor','contact_id'],array[]::text[]); end if;
    if p_input ? 'limit' then
      if jsonb_typeof(p_input -> 'limit') is distinct from 'number' or (p_input ->> 'limit') !~ '^[0-9]+$' then raise exception 'VALIDATION_ERROR: Límite inválido'; end if;
      v_limit := (p_input ->> 'limit')::integer;
    end if;
    if v_limit < 1 or v_limit > 100 then raise exception 'VALIDATION_ERROR: El límite debe estar entre 1 y 100'; end if;
    if p_input ? 'cursor' then v_cursor := app_private.contact_text(p_input,'cursor')::uuid; end if;
    if p_input ? 'contact_id' then v_contact := app_private.contact_text(p_input,'contact_id')::uuid; end if;
    if p_operation = 'listDeals' then
      for v_deal in select d.* from public.deals d where d.company_id = v_company
        and (v_cursor is null or d.id > v_cursor) and (v_contact is null or d.contact_id = v_contact)
        and (v_stage is null or d.stage = v_stage) order by d.id limit v_limit + 1
      loop
        if v_seen = v_limit then v_more := true; exit; end if;
        v_items := v_items || jsonb_build_array(app_private.pipeline_deal_dto(v_deal));
        v_last := v_deal.id; v_seen := v_seen + 1;
      end loop;
    else
      if v_cursor is not null then
        select occurred_at into v_cursor_at from public.activity_log where company_id = v_company and id = v_cursor;
        if not found then raise exception 'NOT_FOUND: Cursor de actividad no disponible en esta empresa'; end if;
      end if;
      for v_activity in select a.* from public.activity_log a where a.company_id = v_company
        and (v_cursor is null or (a.occurred_at,a.id) < (v_cursor_at,v_cursor)) and (v_contact is null or a.contact_id = v_contact)
        order by a.occurred_at desc,a.id desc limit v_limit + 1
      loop
        if v_seen = v_limit then v_more := true; exit; end if;
        v_items := v_items || jsonb_build_array(app_private.pipeline_activity_dto(v_activity));
        v_last := v_activity.id; v_seen := v_seen + 1;
      end loop;
    end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('items',v_items,'next_cursor',case when v_more then v_last::text else null end));
  end if;
  if p_operation not in ('createDeal','setDealStage') or p_operation is null then raise exception 'VALIDATION_ERROR: Operación de pipeline no admitida'; end if;
  if v_type <> 'user' then raise exception 'FORBIDDEN: Una persona debe realizar este cambio manual'; end if;
  v_action := app_private.contact_text(p_ctx,'action_id');
  select claimed,cached_result into v_claimed,v_cached from app_private.claim_action(v_company,v_type,v_actor,v_action,'crm.' || p_operation,p_input);
  if not v_claimed then return v_cached; end if;

  if p_operation = 'createDeal' then
    perform app_private.contact_shape(p_input,array['contact_id','title'],array['contact_id','title']);
    v_contact := app_private.contact_text(p_input,'contact_id')::uuid;
    v_title := app_private.contact_text(p_input,'title');
    perform 1 from public.contacts where company_id = v_company and id = v_contact for key share;
    if not found then raise exception 'NOT_FOUND: Contacto no disponible en esta empresa'; end if;
    -- Manual intent can create multiple deals per contact; each starts in new.
    insert into public.deals(company_id,contact_id,title) values(v_company,v_contact,v_title) returning * into v_deal;
    insert into public.activity_log(company_id,contact_id,deal_id,kind,summary,actor_type,actor_id)
      values(v_company,v_contact,v_deal.id,'deal_created','Oportunidad creada: ' || v_title,'user',v_actor);
  else
    perform app_private.contact_shape(p_input,array['deal_id','stage','expected_stage'],array['deal_id','stage']);
    v_stage := app_private.contact_text(p_input,'stage');
    if v_stage not in ('new','contacted','potential_client','follow_up','won','lost','disqualified') then raise exception 'VALIDATION_ERROR: Etapa inválida'; end if;
    if p_input ? 'expected_stage' then
      v_expected := app_private.contact_text(p_input,'expected_stage');
      if v_expected not in ('new','contacted','potential_client','follow_up','won','lost','disqualified') then raise exception 'VALIDATION_ERROR: Etapa esperada inválida'; end if;
    end if;
    select * into v_deal from public.deals where company_id = v_company and id = app_private.contact_text(p_input,'deal_id')::uuid for update;
    if not found then raise exception 'NOT_FOUND: Oportunidad no disponible en esta empresa'; end if;
    if v_expected is not null and v_deal.stage <> v_expected then raise exception 'CONFLICT: La etapa cambió; actualizá el pipeline antes de volver a guardar'; end if;
    if v_deal.stage <> v_stage then
      v_previous_label := case v_deal.stage when 'new' then 'Nuevo' when 'contacted' then 'Contactado' when 'potential_client' then 'Cliente potencial'
        when 'follow_up' then 'En seguimiento' when 'won' then 'Compró' when 'lost' then 'No compró' when 'disqualified' then 'No calificado' end;
      update public.deals set stage = v_stage,updated_at = clock_timestamp() where company_id = v_company and id = v_deal.id returning * into v_deal;
      v_label := case v_stage when 'new' then 'Nuevo' when 'contacted' then 'Contactado' when 'potential_client' then 'Cliente potencial'
        when 'follow_up' then 'En seguimiento' when 'won' then 'Compró' when 'lost' then 'No compró' when 'disqualified' then 'No calificado' end;
      insert into public.activity_log(company_id,contact_id,deal_id,kind,summary,actor_type,actor_id)
        values(v_company,v_deal.contact_id,v_deal.id,'deal_stage_changed','Etapa cambiada manualmente de ' || v_previous_label || ' a ' || v_label,'user',v_actor);
    end if;
  end if;
  v_data := jsonb_build_object('deal',app_private.pipeline_deal_dto(v_deal));
  v_result := jsonb_build_object('ok',true,'data',v_data);
  perform app_private.complete_action(v_company,v_action,v_result);
  return v_result;
exception when others then
  -- Roll back receipt, deal and activity together, preserving previous commits.
  get stacked diagnostics v_error = message_text;
  v_error_code := split_part(v_error,':',1);
  if v_error_code not in ('VALIDATION_ERROR','NOT_FOUND','FORBIDDEN','CONFLICT','PROVIDER_ERROR','PROVIDER_UNAVAILABLE','RATE_LIMITED') then
    v_error_code := case when sqlstate in ('22P02','22007','22008','22003','23502','23514') then 'VALIDATION_ERROR'
      when sqlstate in ('23505','23503','40001','40P01') then 'CONFLICT' else 'PROVIDER_ERROR' end;
    v_error := case when v_error_code = 'VALIDATION_ERROR' then 'Datos inválidos para la operación'
      when v_error_code = 'CONFLICT' then 'Los datos cambiaron; revisá el estado antes de reintentar' else 'No se pudo completar la operación de pipeline' end;
  else v_error := btrim(substring(v_error from length(v_error_code) + 2)); end if;
  v_retryable := v_error_code = 'PROVIDER_UNAVAILABLE' or sqlstate in ('40001','40P01');
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code',v_error_code,'message',v_error,'retryable',v_retryable));
end; $$;

revoke all on function app_private.pipeline_deal_dto(public.deals),app_private.pipeline_activity_dto(public.activity_log),
  app_private.pipeline_execute_internal(jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema app_private to authenticated,service_role;
grant execute on function app_private.pipeline_execute_internal(jsonb,text,jsonb) to authenticated,service_role;
create function public.pipeline_execute(p_ctx jsonb,p_operation text,p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.pipeline_execute_internal(p_ctx,p_operation,p_input);
$$;
revoke all on function public.pipeline_execute(jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pipeline_execute(jsonb,text,jsonb) to authenticated,service_role;
commit;
