-- Voz (Bautista, TRA-46): llamadas y avisos de Vapi.
-- Los usuarios solo leen las llamadas de su empresa. Las escrituras las hace el
-- servidor con la clave secreta (webhook y jobs); los avisos crudos de Vapi no
-- son accesibles desde el navegador.

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- FK a public.contacts cuando el CRM (Nano) publique su tabla.
  contact_id uuid not null,
  deal_id uuid,
  source_task_id uuid,
  action_id text not null check (length(btrim(action_id)) > 0),
  provider text not null default 'vapi' check (provider in ('vapi', 'mock')),
  -- ID de Vapi; null hasta que el proveedor acepta la llamada.
  provider_call_id text check (provider_call_id is null or length(btrim(provider_call_id)) > 0),
  transport text not null check (transport in ('mock', 'web', 'phone')),
  status text not null default 'queued'
    check (status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'unknown')),
  objective text check (objective is null or length(btrim(objective)) between 1 and 500),
  agent_version integer check (agent_version is null or agent_version > 0),
  ended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Reintentar la misma acción no crea otra llamada.
  unique (company_id, action_id),
  -- Un ID de Vapi pertenece a una sola llamada interna.
  unique (provider, provider_call_id),
  -- Una tarea de seguimiento genera como máximo una llamada.
  unique (company_id, source_task_id)
);

create index calls_company_contact_idx on public.calls(company_id, contact_id, created_at desc);
create index calls_company_status_idx on public.calls(company_id, status);

create table public.voice_events (
  id bigint generated always as identity primary key,
  provider text not null default 'vapi' check (provider in ('vapi')),
  -- Clave estable derivada del aviso: un reenvío de Vapi trae la misma clave.
  provider_event_id text not null check (length(btrim(provider_event_id)) > 0),
  provider_call_id text,
  event_type text not null check (length(btrim(event_type)) > 0),
  -- Se completan al resolver provider_call_id contra calls; null = pendiente de conciliación.
  company_id uuid references public.companies(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id),
  check ((company_id is null) = (call_id is null))
);

create index voice_events_unprocessed_idx on public.voice_events(received_at) where processed_at is null;
create index voice_events_provider_call_idx on public.voice_events(provider, provider_call_id);

alter table public.calls enable row level security;
alter table public.voice_events enable row level security;

revoke all on public.calls, public.voice_events from public, anon, authenticated;
grant select on public.calls to authenticated;

create policy "members can read their company calls" on public.calls
  for select to authenticated using (
    exists (
      select 1 from public.company_members as member
      where member.company_id = calls.company_id and member.user_id = (select auth.uid())
    )
  );
