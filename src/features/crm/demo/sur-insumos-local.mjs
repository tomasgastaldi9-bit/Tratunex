// Local-only runner. The SQL artifact itself is reviewed/applied by Tomás.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql, quote } from "../verification/contacts-postgres-client.mjs";

export const DEMO_BUDGET_ATOMIC = "100000000000000000000000";
export function nextDemoMonday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = type => parts.find(value => value.type === type).value;
  const day = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const days = (8 - day.getUTCDay()) % 7 || 7;
  return new Date(day.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
export function newSurManifest(company_id, actor_id, phoneStart = 30) {
  if (!Number.isInteger(phoneStart) || phoneStart < 0 || phoneStart > 97) throw new Error("Reserved phone fixture range invalid");
  const phone = index => `+120255501${String(phoneStart + index).padStart(2, "0")}`;
  return { schema_version: "1", company_id, actor_id, seed_id: randomUUID(), purchase_request_id: randomUUID(),
    example_supplier_ids: [randomUUID(), randomUUID()], example_quote_ids: [randomUUID(), randomUUID()],
    example_phone_e164: [phone(0), phone(1)], needed_by: nextDemoMonday(), existing_live_supplier_contact_id: null,
    allow_local_placeholder: true, local_placeholder_supplier_id: randomUUID(), local_placeholder_phone_e164: phone(2) };
}
export async function runSurManifest(manifest) {
  assert.equal(await sql("select current_database()"), "tratunex_contacts_verify");
  const artifact = await readFile(new URL("./sur-insumos.sql", import.meta.url), "utf8");
  const result = await sql(`begin; set local tratunex_demo.input = ${quote(JSON.stringify(manifest))};
    ${artifact}\nselect current_setting('tratunex_demo.output'); commit;`);
  return JSON.parse(result);
}
