import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ActivityDTOSchema, DealDTOSchema } from "../../../contracts/crm.ts";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

const companies = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID()];
const actor = { role: "authenticated", id: users[0] };
const other = { role: "authenticated", id: users[1] };
const context = (action_id = randomUUID(), index = 0) => ({ company_id: companies[index], actor_type: "user", actor_id: users[index], action_id });
let assertions = 0;
const check = (name, condition) => { assert.ok(condition, name); assertions++; console.log(`PASS ${name}`); };
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
const failed = (result, code) => !result.ok && result.error.code === code;
async function rpc(auth, ctx, operation, input, name = "pipeline_execute") {
  if (!["pipeline_execute", "contacts_execute"].includes(name)) throw new Error("Unexpected RPC");
  return JSON.parse(await asActor(auth, `select public.${name}(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
}
const counts = async () => JSON.parse(await sql(`select jsonb_build_object(
  'deals',(select count(*) from public.deals where company_id=${quote(companies[0])}),
  'activities',(select count(*) from public.activity_log where company_id=${quote(companies[0])}),
  'receipts',(select count(*) from app_private.action_receipts where company_id=${quote(companies[0])}))::text`));
await sql(`do $$ begin if current_database()<>'tratunex_contacts_verify' then raise exception 'Wrong database'; end if; end $$;
  insert into auth.users(id,email) values (${quote(users[0])},${quote(`${users[0]}@example.test`)}),(${quote(users[1])},${quote(`${users[1]}@example.test`)});
  insert into public.companies(id,name) values (${quote(companies[0])},'Pipeline aislado A'),(${quote(companies[1])},'Pipeline aislado B');
  insert into public.company_members(company_id,user_id,role) values (${quote(companies[0])},${quote(users[0])},'admin'),(${quote(companies[1])},${quote(users[1])},'vendedor');`);
try {
  const contactInput = { name: "Contacto pipeline ficticio", organization: null, phone_e164: "+12025550171", website: null,
    source: { kind: "manual", label: "Verificación PostgreSQL pipeline", url: null } };
  const contact = success(await rpc(actor, context(), "upsertContact", contactInput, "contacts_execute")).contact;
  const secondContact = success(await rpc(actor, context(), "upsertContact", { ...contactInput, name: "No contactar ficticio", phone_e164: "+12025550172", do_not_contact: true }, "contacts_execute")).contact;
  const otherContact = success(await rpc(other, context(undefined,1), "upsertContact", contactInput, "contacts_execute")).contact;
  const action = randomUUID();
  const createInput = { contact_id: contact.id, title: "Oportunidad ficticia" };
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => rpc(actor, context(action), "createDeal", createInput)));
  check("8 creaciones concurrentes con una acción tienen éxito", concurrent.every(result => result.ok));
  check("las 8 respuestas reproducen el mismo snapshot", concurrent.every(result => JSON.stringify(result) === JSON.stringify(concurrent[0])));
  let deal = success(concurrent[0]).deal;
  check("oportunidad nueva cumple DealDTO y arranca en new", DealDTOSchema.safeParse(deal).success && deal.stage === "new");
  const initialCounts = await counts();
  check("la acción crea una oportunidad y una actividad", initialCounts.deals === 1 && initialCounts.activities === 1);
  check("la mutación agrega un solo recibo además de los contactos", initialCounts.receipts === 3);
  const sameReload = success(await rpc(actor, context(), "listDeals", { contact_id: contact.id }));
  check("otra conexión conserva la creación", sameReload.items.length === 1 && sameReload.items[0].id === deal.id);
  check("misma acción con otro título genera CONFLICT", failed(await rpc(actor, context(action), "createDeal", { ...createInput, title: "Otro título" }), "CONFLICT"));
  const second = success(await rpc(actor, context(), "createDeal", createInput)).deal;
  check("otra intención puede crear otra oportunidad del mismo contacto", second.id !== deal.id);
  const blockedContactDeal = success(await rpc(actor, context(), "createDeal", { contact_id: secondContact.id, title: "Revisión manual DNC" })).deal;
  check("crear oportunidad de contacto DNC no inicia llamadas ni cambia su etapa inicial", blockedContactDeal.stage === "new");
  check("el contacto DNC no se modifica al crear la oportunidad", success(await rpc(actor, context(), "getContact", { contact_id: secondContact.id }, "contacts_execute")).contact.do_not_contact);
  const otherDeal = success(await rpc(other, context(undefined,1), "createDeal", { contact_id: otherContact.id, title: "Oportunidad empresa B" })).deal;

  const beforeRace = await counts();
  const race = await Promise.all([
    rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: "contacted", expected_stage: "new" }),
    rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: "won", expected_stage: "new" }),
  ]);
  check("dos movimientos sobre la misma etapa esperada tienen un solo ganador", race.filter(result => result.ok).length === 1 && race.filter(result => failed(result,"CONFLICT")).length === 1);
  const afterRace = await counts();
  check("el conflicto concurrente no agrega actividad ni recibo", afterRace.activities === beforeRace.activities + 1 && afterRace.receipts === beforeRace.receipts + 1);
  deal = success(race.find(result => result.ok)).deal;
  const stageAction = randomUUID();
  const stageInput = { deal_id: deal.id, stage: "potential_client", expected_stage: deal.stage };
  const changed = await rpc(actor, context(stageAction), "setDealStage", stageInput);
  deal = success(changed).deal;
  check("mover etapa conserva el ID y persiste el cambio", deal.id === concurrent[0].data.deal.id && deal.stage === "potential_client");
  check("repetir acción de cambio devuelve el mismo resultado", JSON.stringify(await rpc(actor, context(stageAction), "setDealStage", stageInput)) === JSON.stringify(changed));
  const beforeNoop = await counts();
  const noop = success(await rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: deal.stage, expected_stage: deal.stage })).deal;
  check("misma etapa no modifica updated_at", noop.updated_at === deal.updated_at);
  check("misma etapa no agrega actividad", (await counts()).activities === beforeNoop.activities);
  check("expected_stage vieja devuelve CONFLICT", failed(await rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: "lost", expected_stage: "new" }), "CONFLICT"));
  const stages = ["new", "contacted", "potential_client", "follow_up", "won", "lost", "disqualified"];
  for (const stage of stages) deal = success(await rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage, expected_stage: deal.stage })).deal;
  check("las siete etapas admiten cambio manual válido", deal.stage === "disqualified");
  deal = success(await rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: "new", expected_stage: "disqualified" })).deal;
  check("una persona puede reabrir manualmente una etapa terminal", deal.stage === "new");
  const beforeInvalid = await counts();
  check("etapa inválida se rechaza", failed(await rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: "inventada" }), "VALIDATION_ERROR"));
  check("etapa esperada inválida se rechaza", failed(await rpc(actor, context(), "setDealStage", { deal_id: deal.id, stage: "won", expected_stage: "inventada" }), "VALIDATION_ERROR"));
  check("no se acepta identidad del navegador en input", failed(await rpc(actor, context(), "createDeal", { ...createInput, company_id: companies[1] }), "VALIDATION_ERROR"));
  check("título vacío se rechaza", failed(await rpc(actor, context(), "createDeal", { ...createInput, title: " " }), "VALIDATION_ERROR"));
  check("errores dejan intactos oportunidades, actividades y recibos", JSON.stringify(await counts()) === JSON.stringify(beforeInvalid));
  check("crear con contacto ajeno devuelve NOT_FOUND", failed(await rpc(actor, context(), "createDeal", { contact_id: otherContact.id, title: "Cruce rechazado" }), "NOT_FOUND"));
  check("mover oportunidad ajena devuelve NOT_FOUND", failed(await rpc(other, context(undefined,1), "setDealStage", { deal_id: deal.id, stage: "won" }), "NOT_FOUND"));
  check("usuario ajeno no puede obtener recibo cacheado", failed(await rpc(other, context(action), "createDeal", createInput), "FORBIDDEN"));
  check("usuario no se puede declarar worker para leer", failed(await rpc(actor, { ...context(), actor_type: "system" }, "listDeals", {}), "FORBIDDEN"));
  check("claim de rol JSON no escala el rol SQL", failed(await rpc({ ...actor, claims: { role: "service_role" } }, { ...context(), actor_type: "voice" }, "listDeals", {}), "FORBIDDEN"));
  const workerCtx = { ...context(), actor_type: "system" };
  check("service_role verificado puede leer el pipeline", success(await rpc({ role: "service_role" }, workerCtx, "listDeals", {})).items.length === 3);
  check("service_role system no puede mover etapas manuales", failed(await rpc({ role: "service_role" }, workerCtx, "setDealStage", { deal_id: deal.id, stage: "won" }), "FORBIDDEN"));
  check("service_role voice no puede crear oportunidades manuales", failed(await rpc({ role: "service_role" }, { ...workerCtx, actor_type: "voice" }, "createDeal", createInput), "FORBIDDEN"));

  const page1 = success(await rpc(actor, context(), "listDeals", { limit: 2 }));
  const page2 = success(await rpc(actor, context(), "listDeals", { limit: 2, cursor: page1.next_cursor }));
  check("oportunidades paginan sin repetir registros", page1.items.length === 2 && page2.items.length === 1 && new Set([...page1.items,...page2.items].map(item => item.id)).size === 3 && page2.next_cursor === null);
  check("filtro por contacto aplica antes del límite", success(await rpc(actor, context(), "listDeals", { contact_id: contact.id, limit: 1 })).next_cursor !== null);
  check("filtro por etapa aplica antes del límite", success(await rpc(actor, context(), "listDeals", { stage: "won" })).items.length === 0);
  check("filtro por contacto ajeno no filtra información", success(await rpc(actor, context(), "listDeals", { contact_id: otherContact.id })).items.length === 0);
  check("listas rechazan parámetros inválidos", failed(await rpc(actor, context(), "listDeals", { stage: "inventada" }), "VALIDATION_ERROR") && failed(await rpc(actor, context(), "listActivities", { limit: 101 }), "VALIDATION_ERROR") && failed(await rpc(actor, context(), "listDeals", { cursor: "basura" }), "VALIDATION_ERROR"));
  check("listas no aceptan company_id del cliente", failed(await rpc(actor, context(), "listActivities", { company_id: companies[1] }), "VALIDATION_ERROR"));
  let cursor;
  const activities = [];
  for (let page = 0; page < 20; page++) {
    const data = success(await rpc(actor, context(), "listActivities", { limit: 2, ...(cursor ? { cursor } : {}) }));
    activities.push(...data.items);
    cursor = data.next_cursor;
    if (!cursor) break;
  }
  check("actividades paginan sin duplicados ni pérdidas", !cursor && new Set(activities.map(item => item.id)).size === activities.length && activities.length === (await counts()).activities);
  check("actividades se ordenan por fecha descendente e ID como desempate", activities.every((item,index) => index === 0 || activities[index-1].occurred_at > item.occurred_at || (activities[index-1].occurred_at === item.occurred_at && activities[index-1].id > item.id)));
  check("actividad contiene actor, empresa, contacto y fechas UTC", activities.every(item => item.company_id === companies[0] && item.actor_id === users[0] && item.actor_type === "user" && /Z$/.test(item.occurred_at) && item.contact_id && item.deal_id && item.summary));
  check("actividad cumple el schema Zod compartido", activities.every(item => ActivityDTOSchema.safeParse(item).success));
  check("historial registra creación y movimiento manual", activities.some(item => item.kind === "deal_created") && activities.some(item => item.kind === "deal_stage_changed" && item.summary.includes("manualmente")));
  check("movimientos describen ambas etapas en español", activities.filter(item => item.kind === "deal_stage_changed").every(item => /^Etapa cambiada manualmente de .+ a .+$/.test(item.summary)));
  check("actividad se filtra por contacto sin cruzar empresa", success(await rpc(actor, context(), "listActivities", { contact_id: secondContact.id })).items.every(item => item.contact_id === secondContact.id));
  const otherActivity = success(await rpc(other, context(undefined,1), "listActivities", {})).items[0];
  check("cursor de actividad ajeno devuelve NOT_FOUND", failed(await rpc(actor, context(), "listActivities", { cursor: otherActivity.id }), "NOT_FOUND"));
  check("cursor de actividad inexistente devuelve NOT_FOUND", failed(await rpc(actor, context(), "listActivities", { cursor: randomUUID() }), "NOT_FOUND"));
  const rlsDeals = JSON.parse(await asActor(other, "select coalesce(jsonb_agg(id),'[]'::jsonb)::text from public.deals"));
  const rlsActivity = JSON.parse(await asActor(other, "select coalesce(jsonb_agg(company_id),'[]'::jsonb)::text from public.activity_log"));
  check("RLS SELECT oportunidades solo muestra empresa miembro", rlsDeals.length === 1 && rlsDeals[0] === otherDeal.id);
  check("RLS SELECT actividades solo muestra empresa miembro", rlsActivity.length === 1 && rlsActivity[0] === companies[1]);
  const acl = JSON.parse(await sql(`select jsonb_build_object(
    'anon',has_function_privilege('anon','public.pipeline_execute(jsonb,text,jsonb)','execute'),
    'dto',has_function_privilege('authenticated','app_private.pipeline_deal_dto(public.deals)','execute'),
    'deal_write',has_table_privilege('authenticated','public.deals','update'),
    'log_write',has_table_privilege('authenticated','public.activity_log','insert'),
    'service_write',has_table_privilege('service_role','public.deals','insert'),
    'rls_deals',(select relrowsecurity from pg_class where oid='public.deals'::regclass),
    'rls_log',(select relrowsecurity from pg_class where oid='public.activity_log'::regclass))::text`));
  check("RPC y helpers no están expuestos a anon o llamadas directas", !acl.anon && !acl.dto);
  check("ningún cliente escribe directamente oportunidades o actividad", !acl.deal_write && !acl.log_write && !acl.service_write);
  check("las dos tablas tienen RLS habilitado", acl.rls_deals && acl.rls_log);
  const beforeRollback = await counts();
  const rollbackAction = randomUUID();
  await sql(`begin; set local role authenticated; set local request.jwt.claims=${quote(JSON.stringify({ sub: users[0], role: "authenticated" }))};
    select public.pipeline_execute(${quote(JSON.stringify(context(rollbackAction)))}::jsonb,'createDeal',${quote(JSON.stringify(createInput))}::jsonb); rollback;`);
  check("rollback revierte oportunidad, actividad y recibo juntos", JSON.stringify(await counts()) === JSON.stringify(beforeRollback));
  await sql(`delete from public.company_members where company_id=${quote(companies[0])} and user_id=${quote(users[0])}`);
  check("membresía revocada bloquea resultado cacheado", failed(await rpc(actor, context(action), "createDeal", createInput), "FORBIDDEN"));
  check("membresía revocada bloquea listas", failed(await rpc(actor, context(), "listDeals", {}), "FORBIDDEN") && failed(await rpc(actor, context(), "listActivities", {}), "FORBIDDEN"));
  console.log(`PASS ${assertions} comprobaciones PostgreSQL de pipeline`);
} finally {
  const ids = companies.map(quote).join(",");
  await sql(`delete from public.activity_log where company_id in (${ids});
    delete from public.deals where company_id in (${ids});
    delete from app_private.action_receipts where company_id in (${ids});
    delete from public.contacts where company_id in (${ids});
    delete from public.company_members where company_id in (${ids});
    delete from public.companies where id in (${ids});
    delete from auth.users where id in (${users.map(quote).join(",")});`);
}
