import { execFile } from "node:child_process";

export const verificationDatabase = "tratunex_contacts_verify";
export async function sql(statement, options = {}) {
  const binary = process.env.CRM_PSQL;
  if (!binary) throw new Error("CRM_PSQL must point to psql for local verification");
  const port = process.env.CRM_PGPORT || "55439";
  if (!/^\d+$/.test(port)) throw new Error("Invalid local verification port");
  const args = ["-X", "-A", "-t", "-q", "-h", "127.0.0.1", "-p", port,
    "-U", "postgres", "-d", verificationDatabase, "-v", "ON_ERROR_STOP=1"];
  if (options.file) args.push("-f", options.file);
  const output = await new Promise((resolve, reject) => {
    const child = execFile(binary, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PGCLIENTENCODING: "UTF8" } }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
    child.stdin.end(options.file ? "" : statement, "utf8");
  });
  return output.trim();
}
export function quote(value) {
  return value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}
export async function asActor(actor, statement) {
  if (!["authenticated", "service_role", "anon"].includes(actor.role)) throw new Error("Invalid verification role");
  const claims = { role: actor.role, ...(actor.id ? { sub: actor.id } : {}), ...actor.claims };
  return sql(`begin; set local role ${actor.role}; set local request.jwt.claims = ${quote(JSON.stringify(claims))}; ${statement}; commit;`);
}
