// Uses only the owned loopback Auth fixture and isolated PostgreSQL database.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql, quote } from "./contacts-postgres-client.mjs";
import { DEMO_BUDGET_ATOMIC, newSurManifest, runSurManifest } from "../demo/sur-insumos-local.mjs";

assert.equal(await sql("select current_database()"), "tratunex_contacts_verify");
const configPath = path.join(tmpdir(), "tratunex-contacts-local-api.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
assert.equal(config.apiUrl, "http://127.0.0.1:55440");
const user = config.users?.[0];
assert.ok(user && ["Empresa CRM local A", "Sur Insumos"].includes(user.company_name), "Start a fresh owned HTTP fixture first");
assert.equal(await sql(`select name from public.companies where id=${quote(user.company_id)}`), user.company_name);
if (user.company_name !== "Sur Insumos") {
  const used = Number(await sql(`select (select count(*) from public.contacts where company_id=${quote(user.company_id)})
    +(select count(*) from public.purchase_requests where company_id=${quote(user.company_id)})
    +(select count(*) from public.purchase_policies where company_id=${quote(user.company_id)})`));
  assert.equal(used, 0, "Only the fresh empty local fixture company can become Sur Insumos");
  await sql(`begin; update public.companies set name='Sur Insumos' where id=${quote(user.company_id)} and name='Empresa CRM local A';
    insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,allowed_supplier_ids,updated_by)
    values(${quote(user.company_id)},${quote(DEMO_BUDGET_ATOMIC)},0,false,'{}',${quote(user.id)}); commit;`);
  user.company_name = "Sur Insumos";
  // Keep the owned Auth fixture consistent if a later guarded seed is rejected.
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
}
const manifest = config.ord04?.manifest ?? newSurManifest(user.company_id, user.id);
assert.equal(manifest.company_id, user.company_id);
assert.equal(manifest.actor_id, user.id);
if (process.env.SUR_DEMO_EXISTING_LIVE_SUPPLIER_CONTACT_ID) {
  manifest.existing_live_supplier_contact_id = process.env.SUR_DEMO_EXISTING_LIVE_SUPPLIER_CONTACT_ID;
}
const prepared = await runSurManifest(manifest);
config.ord04 = { manifest, ...prepared, scenario: "sur-insumos-preparation-only" };
config.purchase_requests = [{ id: prepared.purchase_request_id, company_id: user.company_id }];
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
console.log(JSON.stringify({ scenario: config.ord04.scenario, company_id: user.company_id, purchase_request_id: prepared.purchase_request_id,
  live_slot_status: prepared.live_slot_status, call_started: false, payment_started: false }));
