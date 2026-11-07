// Synthetic local scenario only. No live supplier, Vapi, wallet key or payment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

assert.equal(await sql("select current_database()"), "tratunex_contacts_verify");
const configPath = path.join(tmpdir(), "tratunex-contacts-local-api.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
assert.equal(config.apiUrl, "http://127.0.0.1:55440");
assert.ok(config.users?.length === 2 && config.users.every(user => /^Empresa CRM local [AB]$/.test(user.company_name)));
if (config.ord03) throw new Error("ORD-03 scenario already exists; use it instead of overwriting");
async function rpc(user, name, operation, input) {
  assert.ok(["suppliers_execute", "orders_execute"].includes(name));
  const ctx = { company_id: user.company_id, actor_type: "user", actor_id: user.id, action_id: randomUUID() };
  const result = JSON.parse(await asActor({ role: "authenticated", id: user.id },
    `select public.${name}(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}
const purchases = [];
const quotes = [];
for (const [index, user] of config.users.entries()) {
  const supplier = (await rpc(user, "suppliers_execute", "upsertSupplier", {
    name: `Proveedor ficticio ORD-03 ${index === 0 ? "A" : "B"}`, organization: "Datos de prueba",
    phone_e164: `+1202555011${index}`, website: null, source: { kind: "manual", label: "Datos de prueba", url: null },
  })).supplier;
  await rpc(user, "suppliers_execute", "setSupplierWallet", { contact_id: supplier.id,
    expected_wallet_version: supplier.wallet_version, collection_wallet: { chain: "arbitrum", address: `0x${"Ab".repeat(20)}` } });
  const purchase_id = randomUUID();
  await sql(`insert into public.purchase_requests(id,company_id,product,quantity,unit,needed_by,budget_atomic,zone,created_by)
    values(${quote(purchase_id)},${quote(user.company_id)},'Vasos ficticios - Datos de prueba',4,'unidades','2026-11-09',100000000000000000000,'CABA',${quote(user.id)});
    insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,allowed_supplier_ids,updated_by)
    values(${quote(user.company_id)},100000000000000000000,0,false,'{}',${quote(user.id)});`);
  purchases.push({ id: purchase_id, company_id: user.company_id });
  for (const currency of index === 0 ? ["ARS", "USD"] : ["ARS"]) {
    const quote_id = randomUUID();
    // source=example is compatible with QUO-02's current schema and visibly
    // fictional. ARS 1.25 x 4 -> ARGt 5 nominal; USD stays unresolved.
    await sql(`insert into public.supplier_quotes(id,company_id,purchase_request_id,supplier_contact_id,source,can_supply,unit_price,currency,
      available_quantity,minimum_order_quantity,lead_time_days,price_includes_vat,delivery_included,accepts_argt,summary)
      values(${quote(quote_id)},${quote(user.company_id)},${quote(purchase_id)},${quote(supplier.id)},'example','yes',1.25,${quote(currency)},
      100,1,1,'yes','yes','yes','Datos de prueba ORD-03; no es una oferta externa');`);
    quotes.push({ id: quote_id, company_id: user.company_id, currency });
  }
}
const quoteA = quotes.find(item => item.company_id === config.users[0].company_id && item.currency === "ARS");
const quoteUsd = quotes.find(item => item.currency === "USD");
const quoteB = quotes.find(item => item.company_id === config.users[1].company_id);
const pending = await rpc(config.users[0], "orders_execute", "createPurchaseOrder", { supplier_quote_id: quoteUsd.id });
const other = await rpc(config.users[1], "orders_execute", "createPurchaseOrder", { supplier_quote_id: quoteB.id });
config.ord03 = { purchase_requests: purchases, supplier_quotes: quotes, quote_a_ready_id: quoteA.id, quote_a_pending_id: quoteUsd.id,
  orders: [{ id: pending.order.id, company_id: pending.order.company_id }, { id: other.order.id, company_id: other.order.company_id }],
  order_b_id: other.order.id, quote_mode: "fictional-ARS-nominal-and-USD" };
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
console.log("Owned ORD-03 local scenario ready: nominal ARS and unresolved USD examples; no payment.");
