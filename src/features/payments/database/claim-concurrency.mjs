import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

// Only an explicitly named disposable local database is allowed.
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
const fixture = await readFile(new URL("./payment-claim.integration.sql", import.meta.url), "utf8");
const setup = fixture.split("update public.purchase_policies set max_per_purchase_atomic")[0];
await sql(`${setup}\ncommit;`);
const args = (action, suffix = "1") => `'b0000000-0000-4000-8000-00000000000${suffix}','a0000000-0000-4000-8000-00000000000${suffix}','f0000000-0000-4000-8000-00000000000${suffix}','${action}',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',7`;
const results = await Promise.all(["race-a", "race-b"].map(action => sql(`set role service_role; select public.claim_order_payment(${args(action)});`)));
const [first, second] = results.map(JSON.parse);
assert.equal(first.id, second.id);
assert.equal(first.nonce, second.nonce);
assert.equal(await sql("select count(*) from app_private.payment_reservations;"), "1");
assert.equal(await sql("select count(*) from app_private.payment_claim_actions;"), "2");
console.log("Dos claims simultáneos recuperaron una reserva y un nonce; no hubo firma ni transmisión.");
for (const suffix of ["2", "3"]) {
  const next = setup.replaceAll("000000000001", `00000000000${suffix}`).replace("claim-a@example.test", `claim-${suffix}@example.test`).replaceAll("fixture-real-phone", `fixture-real-phone-${suffix}`);
  await sql(`${next}\ncommit;`);
}
const acrossCompanies = await Promise.all(["2", "3"].map(suffix => sql(`set role service_role; select public.claim_order_payment(${args(`company-${suffix}`, suffix)});`)));
const nonces = acrossCompanies.map(result => JSON.parse(result).nonce).sort((a, b) => a - b);
assert.deepEqual(nonces, [8, 9]);
assert.equal(await sql("select count(*) from app_private.payment_reservations;"), "3");
console.log("Dos empresas con el mismo emisor recibieron nonces distintos bajo concurrencia.");
await sql("update public.supplier_profiles set collection_address = '0x0000000000000000000000000000000000000003', wallet_version = 2 where company_id = 'b0000000-0000-4000-8000-000000000001';");
const replay = JSON.parse(await sql(`set role service_role; select public.claim_order_payment(${args("race-c")});`));
assert.equal(replay.id, first.id);
assert.equal(replay.destination, "0x0000000000000000000000000000000000000002");
console.log("El replay conserva el destino autorizado aunque cambie la billetera del proveedor.");
