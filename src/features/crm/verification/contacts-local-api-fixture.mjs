// Verification-only HTTP substitute for Supabase Auth/PostgREST. SQL executes on
// real standalone PostgreSQL; this does NOT prove GoTrue or hosted Supabase.
import http from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { asActor, quote, sql, verificationDatabase } from "./contacts-postgres-client.mjs";

const port = Number(process.env.CRM_TEST_API_PORT || 55440);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local fixture port");
if (await sql("select current_database()") !== verificationDatabase) throw new Error("Wrong verification database");
const secret = randomBytes(32);
const encoded = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = claims => {
  const parts = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ iss: "local-crm-verification-only", exp: Math.floor(Date.now() / 1000) + 7200, ...claims })}`;
  return `${parts}.${createHmac("sha256", secret).update(parts).digest("base64url")}`;
};
const users = ["A", "B"].map(suffix => ({
  id: randomUUID(), company_id: randomUUID(), email: `${randomUUID()}@example.test`,
  password: randomBytes(24).toString("base64url"), company_name: `Empresa CRM local ${suffix}`,
  refresh_token: randomBytes(24).toString("base64url"),
}));
const anonKey = sign({ role: "anon" });
const serviceKey = sign({ role: "service_role" });
const apiUrl = `http://127.0.0.1:${port}`;
const configPath = process.env.CRM_FIXTURE_CONFIG || path.join(tmpdir(), "tratunex-contacts-local-api.json");
for (const user of users) await sql(`insert into auth.users(id,email) values (${quote(user.id)},${quote(user.email)});
  insert into public.companies(id,name) values (${quote(user.company_id)},${quote(user.company_name)});
  insert into public.company_members(company_id,user_id,role) values (${quote(user.company_id)},${quote(user.id)},'admin');`);
await writeFile(configPath, JSON.stringify({ apiUrl, anonKey, serviceKey, users }), { mode: 0o600 });

const authUser = user => ({ id: user.id, email: user.email, aud: "authenticated", role: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: new Date().toISOString() });
const session = user => ({ access_token: sign({ sub: user.id, role: "authenticated", aud: "authenticated", email: user.email }),
  refresh_token: user.refresh_token, token_type: "bearer", expires_in: 7200, expires_at: Math.floor(Date.now() / 1000) + 7200, user: authUser(user) });
function claimsFor(request) {
  const token = request.headers.authorization?.replace(/^Bearer /i, "");
  if (!token) return { role: "anon" };
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("Invalid fixture token");
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("Invalid fixture signature");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (claims.exp < Date.now() / 1000) throw new Error("Expired fixture token");
  return claims;
}
const tables = new Set(["companies", "company_members", "contacts"]);
const identifier = value => {
  if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error("Invalid fixture query identifier");
  return `"${value}"`;
};
const send = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, apiUrl);
    let raw = "";
    for await (const part of request) { raw += part; if (raw.length > 1_000_000) throw new Error("Fixture request too large"); }
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
      const user = users.find(item => url.searchParams.get("grant_type") === "refresh_token"
        ? item.refresh_token === body.refresh_token : item.email === body.email && item.password === body.password);
      return user ? send(response, 200, session(user)) : send(response, 400, { code: "invalid_credentials", msg: "Invalid local fixture credentials" });
    }
    if (url.pathname === "/auth/v1/logout") return send(response, 204);
    const claims = claimsFor(request);
    if (url.pathname === "/auth/v1/user") {
      const user = users.find(item => item.id === claims.sub);
      return user ? send(response, 200, authUser(user)) : send(response, 401, { code: "bad_jwt", msg: "No local fixture user" });
    }
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(response, 200, { keys: [] });
    const actor = { role: claims.role, id: claims.sub };
    if (url.pathname === "/rest/v1/rpc/contacts_execute" && request.method === "POST") {
      const output = await asActor(actor, `select public.contacts_execute(${quote(JSON.stringify(body.p_ctx))}::jsonb,
        ${quote(body.p_operation)},${quote(JSON.stringify(body.p_input))}::jsonb)::text`);
      return send(response, 200, JSON.parse(output));
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (request.method === "GET" && tables.has(table)) {
      const columns = url.searchParams.get("select") || "*";
      const projection = columns === "*" ? "*" : columns.split(",").map(identifier).join(",");
      const conditions = [];
      for (const [key, value] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(key)) continue;
        if (value.startsWith("in.(") && value.endsWith(")")) {
          const values = value.slice(4, -1).split(",").filter(Boolean).map(item => item.replace(/^"|"$/g, ""));
          if (values.length > 1000) throw new Error("Fixture list filter too large");
          conditions.push(values.length ? `${identifier(key)} in (${values.map(quote).join(",")})` : "false");
          continue;
        }
        const match = /^(eq|gt|gte|lt|lte|is)\.(.*)$/.exec(value);
        if (!match) throw new Error("Unsupported fixture filter");
        const operators = { eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=", is: "is" };
        conditions.push(`${identifier(key)} ${operators[match[1]]} ${match[1] === "is" && match[2] === "null" ? "null" : quote(match[2])}`);
      }
      const order = (url.searchParams.get("order") || (table === "company_members" ? "company_id.asc" : "id.asc")).split(",").map(item => {
        const [column, direction] = item.split(".");
        return `${identifier(column)} ${direction === "desc" ? "desc" : "asc"}`;
      }).join(",");
      const limit = Math.min(Number(url.searchParams.get("limit") || 1000), 1000);
      const offset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) throw new Error("Invalid fixture pagination");
      const output = await asActor(actor, `select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb)::text from (
        select ${projection} from public.${identifier(table)} ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
        order by ${order} limit ${limit} offset ${offset}) rows`);
      const data = JSON.parse(output);
      if (request.headers.accept?.includes("application/vnd.pgrst.object+json")) {
        return data.length === 1 ? send(response, 200, data[0]) : send(response, 406, { code: "PGRST116", details: `${data.length} rows`, message: "Expected one row" });
      }
      return send(response, 200, data);
    }
    send(response, 404, { code: "FIXTURE_ENDPOINT_MISSING", message: "This verification fixture implements only CRM-required endpoints" });
  } catch (error) {
    // Do not log tokens, credentials or row contents from requests.
    send(response, 400, { code: "FIXTURE_QUERY_ERROR", message: error.message.split("\n").find(line => line.startsWith("ERROR:")) || "Local fixture query failed" });
  }
});

server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ fixture: "Auth/PostgREST substitute + real PostgreSQL", apiUrl, configPath })));
