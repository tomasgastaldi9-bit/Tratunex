import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SupplierDTOSchema } from "../../../contracts/crm.ts";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

const companies = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID()];
const actor = { role: "authenticated", id: users[0] };
const other = { role: "authenticated", id: users[1] };
const worker = { role: "service_role" };
const context = (action_id = randomUUID(), index = 0) => ({ company_id: companies[index], actor_type: "user", actor_id: users[index], action_id });
const serviceContext = () => ({ ...context(), actor_type: "system" });
const walletA = { chain: "base", address: "0xAbCdEf1234567890aBCDef1234567890AbCdEf12" };
const walletB = { chain: "arbitrum", address: "0x2222222222222222222222222222222222222222" };
const walletC = { chain: "base", address: "0x3333333333333333333333333333333333333333" };
const base = { name: "Proveedor de verificación", organization: "Compras aisladas", phone_e164: "+12025550161", website: "https://proveedor-verificacion.example",
  source: { kind: "csv", label: "CSV de prueba aislada", url: null }, do_not_contact: true };
let assertions = 0;
let triggerInstalled = false;
const triggerName = `supplier_verify_${randomUUID().replaceAll("-", "")}`;
const check = (name, condition) => { assert.ok(condition, name); assertions++; console.log(`PASS ${name}`); };
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
const failed = (result, code) => !result.ok && result.error.code === code;
async function rpc(auth, ctx, operation, input, name = "suppliers_execute") {
  if (!["suppliers_execute", "contacts_execute"].includes(name)) throw new Error("Unexpected RPC");
  return JSON.parse(await asActor(auth, `select public.${name}(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
}
const counts = async () => JSON.parse(await sql(`select jsonb_build_object(
  'contacts',(select count(*) from public.contacts where company_id=${quote(companies[0])}),
  'profiles',(select count(*) from public.supplier_profiles where company_id=${quote(companies[0])}),
  'receipts',(select count(*) from app_private.action_receipts where company_id=${quote(companies[0])}))::text`));
const getSupplier = async id => success(await rpc(actor, context(), "getSupplier", { contact_id: id })).supplier;
const sameWallet = (left, right) => left?.chain === right?.chain && left?.address === right?.address;
await sql(`do $$ begin if current_database()<>'tratunex_contacts_verify' then raise exception 'Wrong database'; end if; end $$;
  insert into auth.users(id,email) values (${quote(users[0])},${quote(`${users[0]}@example.test`)}),(${quote(users[1])},${quote(`${users[1]}@example.test`)});
  insert into public.companies(id,name) values (${quote(companies[0])},'Proveedores aislados A'),(${quote(companies[1])},'Proveedores aislados B');
  insert into public.company_members(company_id,user_id,role) values (${quote(companies[0])},${quote(users[0])},'admin'),(${quote(companies[1])},${quote(users[1])},'vendedor');`);
try {
  const action = randomUUID();
  const simultaneous = await Promise.all(Array.from({ length: 8 }, () => rpc(actor, context(action), "upsertSupplier", base)));
  check("8 imports concurrentes con una acción tienen éxito", simultaneous.every(result => result.ok));
  check("los 8 reintentos devuelven el mismo snapshot", simultaneous.every(result => JSON.stringify(result) === JSON.stringify(simultaneous[0])));
  const first = success(simultaneous[0]);
  let supplier = first.supplier;
  check("nuevo proveedor cumple SupplierDTO", first.created && SupplierDTOSchema.safeParse(supplier).success);
  check("nuevo proveedor queda pendiente con versión cero", supplier.is_supplier === true && supplier.collection_wallet === null && supplier.wallet_version === 0 && supplier.wallet_updated_at === null);
  const initial = await counts();
  check("contacto y perfil se crean una sola vez", initial.contacts === 1 && initial.profiles === 1);
  check("acción externa e interna guardan un recibo cada una", initial.receipts === 2);
  const nested = await sql(`select operation from app_private.action_receipts where company_id=${quote(companies[0])} and action_id=${quote(`suppliers:contact:${action}`)}`);
  check("recibo interno usa la operación CRM-03", nested === "crm.upsertContact");
  check("misma acción con otro input genera CONFLICT", failed(await rpc(actor, context(action), "upsertSupplier", { ...base, name: "Otro nombre" }), "CONFLICT"));
  const duplicates = await Promise.all(Array.from({ length: 4 }, () => rpc(worker, serviceContext(), "upsertSupplier", { ...base, do_not_contact: false })));
  check("imports con acciones distintas reutilizan contacto/perfil", duplicates.every(result => result.ok && !result.data.created && result.data.supplier.id === supplier.id));
  check("reimportar no revierte do_not_contact", (await getSupplier(supplier.id)).do_not_contact);
  const noWalletChange = success(await rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: null, expected_wallet_version: 0 })).supplier;
  check("guardar pendiente sobre pendiente es no-op", noWalletChange.wallet_version === 0 && noWalletChange.wallet_updated_at === null);

  const walletAction = randomUUID();
  const walletInput = { contact_id: supplier.id, collection_wallet: walletA, expected_wallet_version: 0 };
  const configured = await rpc(actor, context(walletAction), "setSupplierWallet", walletInput);
  supplier = success(configured).supplier;
  check("persona configura red y dirección conservando casing", sameWallet(supplier.collection_wallet,walletA) && supplier.wallet_version === 1 && /Z$/.test(supplier.wallet_updated_at));
  check("configurar wallet no modifica los campos del contacto", supplier.updated_at === noWalletChange.updated_at && supplier.phone_e164 === noWalletChange.phone_e164);
  check("reintento de wallet devuelve el mismo resultado", JSON.stringify(await rpc(actor, context(walletAction), "setSupplierWallet", walletInput)) === JSON.stringify(configured));
  const equivalent = success(await rpc(actor, context(), "setSupplierWallet", { ...walletInput, collection_wallet: { ...walletA, address: walletA.address.toLowerCase() }, expected_wallet_version: 1 })).supplier;
  check("casing equivalente no consume versión ni reemplaza la representación", equivalent.wallet_version === 1 && equivalent.wallet_updated_at === supplier.wallet_updated_at && equivalent.collection_wallet.address === walletA.address);
  check("expected_wallet_version vieja genera CONFLICT", failed(await rpc(actor, context(), "setSupplierWallet", { ...walletInput, collection_wallet: walletB }), "CONFLICT"));
  const contactImport = success(await rpc(worker, serviceContext(), "upsertContact", { ...base, name: "Actualizado por importador" }, "contacts_execute")).contact;
  check("importador de contactos conserva el rol proveedor", (await getSupplier(contactImport.id)).is_supplier);
  check("importador de contactos conserva la wallet", sameWallet((await getSupplier(contactImport.id)).collection_wallet,walletA));
  const concurrent = await Promise.all([
    rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: walletB, expected_wallet_version: 1 }),
    ...Array.from({ length: 3 }, () => rpc(worker, serviceContext(), "upsertSupplier", { ...base, name: "Importación simultánea" })),
  ]);
  check("wallet e imports simultáneos tienen éxito sin duplicar perfil", concurrent.every(result => result.ok) && (await counts()).profiles === 1);
  supplier = await getSupplier(supplier.id);
  check("importación concurrente no pisa wallet ni versión", sameWallet(supplier.collection_wallet,walletB) && supplier.wallet_version === 2);
  const beforeRace = await counts();
  const race = await Promise.all([
    rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: walletA, expected_wallet_version: 2 }),
    rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: walletC, expected_wallet_version: 2 }),
  ]);
  check("dos cambios desde la misma versión tienen un ganador", race.filter(result => result.ok).length === 1 && race.filter(result => failed(result,"CONFLICT")).length === 1);
  check("conflicto concurrente revierte su recibo", (await counts()).receipts === beforeRace.receipts + 1);
  supplier = await getSupplier(supplier.id);
  check("race incrementa la versión exactamente una vez", supplier.wallet_version === 3);
  const cleared = success(await rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: null, expected_wallet_version: 3 })).supplier;
  check("una persona puede quitar wallet con nueva versión y fecha", cleared.collection_wallet === null && cleared.wallet_version === 4 && /Z$/.test(cleared.wallet_updated_at));
  supplier = success(await rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: walletA, expected_wallet_version: 4 })).supplier;

  const beforeRejected = await counts();
  for (const extra of [{ collection_wallet: walletB }, { wallet_version: 0 }, { is_supplier: false }, { collection_address: walletB.address }]) {
    check("RPC importadora rechaza metadata de wallet/rol", failed(await rpc(worker, serviceContext(), "upsertSupplier", { ...base, ...extra }), "VALIDATION_ERROR"));
  }
  check("source no puede esconder metadata de wallet", failed(await rpc(worker, serviceContext(), "upsertSupplier", { ...base, source: { ...base.source, collection_wallet: walletB } }), "VALIDATION_ERROR"));
  for (const wallet of [{ chain: "polygon", address: walletB.address }, { chain: "base" }, { address: walletB.address }, { chain: "base", address: "0x0000000000000000000000000000000000000000" }, { chain: "base", address: "0x1234" }, { ...walletA, balance: "1" }]) {
    check("RPC wallet rechaza red/par/dirección/metadata inválida", failed(await rpc(actor, context(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: wallet, expected_wallet_version: supplier.wallet_version }), "VALIDATION_ERROR"));
  }
  check("errores no dejan contactos, perfiles ni recibos nuevos", JSON.stringify(await counts()) === JSON.stringify(beforeRejected));
  check("service_role system no puede cambiar wallet", failed(await rpc(worker, serviceContext(), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: walletB, expected_wallet_version: supplier.wallet_version }), "FORBIDDEN"));
  check("service_role voice no puede editar proveedor", failed(await rpc(worker, { ...serviceContext(), actor_type: "voice" }, "updateSupplier", { ...base, contact_id: supplier.id }), "FORBIDDEN"));
  check("claim de rol JSON no escala el rol SQL", failed(await rpc({ ...actor, claims: { role: "service_role" } }, serviceContext(), "upsertSupplier", base), "FORBIDDEN"));
  check("actor ajeno no obtiene resultado cacheado de wallet", failed(await rpc(other, context(walletAction), "setSupplierWallet", walletInput), "FORBIDDEN"));
  const promotedInput = { ...base, name: "Proveedor promovido", phone_e164: "+12025550162", website: "https://promovido.example", do_not_contact: false, source: { kind: "manual", label: "Contacto existente", url: null } };
  const originalContact = success(await rpc(actor, context(), "upsertContact", promotedInput, "contacts_execute")).contact;
  check("contacto sin perfil no se considera proveedor", failed(await rpc(actor, context(), "getSupplier", { contact_id: originalContact.id }), "NOT_FOUND"));
  const promoted = success(await rpc(actor, context(), "upsertSupplier", promotedInput));
  check("created indica perfil nuevo sobre contacto ya existente", promoted.created && promoted.supplier.id === originalContact.id);
  const edited = success(await rpc(actor, context(), "updateSupplier", { ...base, contact_id: supplier.id, name: "Proveedor editado", phone_e164: "+12025550163" })).supplier;
  check("edición humana por ID cambia contacto y conserva wallet", edited.name === "Proveedor editado" && edited.phone_e164 === "+12025550163" && sameWallet(edited.collection_wallet,walletA) && edited.wallet_version === supplier.wallet_version);
  const otherSupplier = success(await rpc(other, context(undefined,1), "upsertSupplier", base)).supplier;
  check("otra empresa puede importar el mismo proveedor", otherSupplier.id !== supplier.id && otherSupplier.company_id === companies[1]);
  check("getSupplier no expone ID de otra empresa", failed(await rpc(other, context(undefined,1), "getSupplier", { contact_id: supplier.id }), "NOT_FOUND"));
  check("updateSupplier no edita otra empresa", failed(await rpc(other, context(undefined,1), "updateSupplier", { ...base, contact_id: supplier.id }), "NOT_FOUND"));
  check("wallet no edita otra empresa", failed(await rpc(other, context(undefined,1), "setSupplierWallet", { contact_id: supplier.id, collection_wallet: walletB, expected_wallet_version: supplier.wallet_version }), "NOT_FOUND"));
  const page1 = success(await rpc(actor, context(), "listSuppliers", { limit: 1 }));
  const page2 = success(await rpc(actor, context(), "listSuppliers", { limit: 1, cursor: page1.next_cursor }));
  check("lista pagina proveedores sin duplicados", page1.items.length === 1 && page2.items.length === 1 && page1.items[0].id !== page2.items[0].id && page2.next_cursor === null);
  check("lista y detalle validan con SupplierDTO", [...page1.items,...page2.items,await getSupplier(supplier.id)].every(item => SupplierDTOSchema.safeParse(item).success));
  check("filtro wallet pendiente aplica antes del límite", success(await rpc(actor, context(), "listSuppliers", { wallet_status: "pending", limit: 1 })).items[0].id === promoted.supplier.id);
  check("filtro wallet configurada aplica antes del límite", success(await rpc(actor, context(), "listSuppliers", { wallet_status: "configured", limit: 1 })).items[0].id === supplier.id);
  check("filtros de fuente y DNC aplican en SQL", success(await rpc(actor, context(), "listSuppliers", { source: "manual", do_not_contact: "false" })).items[0].id === promoted.supplier.id);
  check("búsqueda literal case-insensitive aplica en SQL", success(await rpc(actor, context(), "listSuppliers", { query: "pRoMoViDo", limit: 1 })).items[0].id === promoted.supplier.id);
  check("consulta no interpreta SQL ni DSL", success(await rpc(actor, context(), "listSuppliers", { query: "%' OR true --" })).items.length === 0);
  check("lista rechaza identidad y estado inválido", failed(await rpc(actor, context(), "listSuppliers", { company_id: companies[1] }), "VALIDATION_ERROR") && failed(await rpc(actor, context(), "listSuppliers", { wallet_status: "inventado" }), "VALIDATION_ERROR"));
  const visible = JSON.parse(await asActor(other, "select coalesce(jsonb_agg(company_id),'[]'::jsonb)::text from public.supplier_profiles"));
  check("RLS de perfiles solo muestra empresa miembro", visible.length === 1 && visible[0] === companies[1]);
  const acl = JSON.parse(await sql(`select jsonb_build_object(
    'anon',has_function_privilege('anon','public.suppliers_execute(jsonb,text,jsonb)','execute'),
    'dto',has_function_privilege('authenticated','app_private.supplier_dto(public.contacts,public.supplier_profiles)','execute'),
    'write',has_table_privilege('authenticated','public.supplier_profiles','update'),
    'service_write',has_table_privilege('service_role','public.supplier_profiles','insert'),
    'rls',(select relrowsecurity from pg_class where oid='public.supplier_profiles'::regclass))::text`));
  check("anon y helpers no tienen ejecución directa", !acl.anon && !acl.dto);
  check("los clientes no escriben perfiles directamente", !acl.write && !acl.service_write && acl.rls);
  for (const statement of ["collection_chain='polygon'", "collection_address=null", "collection_chain=null", "collection_address='0x0000000000000000000000000000000000000000'", "wallet_version=-1"]) {
    let rejected = false;
    try { await sql(`begin; update public.supplier_profiles set ${statement} where company_id=${quote(companies[0])} and contact_id=${quote(supplier.id)}; rollback;`); }
    catch { rejected = true; }
    check("constraints rechazan perfiles inválidos aunque SQL propietario intente escribir", rejected);
  }

  const beforeRollback = await counts();
  await sql(`begin; set local role authenticated; set local request.jwt.claims=${quote(JSON.stringify({ sub: users[0], role: "authenticated" }))};
    select public.suppliers_execute(${quote(JSON.stringify(context()))}::jsonb,'upsertSupplier',${quote(JSON.stringify({ ...base, phone_e164: "+12025550164", website: "https://rollback-proveedor.example" }))}::jsonb); rollback;`);
  check("rollback revierte contacto, perfil y ambos recibos", JSON.stringify(await counts()) === JSON.stringify(beforeRollback));
  await sql(`create function app_private.${triggerName}() returns trigger language plpgsql set search_path='' as $$ begin
    if new.company_id=${quote(companies[0])}::uuid then raise exception 'Verification profile write failure'; end if; return new; end $$;
    create trigger ${triggerName} before insert on public.supplier_profiles for each row execute function app_private.${triggerName}();`);
  triggerInstalled = true;
  const failedAction = randomUUID();
  const failedInput = { ...base, phone_e164: "+12025550165", website: "https://nested-rollback.example" };
  const forced = await rpc(actor, context(failedAction), "upsertSupplier", failedInput);
  check("fallo al crear perfil se informa sin éxito aparente", failed(forced,"PROVIDER_ERROR"));
  check("fallo después del contacto revierte contactos y recibos anidados", JSON.stringify(await counts()) === JSON.stringify(beforeRollback));
  await sql(`drop trigger ${triggerName} on public.supplier_profiles; drop function app_private.${triggerName}();`);
  triggerInstalled = false;
  check("misma acción fallida puede completarse cuando se resuelve la causa", success(await rpc(actor, context(failedAction), "upsertSupplier", failedInput)).created);
  await sql(`delete from public.company_members where company_id=${quote(companies[0])} and user_id=${quote(users[0])}`);
  check("membresía revocada bloquea respuesta cacheada de import", failed(await rpc(actor, context(action), "upsertSupplier", base), "FORBIDDEN"));
  check("membresía revocada bloquea respuesta cacheada de wallet", failed(await rpc(actor, context(walletAction), "setSupplierWallet", walletInput), "FORBIDDEN"));
  check("membresía revocada bloquea listas", failed(await rpc(actor, context(), "listSuppliers", {}), "FORBIDDEN"));
  console.log(`PASS ${assertions} comprobaciones PostgreSQL de proveedores`);
} finally {
  if (triggerInstalled) await sql(`drop trigger ${triggerName} on public.supplier_profiles; drop function app_private.${triggerName}();`);
  const ids = companies.map(quote).join(",");
  await sql(`delete from public.supplier_profiles where company_id in (${ids});
    delete from app_private.action_receipts where company_id in (${ids});
    delete from public.contacts where company_id in (${ids});
    delete from public.company_members where company_id in (${ids});
    delete from public.companies where id in (${ids});
    delete from auth.users where id in (${users.map(quote).join(",")});`);
}
