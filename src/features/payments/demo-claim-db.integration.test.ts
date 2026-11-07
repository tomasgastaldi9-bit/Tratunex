import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const exec = promisify(execFile), database = `pay_test_${randomUUID().replaceAll("-", "")}`;
const company = "b0000000-0000-4000-8000-000000000001", actor = "a0000000-0000-4000-8000-000000000001", order = "f0000000-0000-4000-8000-000000000001";
const sender = "0xd87f54a9bae54e4ee15a141d526532777f3d2c56", recipient = "0x4e5f932fa2d1be48a4fc39a80cd2ec85c8aa5bb1";
async function sql(db: string, command: string) {
  return (await exec("docker", ["exec", "supabase_db_TRATO", "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", db, "-c", command], { maxBuffer: 5_000_000 })).stdout.trim();
}
const claim = (action: string, caller = actor, target = order) => `set role service_role; select public.claim_demo_order_payment('${company}','${caller}','${target}','${action}',1,'${sender}',7);`;

describe.runIf(process.env.PAYMENT_DB_INTEGRATION === "1")("claim acotado de demo en Postgres aislado", () => {
  let created = false;
  beforeAll(async () => {
    await sql("postgres", `create database ${database}`); created = true;
    await sql(database, "create schema auth; create schema extensions; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;");
    for (const file of (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort()) await sql(database, await readFile(`supabase/migrations/${file}`, "utf8"));
    const fixture = await readFile("src/features/payments/database/payment-claim.integration.sql", "utf8");
    await sql(database, `${fixture.split("insert into public.calls")[0]} commit;`);
    await sql(database, `update public.supplier_profiles set collection_address='${recipient}' where company_id='${company}';
      update public.supplier_quotes set source='example',source_url=null where company_id='${company}';
      update public.purchase_orders set status='awaiting_approval',version=1,approved_by=null,approved_at=null,quote_source='example',wallet_address='${recipient}',
      quote_snapshot=c->'quote',request_snapshot=c->'request',supplier_snapshot=c->'supplier',policy_snapshot=c->'policy'
      from (select app_private.purchase_order_context('${company}','e0000000-0000-4000-8000-000000000001') c) snapshot where id='${order}';
      insert into app_private.demo_payment_authorizations(company_id,order_id,actor_id,sender,destination) values ('${company}','${order}','${actor}','${sender}','${recipient}');`);
  }, 90000);
  afterAll(async () => { if (created) await sql("postgres", `drop database ${database}`); }, 30000);
  it("limita el claim al servidor y al actor y orden autorizados", async () => {
    expect(await sql(database, "select has_function_privilege('authenticated','public.claim_demo_order_payment(uuid,uuid,uuid,text,integer,text,bigint)','execute');")).toBe("f");
    await expect(sql(database, claim("wrong-actor", randomUUID()))).rejects.toThrow();
    await expect(sql(database, claim("wrong-order", actor, randomUUID()))).rejects.toThrow();
  });
  it("la disponibilidad solo existe para la orden y el admin autorizados", async () => {
    expect(await sql(database, `set role service_role; select public.demo_order_authorized('${company}','${actor}','${order}');`)).toBe("t");
    expect(await sql(database, `set role service_role; select public.demo_order_authorized('${company}','${actor}','${randomUUID()}');`)).toBe("f");
    expect(await sql(database, `set role service_role; select public.demo_order_authorized('${company}','${randomUUID()}','${order}');`)).toBe("f");
    expect(await sql(database, "select has_function_privilege('authenticated','public.demo_order_authorized(uuid,uuid,uuid)','execute');")).toBe("f");
  });
  it("no permite autorizar una segunda orden de demo", async () => {
    await expect(sql(database, `insert into app_private.demo_payment_authorizations(company_id,order_id,actor_id,sender,destination) values ('${company}','${randomUUID()}','${actor}','${sender}','${recipient}');`)).rejects.toThrow();
  });
  it("rechaza desactivar el alcance, cambiar reglas, monto o emisor antes de reservar", async () => {
    const attempt = claim("not-allowed");
    for (const change of [
      `update app_private.demo_payment_authorizations set active=false where company_id='${company}';`,
      `update public.purchase_policies set max_per_purchase_atomic=2000000000000000000 where company_id='${company}';`,
      `update public.purchase_orders set amount_atomic=2000000000000000000 where id='${order}';`,
    ]) await expect(sql(database, `begin; ${change} ${attempt}`)).rejects.toThrow();
    await expect(sql(database, `set role service_role; select public.claim_demo_order_payment('${company}','${actor}','${order}','wrong-sender',1,'0x0000000000000000000000000000000000000001',7);`)).rejects.toThrow();
    expect(await sql(database, "select count(*) from app_private.payment_reservations;")).toBe("0");
  });
  it("si un refresh gana la carrera, el claim con la versión anterior se rechaza", async () => {
    const race = await Promise.allSettled([
      sql(database, `begin; update public.purchase_orders set version=version+1 where id='${order}'; select pg_sleep(1); commit;`),
      sql(database, `select pg_sleep(0.3); ${claim("stale-after-refresh")}`),
    ]);
    expect(race[0].status).toBe("fulfilled"); expect(race[1].status).toBe("rejected");
    expect(await sql(database, "select count(*) from app_private.payment_reservations;")).toBe("0");
    await sql(database, `update public.purchase_orders set version=1 where id='${order}';`);
  }, 30000);
  it("rechaza el claim ordinario de un ejemplo y conserva una sola reserva en carreras", async () => {
    await expect(sql(database, `set role service_role; select public.claim_order_payment('${company}','${actor}','${order}','ordinary',1,42161,'${sender}','0x59863989d080b22476db95656d0c3cc18be92214',7);`)).rejects.toThrow();
    const race = await Promise.allSettled([
      sql(database, `begin; select pg_sleep(0.3); ${claim("demo-a")} select pg_sleep(1); commit;`),
      sql(database, `select pg_sleep(0.6); update public.purchase_orders set version=version+1 where id='${order}';`),
      sql(database, `begin isolation level repeatable read; select count(*) from public.purchase_orders; select pg_sleep(0.6); update public.purchase_orders set version=version+1 where id='${order}'; commit;`),
    ]);
    expect(race[0].status).toBe("fulfilled"); expect(race[1].status).toBe("rejected"); expect(race[2].status).toBe("rejected");
    if (race[1].status === "rejected") expect(String(race[1].reason)).toContain("demo payment reservation is immutable");
    if (race[2].status === "rejected") expect(String(race[2].reason)).toContain("40001");
    if (race[0].status !== "fulfilled") throw new Error("demo claim failed");
    const a = JSON.parse(race[0].value.trim());
    const b = JSON.parse(await sql(database, claim("demo-b")));
    expect(a.id).toBe(b.id); expect(a.nonce).toBe(7); expect(a.amount_atomic).toBe("1000000000000000000");
    expect(await sql(database, "select count(*) from app_private.payment_reservations;")).toBe("1");
  }, 30000);
  it("una orden con reserva no puede modificarse ni borrarse", async () => {
    await expect(sql(database, `update public.purchase_orders set version=version+1 where id='${order}';`)).rejects.toThrow();
    await expect(sql(database, `delete from public.purchase_orders where id='${order}';`)).rejects.toThrow();
  });
});
