import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// A dedicated disposable local database prevents touching the shared project DB.
const exec = promisify(execFile);
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
if (projectId !== "TRATO") throw new Error("La prueba requiere el Supabase local de TRATO.");
const db = `pay_test_${randomUUID().replaceAll("-", "")}`;
const container = `supabase_db_${projectId}`;
const migration = await readFile(new URL("../supabase/migrations/20261107173800_reserve_payment_attempt.sql", import.meta.url), "utf8");
async function sql(database, command) {
  const result = await exec("docker", ["exec", container, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-c", command]);
  return result.stdout.trim();
}
const companyA = randomUUID(), companyB = randomUUID(), order = randomUUID(), other = randomUUID();
const sender = "0x0000000000000000000000000000000000000001";
const destination = "0x0000000000000000000000000000000000000002";
const token = "0x59863989d080b22476db95656d0c3cc18be92214";
const reserve = (company, orderId, action, nonce) => `select public.reserve_payment_attempt('${company}','${orderId}','${action}',42161,'${sender}',${nonce},'${token}','${destination}','100');`;
let created = false;
try {
  await sql("postgres", `create database ${db}`); created = true;
  await sql(db, `create schema app_private; create table public.companies(id uuid primary key); insert into public.companies values ('${companyA}'),('${companyB}'); ${migration}`);
  const same = `begin; set local role service_role; ${reserve(companyA, order, "a", 7)} select pg_sleep(1); commit;`;
  const [a, b] = await Promise.all([sql(db, same), sql(db, same)]);
  const extract = output => JSON.parse(output.match(/\{[^\n]+\}/)?.[0] ?? "null");
  if (!extract(a)?.id || extract(a).id !== extract(b)?.id) throw new Error("La misma orden no devolvió la misma reserva.");
  const reservationId = extract(a).id;
  const store = hash => `begin; set local role service_role; select public.store_prepared_payment('${companyA}','${order}','a','${reservationId}','0x${hash.repeat(64)}','{"version":1,"iv":"dummy","tag":"dummy","ciphertext":"encrypted"}'); select pg_sleep(1); commit;`;
  const prepared = await Promise.allSettled([sql(db, store("a")), sql(db, store("b"))]);
  if (prepared.filter(x => x.status === "fulfilled").length !== 1 || prepared.filter(x => x.status === "rejected" && String(x.reason).includes("prepared transaction differs")).length !== 1) throw new Error("La reserva permitió reemplazar la transacción preparada.");
  const first = `begin; set local role service_role; ${reserve(companyA, randomUUID(), "b", 8)} select pg_sleep(1); commit;`;
  const second = `begin; set local role service_role; ${reserve(companyB, other, "c", 8)} select pg_sleep(1); commit;`;
  const results = await Promise.allSettled([sql(db, first), sql(db, second)]);
  if (results.filter(x => x.status === "fulfilled").length !== 1 || results.filter(x => x.status === "rejected" && String(x.reason).includes("wallet nonce already reserved")).length !== 1) throw new Error("Dos órdenes pudieron reservar el mismo nonce.");
  const conflictingOrder = randomUUID();
  const left = `begin; set local role service_role; ${reserve(companyA, conflictingOrder, "d", 9)} select pg_sleep(1); commit;`;
  const right = `begin; set local role service_role; ${reserve(companyA, conflictingOrder, "e", 10)} select pg_sleep(1); commit;`;
  const conflicting = await Promise.allSettled([sql(db, left), sql(db, right)]);
  if (conflicting.filter(x => x.status === "fulfilled").length !== 1 || conflicting.filter(x => x.status === "rejected" && String(x.reason).includes("order already reserved with different input")).length !== 1) throw new Error("Una orden admitió datos distintos en paralelo.");
  const sharedAction = `shared-${randomUUID()}`;
  const actionLeft = `begin; set local role service_role; ${reserve(companyA, randomUUID(), sharedAction, 11)} select pg_sleep(1); commit;`;
  const actionRight = `begin; set local role service_role; ${reserve(companyA, randomUUID(), sharedAction, 12)} select pg_sleep(1); commit;`;
  const actionResults = await Promise.allSettled([sql(db, actionLeft), sql(db, actionRight)]);
  if (actionResults.filter(x => x.status === "fulfilled").length !== 1 || actionResults.filter(x => x.status === "rejected" && String(x.reason).includes("action already reserved")).length !== 1) throw new Error("La misma acción permitió órdenes distintas.");
  const total = await sql(db, "select count(*) from app_private.payment_reservations;");
  if (total !== "4") throw new Error("Cantidad inesperada de reservas.");
  console.log("Reservas concurrentes y transacción preparada inmutable: OK.");
} finally {
  if (created) await sql("postgres", `drop database ${db}`);
}
