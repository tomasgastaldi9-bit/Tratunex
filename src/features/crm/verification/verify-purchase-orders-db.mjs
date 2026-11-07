import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

// Node's TS stripping does not resolve Next's extensionless relative imports.
// Keep this narrow test-only resolver confined to the published CRM contract.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./crm" && context.parentURL?.endsWith("/contracts/purchase-orders.ts")) {
    return nextResolve(new URL("./crm.ts", context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
} });
const { PurchaseOrderSchema } = await import("../../../contracts/purchase-orders.ts");

const fixtureMarker = "ORD03 standalone future-ARGt quote verification fixture; NOT QUO-02 integration";
assert.equal(await sql("select current_database()"), "tratunex_contacts_verify");
if (await sql("select to_regclass('public.supplier_quotes') is null") === "t") {
  // Only an absent table in the isolated database may receive this substitute.
  // QUO-02 currently has numeric(14,2) and ARS/USD; ARGt here tests a FUTURE shape.
  await sql(`create table public.supplier_quotes (
    id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
    purchase_request_id uuid references public.purchase_requests(id), supplier_contact_id uuid not null,
    call_id uuid, source text not null check(source in ('call','web','example')),
    can_supply text not null check(can_supply in ('yes','partial','no','unknown')),
    unit_price numeric check(unit_price is null or unit_price>0),
    currency text check(currency in ('ARS','USD','ARGt','unknown')),
    price_includes_vat text check(price_includes_vat in ('yes','no','unknown')),
    available_quantity integer check(available_quantity is null or available_quantity>=0),
    minimum_order_quantity integer check(minimum_order_quantity is null or minimum_order_quantity>=0),
    lead_time_days integer check(lead_time_days is null or lead_time_days between 0 and 365), lead_time_text text,
    delivery_included text check(delivery_included in ('yes','no','unknown')),
    accepts_argt text not null check(accepts_argt in ('yes','no','unknown')), payment_terms text, notes text, summary text not null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique(company_id,id), foreign key(company_id,supplier_contact_id) references public.contacts(company_id,id),
    unique(call_id),check((source='call')=(call_id is not null)));
    comment on table public.supplier_quotes is ${quote(fixtureMarker)};
    alter table public.supplier_quotes enable row level security;
    revoke all on public.supplier_quotes from public,anon,authenticated,service_role;
    grant select on public.supplier_quotes to authenticated,service_role;
    create policy orders_fixture_quote_member_read on public.supplier_quotes for select to authenticated
      using(exists(select 1 from public.company_members m where m.company_id=supplier_quotes.company_id and m.user_id=(select auth.uid())));`);
} else {
  assert.equal(await sql("select obj_description('public.supplier_quotes'::regclass)"), fixtureMarker,
    "Existing quotes table is not this owned fixture; refusing to alter it or inject future ARGt quotes");
}
if (await sql("select to_regclass('public.purchase_orders') is null") === "t") {
  await sql(await readFile(new URL("../database/purchase-orders.sql", import.meta.url), "utf8"));
}
const companies = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID(), randomUUID()];
const actor = { role: "authenticated", id: users[0] };
const other = { role: "authenticated", id: users[1] };
const seller = { role: "authenticated", id: users[2] };
const context = (action_id = randomUUID(), index = 0) => ({ company_id: companies[index], actor_type: "user", actor_id: users[index], action_id });
const sellerContext = () => ({ ...context(), actor_id: users[2] });
const maxAtomic = (2n ** 256n - 1n).toString();
const wallet = { chain: "arbitrum", address: `0x${"Ab".repeat(20)}` };
let assertions = 0;
let triggerInstalled = false;
const triggerName = `order_verify_${randomUUID().replaceAll("-", "")}`;
const check = (name, condition) => { assert.ok(condition, name); assertions++; console.log(`PASS ${name}`); };
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
const failed = (result, code) => !result.ok && result.error.code === code;
async function rpc(auth, ctx, operation, input, name = "orders_execute") {
  if (!["orders_execute", "suppliers_execute"].includes(name)) throw new Error("Unexpected RPC");
  return JSON.parse(await asActor(auth, `select public.${name}(${quote(JSON.stringify(ctx))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
}
const counts = async () => JSON.parse(await sql(`select jsonb_build_object(
  'orders',(select count(*) from public.purchase_orders where company_id=${quote(companies[0])}),
  'receipts',(select count(*) from app_private.action_receipts where company_id=${quote(companies[0])}))::text`));
const purchaseIds = [randomUUID(),randomUUID()];
const supplierIds = [];
async function insertQuote(changes = {}, index = 0) {
  const row = { id: randomUUID(), company_id: companies[index], purchase_request_id: purchaseIds[index], supplier_contact_id: supplierIds[index],
    source: "web", can_supply: "yes", unit_price: "1.000000000000000001", currency: "ARGt", accepts_argt: "yes", summary: "Owned ORD03 fixture; not an external quote", ...changes };
  const keys = Object.keys(row);
  assert.ok(keys.every(key => /^[a-z_]+$/.test(key)));
  await sql(`insert into public.supplier_quotes(${keys.join(",")}) values(${keys.map(key => quote(row[key])).join(",")})`);
  return row.id;
}
const create = async id => success(await rpc(actor, context(), "createPurchaseOrder", { supplier_quote_id: id })).order;
const approve = (order, auth = actor, ctx = context()) => rpc(auth, ctx, "approvePurchaseOrder", { order_id: order.id, expected_version: order.version });
const refresh = async order => success(await rpc(actor, context(), "refreshPurchaseOrder", { order_id: order.id, expected_version: order.version })).order;
await sql(`insert into auth.users(id,email) values ${users.map(id => `(${quote(id)},${quote(`${id}@example.test`)})`).join(",")};
  insert into public.companies(id,name) values (${quote(companies[0])},'ORD03 verification A'),(${quote(companies[1])},'ORD03 verification B');
  insert into public.company_members(company_id,user_id,role) values (${quote(companies[0])},${quote(users[0])},'admin'),(${quote(companies[1])},${quote(users[1])},'admin'),(${quote(companies[0])},${quote(users[2])},'vendedor');`);
try {
  for (const index of [0,1]) {
    const userActor = index === 0 ? actor : other;
    const supplier = success(await rpc(userActor, context(undefined,index), "upsertSupplier", { name: `ORD03 supplier ${index}`,organization: null,
      phone_e164: "+12025550141",website: null,source: { kind: "manual",label: "Owned ORD03 fixture",url: null } }, "suppliers_execute")).supplier;
    supplierIds[index] = supplier.id;
    success(await rpc(userActor, context(undefined,index), "setSupplierWallet", { contact_id: supplier.id,collection_wallet: wallet,expected_wallet_version: 0 }, "suppliers_execute"));
    await sql(`insert into public.purchase_requests(id,company_id,product,quantity,unit,needed_by,budget_atomic,zone,created_by)
      values(${quote(purchaseIds[index])},${quote(companies[index])},'ORD03 product',3,'units','2026-11-09',${quote(maxAtomic)},'Local',${quote(users[index])});
      insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,allowed_supplier_ids,updated_by)
      values(${quote(companies[index])},${quote(maxAtomic)},0,false,'{}',${quote(users[index])});`);
  }
  const arsQuote = await insertQuote({ unit_price: "900719925474.01",currency: "ARS" });
  const action = randomUUID();
  const results = await Promise.all(Array.from({length:8},() => rpc(actor,context(action),"createPurchaseOrder",{supplier_quote_id:arsQuote})));
  check("eight concurrent requests replay one order snapshot",results.every(result=>result.ok && JSON.stringify(result)===JSON.stringify(results[0])));
  const arsOrder = success(results[0]).order;
  check("ARS price and exact total stay decimal strings",arsOrder.quoted_unit_price==="900719925474.01" && arsOrder.quoted_total==="2702159776422.03");
  check("ARS never assumes a conversion or payable ARGt amount",arsOrder.amount_atomic===null && arsOrder.pricing_status==="pending_conversion" && arsOrder.status==="awaiting_approval");
  check("created order conforms to public DTO",PurchaseOrderSchema.safeParse(arsOrder).success);
  const dedup = await Promise.all(Array.from({length:4},()=>rpc(actor,context(),"createPurchaseOrder",{supplier_quote_id:arsQuote})));
  check("different actions still produce one order for the quote",dedup.every(result=>result.ok && !result.data.created && result.data.order.id===arsOrder.id));
  check("unconverted ARS order cannot be approved",failed(await approve(arsOrder),"FORBIDDEN"));
  const usdOrder = await create(await insertQuote({currency:"USD",unit_price:"0.11"}));
  check("USD remains pending with exact total and no implicit conversion",usdOrder.quoted_total==="0.33" && usdOrder.amount_atomic===null && usdOrder.pricing_status==="pending_conversion");
  const argtQuote = await insertQuote();
  let order = await create(argtQuote);
  check("future ARGt fixture preserves all 18 decimals",order.quoted_total==="3.000000000000000003" && order.amount_atomic==="3000000000000000003" && order.pricing_status==="ready");
  check("client cannot choose price wallet identity or policy",failed(await rpc(actor,context(),"createPurchaseOrder",{supplier_quote_id:argtQuote,amount_atomic:"1"}),"VALIDATION_ERROR"));
  check("seller can create but cannot approve or refresh",success(await rpc(seller,sellerContext(),"createPurchaseOrder",{supplier_quote_id:argtQuote})).order.id===order.id && failed(await approve(order,seller,sellerContext()),"FORBIDDEN") && failed(await rpc(seller,sellerContext(),"refreshPurchaseOrder",{order_id:order.id,expected_version:order.version}),"FORBIDDEN"));
  success(await rpc(actor,context(),"setSupplierWallet",{contact_id:supplierIds[0],collection_wallet:{...wallet,address:`0x${"Cd".repeat(20)}`},expected_wallet_version:1},"suppliers_execute"));
  check("changed wallet blocks approval",failed(await approve(order),"CONFLICT"));
  check("create existing order does not silently refresh its snapshot",(await create(argtQuote)).wallet_version===1);
  order = await refresh(order);
  check("explicit refresh retains ID and takes new wallet version",order.wallet_version===2 && order.version===2);
  await sql(`update public.supplier_quotes set unit_price=2.000000000000000001,updated_at=clock_timestamp() where id=${quote(argtQuote)}`);
  check("changed quote blocks approval",failed(await approve(order),"CONFLICT"));
  order = await refresh(order);
  check("refresh snapshots exact updated quote total",order.quoted_total==="6.000000000000000003" && order.version===3);
  await sql(`update public.purchase_requests set quantity=4 where id=${quote(purchaseIds[0])}`);
  check("changed purchase blocks approval",failed(await approve(order),"CONFLICT"));
  order = await refresh(order);
  check("refresh uses actual purchase quantity not client quantity",order.quantity===4 && order.amount_atomic==="8000000000000000004");
  await sql(`update public.purchase_policies set auto_pay_limit_atomic=1,updated_at=clock_timestamp() where company_id=${quote(companies[0])}`);
  check("changed policy blocks approval",failed(await approve(order),"CONFLICT"));
  order = await refresh(order);
  const supplier = success(await rpc(actor,context(),"getSupplier",{contact_id:supplierIds[0]},"suppliers_execute")).supplier;
  success(await rpc(actor,context(),"updateSupplier",{contact_id:supplier.id,name:"Updated ORD03 supplier",organization:null,phone_e164:supplier.phone_e164,website:null,source:supplier.source},"suppliers_execute"));
  check("changed supplier metadata blocks approval",failed(await approve(order),"CONFLICT"));
  order = await refresh(order);
  const approveAction = randomUUID();
  const approveInput = {order_id:order.id,expected_version:order.version};
  const beforeRace = await counts();
  const race = await Promise.all([rpc(actor,context(approveAction),"approvePurchaseOrder",approveInput),approve(order)]);
  check("approval race has one winner and one conflict",race.filter(result=>result.ok).length===1 && race.filter(result=>failed(result,"CONFLICT")).length===1);
  check("conflicting approval leaves no receipt",(await counts()).receipts===beforeRace.receipts+1);
  const winner = success(race.find(result=>result.ok)).order;
  check("approval records admin and UTC without recording payment",winner.status==="approved" && winner.approved_by===users[0] && /Z$/.test(winner.approved_at) && !Object.hasOwn(winner,"payment"));
  check("approved DTO remains valid",PurchaseOrderSchema.safeParse(winner).success);
  check("approved order cannot refresh",failed(await rpc(actor,context(),"refreshPurchaseOrder",{order_id:winner.id,expected_version:winner.version}),"CONFLICT"));
  check("approved order cannot approve again with another action",failed(await approve(winner),"CONFLICT"));
  if(race[0].ok) check("same approval action replays its exact result",JSON.stringify(await rpc(actor,context(approveAction),"approvePurchaseOrder",approveInput))===JSON.stringify(race[0]));
  else check("winner survives a subsequent read",success(await rpc(actor,context(),"getPurchaseOrder",{order_id:winner.id})).order.status==="approved");

  for(const [changes,label] of [[{source:"example"},"example source"],[{accepts_argt:"no"},"ARGt not accepted"],[{can_supply:"no"},"cannot supply"],[{available_quantity:1},"insufficient stock"],[{minimum_order_quantity:100},"minimum order too large"]]) {
    check(`approval rejects ${label}`,failed(await approve(await create(await insertQuote(changes))),"FORBIDDEN"));
  }
  success(await rpc(actor,context(),"setSupplierWallet",{contact_id:supplierIds[0],collection_wallet:{...wallet,chain:"base"},expected_wallet_version:2},"suppliers_execute"));
  check("Base wallet is not approved for the Arbitrum payment route",failed(await approve(await create(await insertQuote())),"FORBIDDEN"));
  success(await rpc(actor,context(),"setSupplierWallet",{contact_id:supplierIds[0],collection_wallet:wallet,expected_wallet_version:3},"suppliers_execute"));
  await sql(`delete from public.purchase_policies where company_id=${quote(companies[0])}`);
  const withoutPolicy = await create(await insertQuote());
  check("missing policy never authorizes approval",failed(await approve(withoutPolicy),"FORBIDDEN"));
  await sql(`insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic,only_allowed_suppliers,allowed_supplier_ids,updated_by)
    values(${quote(companies[0])},${quote(maxAtomic)},0,false,'{}',${quote(users[0])})`);
  check("new policy after snapshot requires explicit refresh",failed(await approve(withoutPolicy),"CONFLICT"));
  check("refresh can recover a still-pending order after policy setup",(await refresh(withoutPolicy)).version===2);
  await sql(`update public.purchase_policies set max_per_purchase_atomic=1 where company_id=${quote(companies[0])}`);
  check("server policy maximum blocks approval",failed(await approve(await create(await insertQuote())),"FORBIDDEN"));
  await sql(`update public.purchase_policies set max_per_purchase_atomic=${quote(maxAtomic)},only_allowed_suppliers=true,allowed_supplier_ids='{}' where company_id=${quote(companies[0])}`);
  check("server supplier allowlist blocks approval",failed(await approve(await create(await insertQuote())),"FORBIDDEN"));
  await sql(`update public.purchase_policies set only_allowed_suppliers=false where company_id=${quote(companies[0])};
    update public.purchase_requests set budget_atomic=1 where id=${quote(purchaseIds[0])}`);
  check("purchase budget independently blocks approval",failed(await approve(await create(await insertQuote())),"FORBIDDEN"));
  await sql(`update public.purchase_requests set budget_atomic=${quote(maxAtomic)},quantity=1 where id=${quote(purchaseIds[0])}`);
  const toDecimal = amount => `${amount/10n**18n}.${(amount%10n**18n).toString().padStart(18,"0")}`;
  const boundary = await create(await insertQuote({unit_price:toDecimal(BigInt(maxAtomic))}));
  check("maximum uint256 amount is preserved exactly",boundary.amount_atomic===maxAtomic);
  const beforeInvalid = await counts();
  for(const changes of [{unit_price:toDecimal(BigInt(maxAtomic)+1n)},{unit_price:"0.0000000000000000001"},{unit_price:null},{currency:"unknown"}]) {
    check("invalid or inexact settlement amount is rejected",failed(await rpc(actor,context(),"createPurchaseOrder",{supplier_quote_id:await insertQuote(changes)}),"VALIDATION_ERROR"));
  }
  check("invalid order leaves no row or action receipt",JSON.stringify(await counts())===JSON.stringify(beforeInvalid));
  const otherQuote = await insertQuote({},1);
  const otherOrder = success(await rpc(other,context(undefined,1),"createPurchaseOrder",{supplier_quote_id:otherQuote})).order;
  check("foreign quote cannot create an order",failed(await rpc(actor,context(),"createPurchaseOrder",{supplier_quote_id:otherQuote}),"NOT_FOUND"));
  check("foreign order remains hidden on get",failed(await rpc(actor,context(),"getPurchaseOrder",{order_id:otherOrder.id}),"NOT_FOUND"));
  check("foreign order cannot be approved",failed(await rpc(actor,context(),"approvePurchaseOrder",{order_id:otherOrder.id,expected_version:1}),"NOT_FOUND"));
  check("forged actor cannot receive a cached creation",failed(await rpc(other,context(action),"createPurchaseOrder",{supplier_quote_id:arsQuote}),"FORBIDDEN"));
  const workerContext = {...context(),actor_type:"system"};
  check("SQL service role can read but cannot create orders",success(await rpc({role:"service_role"},workerContext,"getPurchaseOrder",{order_id:arsOrder.id})).order.id===arsOrder.id && failed(await rpc({role:"service_role"},workerContext,"createPurchaseOrder",{supplier_quote_id:argtQuote}),"FORBIDDEN"));
  check("JSON role claim does not grant service authority",failed(await rpc({...actor,claims:{role:"service_role"}},workerContext,"getPurchaseOrder",{order_id:arsOrder.id}),"FORBIDDEN"));
  const list = success(await rpc(actor,context(),"listPurchaseOrders",{limit:100})).items;
  check("list only returns company-owned valid order DTOs",list.every(row=>row.company_id===companies[0] && PurchaseOrderSchema.safeParse(row).success));
  check("list rejects client authority and excessive limits",failed(await rpc(actor,context(),"listPurchaseOrders",{company_id:companies[1]}),"VALIDATION_ERROR") && failed(await rpc(actor,context(),"listPurchaseOrders",{limit:101}),"VALIDATION_ERROR"));
  const rls = JSON.parse(await asActor(other,"select coalesce(jsonb_agg(id),'[]'::jsonb)::text from public.purchase_orders"));
  check("RLS only exposes the member's company order",rls.length===1 && rls[0]===otherOrder.id);
  const acl = JSON.parse(await sql(`select jsonb_build_object('anon',has_function_privilege('anon','public.orders_execute(jsonb,text,jsonb)','execute'),
    'helper',has_function_privilege('authenticated','app_private.purchase_order_context(uuid,uuid)','execute'),
    'write',has_table_privilege('authenticated','public.purchase_orders','update'),'service_write',has_table_privilege('service_role','public.purchase_orders','insert'))::text`));
  check("anonymous and helper execution stay denied",!acl.anon && !acl.helper);
  check("direct order writes stay denied even to service role",!acl.write && !acl.service_write);
  const beforeRollback = await counts();
  const rollbackQuote = await insertQuote();
  await sql(`begin;set local role authenticated;set local request.jwt.claims=${quote(JSON.stringify({sub:users[0],role:"authenticated"}))};
    select public.orders_execute(${quote(JSON.stringify(context()))}::jsonb,'createPurchaseOrder',${quote(JSON.stringify({supplier_quote_id:rollbackQuote}))}::jsonb);rollback;`);
  check("rollback reverts order and receipt together",JSON.stringify(await counts())===JSON.stringify(beforeRollback));
  await sql(`create function app_private.${triggerName}() returns trigger language plpgsql set search_path='' as $$ begin if new.company_id=${quote(companies[0])}::uuid then raise exception 'Owned order fixture write failure';end if;return new;end $$;
    create trigger ${triggerName} before insert on public.purchase_orders for each row execute function app_private.${triggerName}()`);
  triggerInstalled = true;
  check("forced insert failure is explicit",failed(await rpc(actor,context(),"createPurchaseOrder",{supplier_quote_id:rollbackQuote}),"PROVIDER_ERROR"));
  check("forced failure commits no receipt or partial order",JSON.stringify(await counts())===JSON.stringify(beforeRollback));
  await sql(`drop trigger ${triggerName} on public.purchase_orders;drop function app_private.${triggerName}()`);
  triggerInstalled = false;
  await sql(`update public.company_members set role='vendedor' where company_id=${quote(companies[0])} and user_id=${quote(users[0])}`);
  check("demoted admin cannot approve or refresh",failed(await approve(withoutPolicy),"FORBIDDEN") && failed(await rpc(actor,context(),"refreshPurchaseOrder",{order_id:withoutPolicy.id,expected_version:withoutPolicy.version}),"FORBIDDEN"));
  await sql(`delete from public.company_members where company_id=${quote(companies[0])} and user_id=${quote(users[0])}`);
  check("revoked membership blocks cached creation result",failed(await rpc(actor,context(action),"createPurchaseOrder",{supplier_quote_id:arsQuote}),"FORBIDDEN"));
  console.log(`PASS ${assertions} PostgreSQL purchase order checks (future ARGt quote fixture only)`);
} finally {
  if(triggerInstalled) await sql(`drop trigger ${triggerName} on public.purchase_orders;drop function app_private.${triggerName}()`);
  const ids = companies.map(quote).join(",");
  await sql(`delete from public.purchase_orders where company_id in (${ids});delete from public.supplier_quotes where company_id in (${ids});
    delete from public.purchase_policies where company_id in (${ids});delete from public.purchase_requests where company_id in (${ids});
    delete from public.supplier_profiles where company_id in (${ids});delete from app_private.action_receipts where company_id in (${ids});
    delete from public.contacts where company_id in (${ids});delete from public.company_members where company_id in (${ids});
    delete from public.companies where id in (${ids});delete from auth.users where id in (${users.map(quote).join(",")});`);
}
