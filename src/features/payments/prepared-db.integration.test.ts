import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
import { createPreparedStore } from "./prepared-store";
import { prepareSignedPayment, recoverSignedPayment } from "./prepared-payment";

const exec = promisify(execFile);
const database = `pay_test_${randomUUID().replaceAll("-", "")}`;
const companyId = randomUUID(), orderId = randomUUID();
const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const recipient = "0x0000000000000000000000000000000000000002" as const;
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
async function sql(db: string, command: string) {
  return (await exec("docker", ["exec", "supabase_db_TRATO", "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db, "-c", command])).stdout.trim();
}

describe.runIf(process.env.PAYMENT_DB_INTEGRATION === "1")("recuperación con Postgres local aislado", () => {
  let created = false;
  beforeAll(async () => {
    await sql("postgres", `create database ${database}`); created = true;
    const migration = await readFile("supabase/migrations/20261107173800_reserve_payment_attempt.sql", "utf8");
    await sql(database, `create schema app_private; create table public.companies(id uuid primary key); insert into public.companies values ('${companyId}'); ${migration}`);
  });
  afterAll(async () => { if (created) await sql("postgres", `drop database ${database}`); });
  it("recupera el mismo sobre luego de perder la respuesta de la base", async () => {
    const reserved = JSON.parse(await sql(database, `set role service_role; select public.reserve_payment_attempt('${companyId}','${orderId}','action',42161,'${account.address}',7,'${TWIN_ARGT_ARBITRUM}','${recipient}','100');`));
    const identity = { id: reserved.id as string, companyId, orderId, actionId: "action", sender: account.address, recipient, amount: BigInt(100), nonce: 7 };
    const client = { rpc: async (name: string, p: Record<string, unknown>) => {
      const args = name === "get_prepared_payment" ? [p.p_company, p.p_order, p.p_action] : [p.p_company, p.p_order, p.p_action, p.p_reservation_id, p.p_hash, JSON.stringify(p.p_envelope)];
      try { const result = await sql(database, `set role service_role; select public.${name}(${args.map(v => quote(String(v))).join(",")});`); return { data: JSON.parse(result) as unknown, error: null }; }
      catch (error) { if (String(error).includes("NOT_FOUND: prepared payment")) return { data: null, error: { code: "P0001", message: "NOT_FOUND: prepared payment" } }; throw new Error("La consulta local falló."); }
    } };
    const store = createPreparedStore(client, identity);
    const lostResponse = { read: store.read, write: async (record: Parameters<typeof store.write>[0]) => { await store.write(record); throw new Error("respuesta perdida"); } };
    const data = encodeFunctionData({ abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]), functionName: "transfer", args: [recipient, BigInt(100)] });
    const raw = await account.signTransaction({ chainId: 42161, type: "eip1559", nonce: 7, to: TWIN_ARGT_ARBITRUM, data, gas: BigInt(100000), maxFeePerGas: BigInt(1000000000), maxPriorityFeePerGas: BigInt(100000000), value: BigInt(0) });
    const key = randomBytes(32);
    const first = await prepareSignedPayment(identity, raw, key, lostResponse);
    expect(first).toMatchObject({ ok: true });
    expect(await prepareSignedPayment(identity, raw, key, store)).toEqual(first);
    expect(await recoverSignedPayment(identity, key, store)).toMatchObject({ ok: true, data: { raw } });
    const stored = await store.read();
    expect(stored?.envelope).not.toContain(raw);
    expect((await sql(database, "select count(*) from app_private.payment_reservations;"))).toBe("1");
  }, 30000);
});
