import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const database = process.argv[2];
if (!/^pay_claim_[a-f0-9]{12}$/.test(database ?? "")) throw new Error("Se requiere una base local descartable pay_claim_<12 hex>.");
const sql = (command) => new Promise((resolve, reject) => {
  const child = spawn("docker", ["exec", "-i", "supabase_db_TRATO", "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]);
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
  child.stdin.end(command);
});
const fixture = await readFile(new URL("./broadcast-mark.integration.sql", import.meta.url), "utf8");
await sql(`${fixture.split("do $$ begin")[0]}\ncommit;`);
const command = "set role service_role; select public.mark_payment_broadcast('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');";
const results = await Promise.all([sql(command), sql(command)]);
assert.deepEqual(results.sort(), ["f", "t"]);
assert.equal(await sql("select count(*) from app_private.payment_broadcast_marks;"), "1");
console.log("Dos transmisores simultáneos obtuvieron una única marca durable.");
