import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const exec = promisify(execFile), database = `pay_test_${randomUUID().replaceAll("-", "")}`;
const company = "b0000000-0000-4000-8000-000000000001", actor = "a0000000-0000-4000-8000-000000000001", order = "f0000000-0000-4000-8000-000000000001";
const sender = "0x0000000000000000000000000000000000000001", token = "0x59863989d080b22476db95656d0c3cc18be92214";
async function sql(db: string, command: string) {
  return (await exec("docker", ["exec", "supabase_db_TRATO", "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db, "-c", command], { maxBuffer: 5_000_000 })).stdout.trim();
}
const claim = (action: string) => `set role service_role; select public.claim_order_payment('${company}','${actor}','${order}','${action}',2,42161,'${sender}','${token}',7);`;

describe.runIf(process.env.PAYMENT_DB_INTEGRATION === "1")("aprobación y recuperación concurrentes", () => {
  let created = false;
  beforeAll(async () => {
    await sql("postgres", `create database ${database}`); created = true;
    await sql(database, "create schema auth; create schema extensions; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;");
    const files = (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort();
    for (const file of files) await sql(database, await readFile(`supabase/migrations/${file}`, "utf8"));
    const fixture = await readFile("src/features/payments/database/payment-claim.integration.sql", "utf8");
    await sql(database, `${fixture.split("insert into public.calls")[0]} commit;`);
    await sql(database, `update public.purchase_orders set status='awaiting_approval', version=1, approved_by=null, approved_at=null where id='${order}';`);
  }, 90000);
  afterAll(async () => { if (created) await sql("postgres", `drop database ${database}`); }, 30000);
  it("una recuperación simultánea nunca crea una segunda reserva o nonce", async () => {
    const ctx = JSON.stringify({ company_id: company, actor_id: actor, actor_type: "user", action_id: "approve-action" });
    const input = JSON.stringify({ order_id: order, expected_version: 1 });
    const approval = `set role authenticated; set request.jwt.claim.sub='${actor}'; select public.orders_execute('${ctx}'::jsonb,'approvePurchaseOrder','${input}'::jsonb);`;
    const race = await Promise.allSettled([sql(database, approval), sql(database, claim("resume-action"))]);
    expect(race[0].status).toBe("fulfilled");
    if (race[0].status === "fulfilled") expect(JSON.parse(race[0].value).ok).toBe(true);
    const [first, second] = await Promise.all([sql(database, claim("approve-action")), sql(database, claim("resume-action"))]);
    expect(JSON.parse(first).id).toBe(JSON.parse(second).id);
    expect(JSON.parse(first).nonce).toBe(7);
    expect(await sql(database, "select count(*) from app_private.payment_reservations;")).toBe("1");
  }, 30000);
});
