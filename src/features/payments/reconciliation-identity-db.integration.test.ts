import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const exec = promisify(execFile);
const database = `pay_test_${randomUUID().replaceAll("-", "")}`;
const company = randomUUID(), actor = randomUUID(), otherActor = randomUUID(), order = randomUUID(), reservation = randomUUID();
const hash = `0x${"a".repeat(64)}`;
const sender = `0x${"1".repeat(40)}`, destination = `0x${"2".repeat(40)}`;
async function sql(db: string, command: string) {
  return (await exec("docker", ["exec", "supabase_db_TRATO", "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db, "-c", command])).stdout.trim();
}

describe.runIf(process.env.PAYMENT_DB_INTEGRATION === "1")("identidad de conciliación en Postgres aislado", () => {
  let created = false;
  beforeAll(async () => {
    await sql("postgres", `create database ${database}`); created = true;
    const base = await readFile("supabase/migrations/20261107173800_reserve_payment_attempt.sql", "utf8");
    const mark = await readFile("supabase/migrations/20261107184833_mark_payment_broadcast.sql", "utf8");
    const identity = await readFile("supabase/migrations/20261107193005_read_payment_reconciliation_identity.sql", "utf8");
    await sql(database, `create schema app_private; create table public.companies(id uuid primary key); create table public.company_members(company_id uuid,user_id uuid); insert into public.companies values ('${company}'); insert into public.company_members values ('${company}','${actor}'); ${base} ${mark} ${identity}`);
    await sql(database, `insert into app_private.payment_reservations(id,company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic,state,tx_hash,signed_envelope) values ('${reservation}','${company}','${order}','original',42161,'${sender}',7,'0x59863989d080b22476db95656d0c3cc18be92214','${destination}','100','prepared','${hash}','{}');`);
  });
  afterAll(async () => { if (created) await sql("postgres", `drop database ${database}`); });
  it("no devuelve identidad antes de la marca de envío ni permite acceso directo a usuarios", async () => {
    const permission = await sql(database, "select has_function_privilege('authenticated','public.read_payment_reconciliation_identity(uuid,uuid,uuid)','execute');");
    expect(permission).toBe("f");
    expect(await sql(database, `set role service_role; select public.read_payment_reconciliation_identity('${company}','${actor}','${order}');`)).toBe("");
  });
  it("devuelve solo la identidad de la reserva marcada y exige membresía", async () => {
    await sql(database, `insert into app_private.payment_broadcast_marks(reservation_id,tx_hash) values ('${reservation}','${hash}');`);
    const row = JSON.parse(await sql(database, `set role service_role; select public.read_payment_reconciliation_identity('${company}','${actor}','${order}');`));
    expect(row).toMatchObject({ id: reservation, action_id: "original", nonce: 7, destination, amount_atomic: "100" });
    expect(JSON.stringify(row)).not.toContain("signed_envelope");
    await expect(sql(database, `set role service_role; select public.read_payment_reconciliation_identity('${company}','${otherActor}','${order}');`)).rejects.toThrow();
  });
});
