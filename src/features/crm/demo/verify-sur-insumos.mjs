import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql, quote, asActor } from "../verification/contacts-postgres-client.mjs";
import { DEMO_BUDGET_ATOMIC, newSurManifest, runSurManifest } from "./sur-insumos-local.mjs";

assert.equal(await sql("select current_database()"), "tratunex_contacts_verify");
const companies = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID()];
let assertions = 0;
const check = (label, value) => { assert.ok(value, label); assertions++; console.log(`PASS ${label}`); };
const counts = async () => JSON.parse(await sql(`select jsonb_build_object(
  'contacts',(select count(*) from public.contacts where company_id=${quote(companies[0])}),
  'profiles',(select count(*) from public.supplier_profiles where company_id=${quote(companies[0])}),
  'purchases',(select count(*) from public.purchase_requests where company_id=${quote(companies[0])}),
  'quotes',(select count(*) from public.supplier_quotes where company_id=${quote(companies[0])}),
  'receipts',(select count(*) from app_private.action_receipts where company_id=${quote(companies[0])}))::text`));
const rejected = async (manifest, code) => { try { await runSurManifest(manifest); return false; } catch (error) { return error.message.includes(code); } };
async function supplierRpc(index, operation, input) {
  const ctx = { company_id: companies[index], actor_type: "user", actor_id: users[index], action_id: randomUUID() };
  const result = JSON.parse(await asActor({ role: "authenticated", id: users[index] },
    `select public.suppliers_execute(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data.supplier;
}
const liveInput = { name: "Human-gate local test fixture", organization: null, phone_e164: "+12025550159", website: null,
  source: { kind: "manual", label: "Datos de prueba: simula carga humana, sin llamada", url: null } };
await sql(`insert into auth.users(id,email) values ${users.map(id => `(${quote(id)},${quote(`${id}@example.test`)})`).join(",")};
  insert into public.companies(id,name) values (${quote(companies[0])},'Sur Insumos'),(${quote(companies[1])},'Otro destino ficticio');
  insert into public.company_members(company_id,user_id,role) values (${quote(companies[0])},${quote(users[0])},'admin'),(${quote(companies[1])},${quote(users[1])},'admin');
  insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,allowed_supplier_ids,updated_by)
  values(${quote(companies[0])},${quote(DEMO_BUDGET_ATOMIC)},0,false,'{}',${quote(users[0])});`);
try {
  const manifest = newSurManifest(companies[0], users[0], 30);
  const prepared = await runSurManifest(manifest);
  const initial = await counts();
  check("seed creates one purchase, two examples and a local pending slot", initial.contacts === 3 && initial.profiles === 3 && initial.purchases === 1 && initial.quotes === 2 && initial.receipts === 1);
  check("pending slot never claims a real quote, call or payment", prepared.live_slot_status === "real_supplier_pending" && prepared.live_quote_id === null && !prepared.call_started && !prepared.payment_started);
  const snapshot = JSON.parse(await sql(`select jsonb_build_object('purchase',(select to_jsonb(r) from public.purchase_requests r where r.id=${quote(prepared.purchase_request_id)}),
    'quotes',(select jsonb_agg(jsonb_build_object('source',source,'call_id',call_id,'source_url',source_url,'price',unit_price::text,'quantity',available_quantity)) from public.supplier_quotes where company_id=${quote(companies[0])}),
    'dnc',(select bool_and(do_not_contact) from public.contacts where company_id=${quote(companies[0])}))::text`));
  check("purchase is 500 paper cups 240cc for a future Monday", snapshot.purchase.product === "Vasos de papel 240 cc" && snapshot.purchase.quantity === 500 && new Date(`${prepared.needed_by}T00:00:00Z`).getUTCDay() === 1);
  check("only examples carry the symbolic ARS 180/200 quotes", snapshot.quotes.every(row => row.source === "example" && row.call_id === null && row.source_url === null) && snapshot.quotes.map(row => row.price).sort().join(",") === "180,200");
  check("fictional suppliers cannot be called", snapshot.dnc);
  const replay = await runSurManifest(manifest);
  check("same manifest returns the same stable result", JSON.stringify(replay) === JSON.stringify(prepared));
  check("replay creates no additional rows or receipts", JSON.stringify(await counts()) === JSON.stringify(initial));
  await sql(`update public.companies set name='Destino incorrecto' where id=${quote(companies[0])}`);
  check("wrong company name blocks even cached replay", await rejected(manifest, "FORBIDDEN"));
  await sql(`update public.companies set name='Sur Insumos' where id=${quote(companies[0])}`);
  check("actor outside the company cannot seed", await rejected({ ...manifest, actor_id: users[1] }, "FORBIDDEN"));
  await sql(`update public.purchase_policies set auto_pay_limit_atomic=1 where company_id=${quote(companies[0])}`);
  check("policy enabling automatic spending blocks the seed", await rejected(manifest, "FORBIDDEN"));
  await sql(`update public.purchase_policies set auto_pay_limit_atomic=0 where company_id=${quote(companies[0])}`);
  const foreign = await supplierRpc(1, "upsertSupplier", liveInput);
  await supplierRpc(1, "setSupplierWallet", { contact_id: foreign.id, collection_wallet: { chain: "arbitrum", address: `0x${"Ab".repeat(20)}` }, expected_wallet_version: 0 });
  check("live slot cannot reference a supplier from another company", await rejected({ ...newSurManifest(companies[0], users[0], 40), existing_live_supplier_contact_id: foreign.id }, "NOT_FOUND"));
  let registered = await supplierRpc(0, "upsertSupplier", liveInput);
  registered = await supplierRpc(0, "setSupplierWallet", { contact_id: registered.id, collection_wallet: { chain: "arbitrum", address: `0x${"Cd".repeat(20)}` }, expected_wallet_version: 0 });
  const humanSnapshot = () => sql(`select jsonb_build_object('contact',to_jsonb(c),'profile',to_jsonb(s))::text from public.contacts c join public.supplier_profiles s on s.company_id=c.company_id and s.contact_id=c.id where c.id=${quote(registered.id)}`);
  const beforeHuman = await humanSnapshot();
  const liveManifest = { ...newSurManifest(companies[0], users[0], 50), existing_live_supplier_contact_id: registered.id, allow_local_placeholder: false };
  const ready = await runSurManifest(liveManifest);
  check("human-registered destination remains explicitly call-pending", ready.live_supplier_contact_id === registered.id && ready.live_slot_status === "human_supplier_registered_call_pending" && ready.live_quote_id === null);
  check("seed preserves existing human contact, wallet, version and DNC exactly", await humanSnapshot() === beforeHuman);
  check("live supplier receives no invented quote", Number(await sql(`select count(*) from public.supplier_quotes where supplier_contact_id=${quote(registered.id)}`)) === 0);
  check("changing the live slot under the same seed action conflicts", await rejected({ ...manifest, existing_live_supplier_contact_id: registered.id }, "CONFLICT"));
  registered = await supplierRpc(0, "setSupplierWallet", { contact_id: registered.id, collection_wallet: { chain: "base", address: `0x${"Cd".repeat(20)}` }, expected_wallet_version: registered.wallet_version });
  check("wrong collection network is rejected without changing it", await rejected({ ...newSurManifest(companies[0], users[0], 60), existing_live_supplier_contact_id: registered.id }, "FORBIDDEN") && (JSON.parse(await humanSnapshot()).profile.collection_chain === "base"));
  registered = await supplierRpc(0, "setSupplierWallet", { contact_id: registered.id, collection_wallet: { chain: "arbitrum", address: `0x${"Cd".repeat(20)}` }, expected_wallet_version: registered.wallet_version });
  await supplierRpc(0, "updateSupplier", { ...liveInput, contact_id: registered.id, do_not_contact: true });
  check("no-contact preference is rejected and never cleared", await rejected({ ...newSurManifest(companies[0], users[0], 60), existing_live_supplier_contact_id: registered.id }, "FORBIDDEN") && JSON.parse(await humanSnapshot()).contact.do_not_contact);
  const beforeRollback = await counts();
  const rollbackManifest = newSurManifest(companies[0], users[0], 80);
  const artifact = await readFile(new URL("./sur-insumos.sql", import.meta.url), "utf8");
  let rolledBack = false;
  try { await sql(`begin;set local tratunex_demo.input=${quote(JSON.stringify(rollbackManifest))};${artifact}\nselect 1/0;commit;`); }
  catch { rolledBack = true; }
  check("transaction failure rolls back fixture rows and the completed receipt together", rolledBack && JSON.stringify(await counts()) === JSON.stringify(beforeRollback));
  check("same rolled-back manifest succeeds after the cause is removed", (await runSurManifest(rollbackManifest)).purchase_request_id === rollbackManifest.purchase_request_id);
  console.log(`PASS ${assertions} isolated PostgreSQL Sur Insumos preparation checks`);
} finally {
  const ids = companies.map(quote).join(",");
  await sql(`delete from public.supplier_quotes where company_id in (${ids});delete from public.purchase_requests where company_id in (${ids});
    delete from public.purchase_policies where company_id in (${ids});delete from public.supplier_profiles where company_id in (${ids});
    delete from app_private.action_receipts where company_id in (${ids});delete from public.contacts where company_id in (${ids});
    delete from public.company_members where company_id in (${ids});delete from public.companies where id in (${ids});
    delete from auth.users where id in (${users.map(quote).join(",")});`);
}
