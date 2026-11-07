import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const exec = promisify(execFile), database = `pay_test_${randomUUID().replaceAll("-", "")}`;
const company = randomUUID(), actor = randomUUID();
async function sql(db: string, command: string) {
  return (await exec("docker", ["exec", "supabase_db_TRATO", "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db, "-c", command], { maxBuffer: 5_000_000 })).stdout.trim();
}
describe.runIf(process.env.PAYMENT_DB_INTEGRATION === "1")("preparación de datos ficticios en Postgres aislado", () => {
  let created = false, seed = "";
  beforeAll(async () => {
    await sql("postgres", `create database ${database}`); created = true;
    await sql(database, "create schema auth; create schema extensions; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;");
    for (const file of (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort()) await sql(database, await readFile(`supabase/migrations/${file}`, "utf8"));
    await sql(database, `insert into auth.users(id,email) values ('${actor}','tomasgastaldi9@gmail.com'); insert into public.companies(id,name) values ('${company}','Tratunex (empresa de prueba)'); insert into public.company_members(company_id,user_id,role) values ('${company}','${actor}','admin');`);
    seed = await readFile("scripts/prepare-payment-demo.sql", "utf8");
  }, 90000);
  afterAll(async () => { if (created) await sql("postgres", `drop database ${database}`); }, 30000);
  it("crea una sola orden ficticia inactiva sin reservas ni sobrescribe reglas", async () => {
    await sql(database, `insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic) values ('${company}',0,0);`);
    await expect(sql(database, seed)).rejects.toThrow();
    expect(await sql(database, "select count(*) from public.contacts;")).toBe("0");
    expect(await sql(database, "select max_per_purchase_atomic::text from public.purchase_policies;")).toBe("0");
    await sql(database, `delete from public.purchase_policies where company_id='${company}';`);
    await sql(database, seed);
    expect(await sql(database, "select source from public.supplier_quotes;")).toBe("example");
    expect(await sql(database, "select amount_atomic::text from public.purchase_orders;")).toBe("1000000000000000000");
    expect(await sql(database, "select active from app_private.demo_payment_authorizations;")).toBe("f");
    expect(await sql(database, "select count(*) from app_private.payment_reservations;")).toBe("0");
    await expect(sql(database, seed)).rejects.toThrow();
    expect(await sql(database, "select count(*) from public.purchase_orders;")).toBe("1");
  }, 30000);
});
