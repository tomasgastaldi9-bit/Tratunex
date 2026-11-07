import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";
import { ContactDTOSchema } from "../../../contracts/crm.ts";

const companies = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID()];
const actor = { role: "authenticated", id: users[0] };
const other = { role: "authenticated", id: users[1] };
const context = (action_id = randomUUID(), index = 0) => ({ company_id: companies[index], actor_type: "user", actor_id: users[index], action_id });
let assertions = 0;
const check = (name, condition) => { assert.ok(condition, name); assertions++; console.log(`PASS ${name}`); };
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
const failed = (result, code) => !result.ok && result.error.code === code;
const base = { name: "Lucía Ficticia", organization: "Empresa de prueba",
  phone_e164: "+12025550180", website: "https://www.Contactos.Example:443/ficha",
  source: { kind: "csv", label: "CSV ficticio", url: null } };
async function rpc(auth, ctx, operation, input) {
  return JSON.parse(await asActor(auth, `select public.contacts_execute(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
}
const count = async table => Number(await sql(`select count(*) from ${table} where company_id=${quote(companies[0])}`));

await sql(`do $$ begin if current_database()<>'tratunex_contacts_verify' then raise exception 'Wrong database'; end if; end $$;
  insert into auth.users(id,email) values (${quote(users[0])},${quote(`${users[0]}@example.test`)}),(${quote(users[1])},${quote(`${users[1]}@example.test`)});
  insert into public.companies(id,name) values (${quote(companies[0])},'Contactos aislados A'),(${quote(companies[1])},'Contactos aislados B');
  insert into public.company_members(company_id,user_id,role) values (${quote(companies[0])},${quote(users[0])},'admin'),(${quote(companies[1])},${quote(users[1])},'vendedor');`);
try {
  const action = randomUUID();
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => rpc(actor, context(action), "upsertContact", base)));
  check("8 conexiones con la misma acción tienen éxito", concurrent.every(result => result.ok));
  check("los reintentos devuelven exactamente el mismo snapshot", concurrent.every(result => JSON.stringify(result) === JSON.stringify(concurrent[0])));
  const first = success(concurrent[0]);
  check("la primera acción crea un contacto", first.created && Boolean(first.contact.id));
  check("concurrencia crea un contacto y un recibo", await count("public.contacts") === 1 && await count("app_private.action_receipts") === 1);
  check("UTF-8 y timestamps UTC se conservan", first.contact.name === base.name && /Z$/.test(first.contact.created_at));
  check("el DTO no expone el dominio derivado", !Object.hasOwn(first.contact, "website_domain"));
  check("misma acción con otros datos devuelve CONFLICT", failed(await rpc(actor, context(action), "upsertContact", { ...base, name: "Otra persona" }), "CONFLICT"));

  const dedup = await Promise.all(Array.from({ length: 5 }, () => rpc(actor, context(), "upsertContact", base)));
  check("acciones concurrentes distintas deduplican", dedup.every(result => result.ok && !result.data.created && result.data.contact.id === first.contact.id));
  const byDomain = success(await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "+12025550181", website: "http://contactos.example/otra" }));
  check("dominio sin www/protocolo/puerto deduplica", !byDomain.created && byDomain.contact.id === first.contact.id);
  const byPhone = success(await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "+12025550181", website: null }));
  check("teléfono E.164 deduplica sin web", !byPhone.created && byPhone.contact.id === first.contact.id);
  const marked = success(await rpc(actor, context(), "updateContact", { ...base, contact_id: first.contact.id, do_not_contact: true, phone_e164: "+12025550182", website: "https://editado.example" }));
  check("edición por ID conserva contacto y permite cambiar teléfono", marked.contact.id === first.contact.id && marked.contact.phone_e164 === "+12025550182");
  check("edición persiste do_not_contact", marked.contact.do_not_contact);
  check("updateContact devuelve solo contacto", !Object.hasOwn(marked, "created"));
  const imported = success(await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "+12025550182", website: "https://editado.example", do_not_contact: false }));
  check("reimportar nunca revierte do_not_contact", imported.contact.do_not_contact && !imported.created);
  const reloaded = success(await rpc(actor, context(), "getContact", { contact_id: first.contact.id }));
  check("conexión nueva conserva edición y no-contactar", reloaded.contact.id === first.contact.id && reloaded.contact.do_not_contact && reloaded.contact.website === "https://editado.example");

  const second = success(await rpc(actor, context(), "upsertContact", { ...base, name: "Segundo", phone_e164: "+12025550183", website: "https://segundo.example", source: { kind: "manual", label: "Manual ficticio", url: null } }));
  const nReceipts = await count("app_private.action_receipts");
  check("editar con teléfono de otro contacto devuelve CONFLICT", failed(await rpc(actor, context(), "updateContact", { ...base, contact_id: first.contact.id, phone_e164: second.contact.phone_e164 }), "CONFLICT"));
  check("error revierte el recibo dentro de la transacción", await count("app_private.action_receipts") === nReceipts);
  check("teléfono y dominio que señalan dos contactos generan CONFLICT", failed(await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "+12025550182", website: "https://segundo.example" }), "CONFLICT"));
  check("teléfono no normalizado se rechaza", failed(await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "202 555 0180" }), "VALIDATION_ERROR"));
  check("identidad en input se rechaza", failed(await rpc(actor, context(), "upsertContact", { ...base, company_id: companies[0] }), "VALIDATION_ERROR"));
  check("source inválida se rechaza", failed(await rpc(actor, context(), "upsertContact", { ...base, source: { kind: "manual", label: " " } }), "VALIDATION_ERROR"));
  check("otro tenant puede importar el mismo teléfono/dominio", success(await rpc(other, context(undefined,1), "upsertContact", { ...base, phone_e164: "+12025550182", website: "https://editado.example" })).created);
  check("otra empresa no puede leer un ID ajeno", failed(await rpc(other, context(undefined,1), "getContact", { contact_id: first.contact.id }), "NOT_FOUND"));
  check("otra empresa no puede editar un ID ajeno", failed(await rpc(other, context(undefined,1), "updateContact", { ...base, contact_id: first.contact.id }), "NOT_FOUND"));
  check("actor falso no obtiene recibo cacheado", failed(await rpc(other, context(action), "upsertContact", base), "FORBIDDEN"));
  check("un usuario no puede declararse system", failed(await rpc(actor, { ...context(), actor_type: "system" }, "getContact", { contact_id: first.contact.id }), "FORBIDDEN"));
  check("claim JSON role=service_role no escala el rol SQL", failed(await rpc({ ...actor, claims: { role: "service_role" } }, { ...context(), actor_type: "voice" }, "getContact", { contact_id: first.contact.id }), "FORBIDDEN"));
  check("service_role verificado puede leer para Voz", success(await rpc({ role: "service_role" }, { ...context(), actor_type: "voice" }, "getContact", { contact_id: first.contact.id })).contact.id === first.contact.id);
  const visible = JSON.parse(await asActor(other, "select coalesce(jsonb_agg(company_id),'[]'::jsonb)::text from public.contacts"));
  check("RLS SELECT solo muestra la empresa miembro", visible.length === 1 && visible[0] === companies[1]);

  const page1 = success(await rpc(actor, context(), "listContacts", { limit: 1 }));
  const page2 = success(await rpc(actor, context(), "listContacts", { limit: 1, cursor: page1.next_cursor }));
  check("listas paginan sin repetir registros", page1.items.length === 1 && page2.items.length === 1 && page1.items[0].id !== page2.items[0].id && page2.next_cursor === null);
  check("filtro do_not_contact se aplica en SQL", success(await rpc(actor, context(), "listContacts", { do_not_contact: "true" })).items.every(contact => contact.do_not_contact));
  check("filtro source se aplica en SQL", success(await rpc(actor, context(), "listContacts", { source: "manual" })).items[0].id === second.contact.id);
  check("búsqueda case-insensitive se aplica antes del límite", success(await rpc(actor, context(), "listContacts", { query: "sEGunDo", limit: 1 })).items[0].id === second.contact.id);
  check("consulta se trata literalmente, sin DSL/inyección", success(await rpc(actor, context(), "listContacts", { query: "%' OR true --" })).items.length === 0);
  check("lista rechaza campos de identidad", failed(await rpc(actor, context(), "listContacts", { company_id: companies[1] }), "VALIDATION_ERROR"));
  check("lista rechaza límites/cursor inválidos", failed(await rpc(actor, context(), "listContacts", { limit: 101 }), "VALIDATION_ERROR") && failed(await rpc(actor, context(), "listContacts", { cursor: "basura" }), "VALIDATION_ERROR"));
  const invalidUrls = ["http://x:abc", "http://x:999999", "http://", "http://x\\evil", "http://x\u0001evil", " https://fuente.example",
    "http://999.999.999.999", "http://ejemplo.123", "http://0x123", "http://xn--a"];
  for (const url of invalidUrls) {
    const beforeReceipts = await count("app_private.action_receipts");
    const beforeContacts = await count("public.contacts");
    const badWebsite = await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "+12025550190", website: url });
    const badSource = await rpc(actor, context(), "upsertContact", { ...base, phone_e164: "+12025550190", website: "https://url-fixture.example", source: { ...base.source, url } });
    check(`URL inválida rechazada en web y fuente: ${JSON.stringify(url)}`, failed(badWebsite,"VALIDATION_ERROR") && failed(badSource,"VALIDATION_ERROR"));
    check("URL inválida no deja contacto ni recibo", await count("public.contacts") === beforeContacts && await count("app_private.action_receipts") === beforeReceipts);
  }
  const readDto = success(await rpc(actor, context(), "getContact", { contact_id: first.contact.id }));
  const listDto = success(await rpc(actor, context(), "listContacts", {}));
  check("lectura y lista conservan compatibilidad Zod tras inputs malformados", ContactDTOSchema.safeParse(readDto.contact).success && listDto.items.every(contact => ContactDTOSchema.safeParse(contact).success));

  const acl = JSON.parse(await sql(`select jsonb_build_object(
    'anon',has_function_privilege('anon','public.contacts_execute(jsonb,text,jsonb)','execute'),
    'helper',has_function_privilege('authenticated','app_private.contact_text(jsonb,text,boolean)','execute'),
    'receipt',has_function_privilege('authenticated','app_private.claim_action(uuid,text,uuid,text,text,jsonb)','execute'),
    'insert',has_table_privilege('authenticated','public.contacts','insert'),
    'update',has_table_privilege('authenticated','public.contacts','update'),
    'service_write',has_table_privilege('service_role','public.contacts','update'))::text`));
  check("anon no puede ejecutar RPC", !acl.anon);
  check("helpers y recibos privados no son ejecutables", !acl.helper && !acl.receipt);
  check("ningún cliente escribe directamente la tabla", !acl.insert && !acl.update && !acl.service_write);
  const rollbackAction = randomUUID();
  await sql(`begin; set local role authenticated; set local request.jwt.claims=${quote(JSON.stringify({ sub: users[0], role: "authenticated" }))};
    select public.contacts_execute(${quote(JSON.stringify(context(rollbackAction)))}::jsonb,'upsertContact',${quote(JSON.stringify({ ...base, phone_e164: "+12025550189", website: "https://rollback.example" }))}::jsonb); rollback;`);
  check("rollback revierte contacto y recibo juntos", Number(await sql(`select count(*) from app_private.action_receipts where company_id=${quote(companies[0])} and action_id=${quote(rollbackAction)}`)) === 0 && await count("public.contacts") === 2);
  await sql(`delete from public.company_members where company_id=${quote(companies[0])} and user_id=${quote(users[0])}`);
  check("membresía revocada bloquea respuesta previamente cacheada", failed(await rpc(actor, context(action), "upsertContact", base), "FORBIDDEN"));
  check("membresía revocada bloquea lista", failed(await rpc(actor, context(), "listContacts", {}), "FORBIDDEN"));
  console.log(`PASS ${assertions} comprobaciones PostgreSQL de contactos`);
} finally {
  const ids = companies.map(quote).join(",");
  await sql(`delete from app_private.action_receipts where company_id in (${ids});
    delete from public.contacts where company_id in (${ids});
    delete from public.company_members where company_id in (${ids});
    delete from public.companies where id in (${ids});
    delete from auth.users where id in (${users.map(quote).join(",")});`);
}
