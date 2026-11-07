// Local comparison scenario: every supplier/quote is fictional. No calls,
// external web requests, model API, wallet key or payment is used by this seed.
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
if (config.ord02) throw new Error("ORD-02 scenario already exists; reuse it instead of overwriting");
for (const user of config.users) {
  assert.match(user.id, /^[0-9a-f-]{36}$/i);
  assert.match(user.company_id, /^[0-9a-f-]{36}$/i);
  assert.equal(await sql(`select name from public.companies where id=${quote(user.company_id)}`), user.company_name);
}
const ownedQuoteMarkers = [
  "ORD03 standalone future-ARGt quote verification fixture; NOT QUO-02 integration",
  "ORD02 standalone comparator verification fixture; NOT hosted provider integration",
];
if (await sql("select to_regclass('public.supplier_quotes') is null") === "t") {
  await sql(`create table public.supplier_quotes (
    id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
    purchase_request_id uuid references public.purchase_requests(id),supplier_contact_id uuid not null,call_id uuid,
    source text not null check(source in ('call','web','example')),source_url text,
    can_supply text not null check(can_supply in ('yes','partial','no','unknown')),
    unit_price numeric(14,2) check(unit_price is null or unit_price>0),currency text check(currency in ('ARS','USD','unknown')),
    price_includes_vat text,available_quantity integer,minimum_order_quantity integer,lead_time_days integer,lead_time_text text,
    delivery_included text,accepts_argt text not null,payment_terms text,notes text,summary text not null,
    created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
    unique(company_id,id),foreign key(company_id,supplier_contact_id) references public.contacts(company_id,id),unique(call_id),
    check((source='call')=(call_id is not null)),check((source='web')=(source_url is not null)));
    comment on table public.supplier_quotes is ${quote(ownedQuoteMarkers[1])};
    alter table public.supplier_quotes enable row level security;
    revoke all on public.supplier_quotes from public,anon,authenticated,service_role;
    grant select on public.supplier_quotes to authenticated,service_role;
    create policy comparator_fixture_quote_read on public.supplier_quotes for select to authenticated
      using(exists(select 1 from public.company_members m where m.company_id=supplier_quotes.company_id and m.user_id=(select auth.uid())));`);
} else {
  assert.ok(ownedQuoteMarkers.includes(await sql("select obj_description('public.supplier_quotes'::regclass)")),
    "Existing quote table is not an owned local fixture; refusing schema changes");
  if (await sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='supplier_quotes' and column_name='source_url')") === "f") {
    // Do not rewrite previous rows or add a new constraint to historical fixtures.
    await sql("alter table public.supplier_quotes add column source_url text");
  }
}
if (await sql("select to_regclass('public.calls') is null") === "t") {
  await sql(`create table public.calls (
    id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),contact_id uuid not null,
    deal_id uuid,source_task_id uuid,action_id text not null,provider text not null default 'mock',provider_call_id text,
    transport text not null check(transport in ('mock','web','phone')),status text not null default 'queued',objective text,
    agent_version integer,ended_reason text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
    unique(company_id,id),unique(company_id,action_id),unique(provider,provider_call_id),
    foreign key(company_id,contact_id) references public.contacts(company_id,id));
    comment on table public.calls is 'ORD02 standalone calls read fixture; no external calls';
    alter table public.calls enable row level security;
    revoke all on public.calls from public,anon,authenticated,service_role;
    grant select on public.calls to authenticated,service_role;
    create policy comparator_fixture_call_read on public.calls for select to authenticated
      using(exists(select 1 from public.company_members m where m.company_id=calls.company_id and m.user_id=(select auth.uid())));`);
}
assert.equal(await sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='calls' and column_name='transport')"), "t");
async function rpc(user, operation, input) {
  const ctx = { company_id: user.company_id, actor_type: "user", actor_id: user.id, action_id: randomUUID() };
  const result = JSON.parse(await asActor({ role: "authenticated", id: user.id },
    `select public.suppliers_execute(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}
const neededBy = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const purchases = [];
const quotes = [];
const suppliers = [];
for (const [index, user] of config.users.entries()) {
  const purchase_id = randomUUID();
  await sql(`insert into public.purchase_requests(id,company_id,product,quantity,unit,needed_by,budget_atomic,zone,created_by)
    values(${quote(purchase_id)},${quote(user.company_id)},${quote(`Comparador ORD-02 - Datos de prueba ${index === 0 ? "A" : "B"}`)},4,'unidades',${quote(neededBy)},1000000000000000000000,'CABA',${quote(user.id)});
    insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,allowed_supplier_ids,updated_by)
    values(${quote(user.company_id)},1000000000000000000000,0,false,'{}',${quote(user.id)});`);
  purchases.push({ id: purchase_id, company_id: user.company_id });
  const offers = index === 0 ? [
    { label: "Web ficticia", source: "web", source_url: "https://proveedor-ord02.example/cotizacion", price: "12.50", currency: "ARS", stock: 100, days: 1 },
    { label: "Ejemplo confirmado", source: "example", source_url: null, price: "15.00", currency: "ARS", stock: 100, days: 2 },
    { label: "Ejemplo sin confirmar", source: "example", source_url: null, price: null, currency: "USD", stock: null, days: null },
  ] : [
    { label: "Ejemplo de empresa B", source: "example", source_url: null, price: "20.00", currency: "ARS", stock: 100, days: 1 },
  ];
  for (const [offerIndex, offer] of offers.entries()) {
    const supplier = (await rpc(user, "upsertSupplier", {
      name: `Datos de prueba: ${offer.label}`, organization: "Proveedor ficticio ORD-02",
      phone_e164: `+1202555012${offerIndex}`, website: offer.source_url,
      source: { kind: "manual", label: "Datos de prueba", url: null },
    })).supplier;
    await rpc(user, "setSupplierWallet", { contact_id: supplier.id, expected_wallet_version: supplier.wallet_version,
      collection_wallet: { chain: "arbitrum", address: `0x${"Ab".repeat(20)}` } });
    suppliers.push({ id: supplier.id, company_id: user.company_id, label: offer.label });
    const quote_id = randomUUID();
    await sql(`insert into public.supplier_quotes(id,company_id,purchase_request_id,supplier_contact_id,source,source_url,can_supply,
      unit_price,currency,price_includes_vat,available_quantity,minimum_order_quantity,lead_time_days,lead_time_text,delivery_included,
      accepts_argt,payment_terms,notes,summary)
      values(${quote(quote_id)},${quote(user.company_id)},${quote(purchase_id)},${quote(supplier.id)},${quote(offer.source)},${quote(offer.source_url)},
      ${quote(offer.price === null ? "unknown" : "yes")},${quote(offer.price)},${quote(offer.currency)},${quote(offer.price === null ? "unknown" : "yes")},
      ${quote(offer.stock)},${offer.price === null ? "null" : "1"},${quote(offer.days)},null,'unknown',${quote(offer.price === null ? "unknown" : "yes")},null,
      'Datos de prueba; sin consulta web ni llamada externa','Datos de prueba ORD-02; fuente ficticia para verificacion local');`);
    quotes.push({ id: quote_id, company_id: user.company_id, purchase_request_id: purchase_id, supplier_contact_id: supplier.id,
      source: offer.source, currency: offer.currency, has_price: offer.price !== null });
  }
}
config.purchase_requests = purchases;
config.ord02 = { purchase_requests: purchases, supplier_quotes: quotes, suppliers,
  purchase_a_id: purchases[0].id, purchase_b_id: purchases[1].id,
  quote_a_web_id: quotes[0].id, quote_a_example_id: quotes[1].id, quote_a_unknown_id: quotes[2].id,
  expected_recommended_quote_id: quotes[0].id, expected_eligible_quote_ids: [quotes[0].id, quotes[1].id],
  needed_by: neededBy, quote_mode: "all-fictional-two-examples-one-web-example-url", explanation_mode: "rules-without-model-key" };
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
console.log("Owned ORD-02 comparator scenario ready: 2 eligible ARS quotes, 1 unknown USD example, isolated company B; no external calls or payments.");
