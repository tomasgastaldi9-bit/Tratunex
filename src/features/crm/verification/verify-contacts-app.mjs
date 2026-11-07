// CRM-03 browser verification: real isolated PostgreSQL, with HTTP substitutes
// for Supabase Auth/PostgREST. No hosted Supabase or telephone calls are used.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

const baseUrl = process.env.CRM_BASE_URL || "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Contacts verification is local-only");
const config = JSON.parse(await readFile(process.env.CRM_FIXTURE_CONFIG || path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
if (new URL(config.apiUrl).hostname !== "127.0.0.1") throw new Error("Expected isolated verification API");
let assertions = 0;
const check = (label, condition) => { assert.ok(condition, label); assertions++; console.log(`PASS ${label}`); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(20_000);
context.setDefaultNavigationTimeout(30_000);
const page = await context.newPage();
const runtimeErrors = [];
const unrelatedWrites = [];
page.on("pageerror", error => runtimeErrors.push(error.message));
page.on("request", request => {
  if (["POST", "PATCH", "DELETE"].includes(request.method()) && /\/api\/(voice|crm\/(deals|tasks))/.test(new URL(request.url()).pathname)) unrelatedWrites.push(request.url());
});
const user = config.users[0];
const post = (target, action_id, input, headers = {}, targetContext = context) => targetContext.request.post(`${baseUrl}${target}`, {
  headers: { Origin: baseUrl, "Idempotency-Key": action_id, ...headers }, data: { action_id, input },
});
async function apiList(query = "", targetContext = context) {
  const response = await targetContext.request.get(`${baseUrl}/api/crm/contacts${query ? `?${query}` : ""}`);
  return { status: response.status(), body: await response.json() };
}
async function unusedPhones(count) {
  const used = JSON.parse(await sql(`select coalesce(jsonb_agg(phone_e164),'[]'::jsonb)::text from public.contacts where company_id=${quote(user.company_id)}`));
  const available = Array.from({ length: 100 }, (_, index) => `+120255501${String(index).padStart(2, "0")}`).filter(phone => !used.includes(phone));
  if (available.length < count) throw new Error("The verification company exhausted its reserved fictional phone range");
  return available.slice(0, count);
}
async function login(target, account) {
  await target.goto(`${baseUrl}/login`);
  await target.getByLabel("Correo").fill(account.email);
  await target.getByLabel("Contraseña").fill(account.password);
  await target.getByRole("button", { name: "Ingresar", exact: true }).click();
  await target.waitForURL(/\/login\/companies/, { timeout: 20_000 });
  await target.getByRole("button", { name: account.company_name, exact: true }).click();
  await target.getByRole("button", { name: `${account.company_name} (seleccionada)`, exact: true }).waitFor({ timeout: 20_000 });
}
async function updateViaSql(contact, changes) {
  const input = { contact_id: contact.id, name: contact.name, organization: contact.organization, phone_e164: contact.phone_e164,
    website: contact.website, source: contact.source, do_not_contact: contact.do_not_contact, ...changes };
  const result = JSON.parse(await asActor({ role: "authenticated", id: user.id }, `select public.contacts_execute(${quote(JSON.stringify({ company_id: user.company_id,
    actor_type: "user", actor_id: user.id, action_id: randomUUID() }))}::jsonb,'updateContact',${quote(JSON.stringify(input))}::jsonb)::text`));
  assert.ok(result.ok);
  return result.data.contact;
}

try {
  const anonymous = await apiList();
  check("API rechaza sesión ausente", anonymous.status === 400 || anonymous.status === 403);
  await page.goto(`${baseUrl}/contacts`);
  check("la lista sin empresa ofrece seleccionar una", await page.getByText("Elegí una empresa para ver tus contactos", { exact: true }).isVisible());
  await login(page, user);
  check("login y selector usan el módulo de Plataforma", /\/login\/companies/.test(page.url()));
  await page.goto(`${baseUrl}/contacts`);
  await page.getByRole("heading", { name: "Contactos", exact: true }).waitFor();
  check("la lista muestra la empresa autenticada", (await page.locator("main").innerText()).includes(user.company_name));
  check("no hay fallback silencioso a fixtures", !(await page.locator("main").innerText()).includes("Alicia Demo"));

  const input = { name: `Importado QA ${randomUUID().slice(0, 8)}`, organization: "Organización ficticia QA", phone_e164: (await unusedPhones(1))[0],
    website: `https://${randomUUID()}.example`, source: { kind: "csv", label: "Importación ficticia local", url: null }, do_not_contact: false };
  const action = randomUUID();
  const firstResponse = await post("/api/crm/contacts", action, input);
  const first = await firstResponse.json();
  check("API crea el contacto en PostgreSQL", firstResponse.status() === 200 && first.ok && first.data.created);
  let contact = first.data.contact;
  assert.deepEqual(await (await post("/api/crm/contacts", action, input)).json(), first);
  check("repetir action_id devuelve el mismo resultado", true);
  check("action_id con otro payload responde 409", (await post("/api/crm/contacts", action, { ...input, name: "Otro payload" })).status() === 409);
  const importedAgain = await (await post("/api/crm/contacts", randomUUID(), input)).json();
  check("dos importaciones distintas conservan un único contacto", importedAgain.ok && !importedAgain.data.created && importedAgain.data.contact.id === contact.id);
  const domainInput = { ...input, phone_e164: (await unusedPhones(1))[0], website: input.website.replace("https://", "https://www.").toUpperCase() + "/perfil", do_not_contact: true };
  const sameDomain = await (await post("/api/crm/contacts", randomUUID(), domainInput)).json();
  check("dominio normalizado deduplica con otro teléfono", sameDomain.ok && !sameDomain.data.created && sameDomain.data.contact.id === contact.id);
  contact = sameDomain.data.contact;
  const sticky = await (await post("/api/crm/contacts", randomUUID(), { ...domainInput, do_not_contact: false })).json();
  check("reimportar no revierte do_not_contact", sticky.ok && sticky.data.contact.do_not_contact === true);
  check("una sola fila existe tras reimportar", Number(await sql(`select count(*) from public.contacts where company_id=${quote(user.company_id)} and id=${quote(contact.id)}`)) === 1);
  const getContact = await (await context.request.get(`${baseUrl}/api/crm/contacts/${contact.id}`)).json();
  check("getContact entrega teléfono y do_not_contact guardados", getContact.ok && getContact.data.contact.phone_e164 === contact.phone_e164 && getContact.data.contact.do_not_contact);
  check("CSRF de otro origen se rechaza", (await post("/api/crm/contacts", randomUUID(), input, { Origin: "https://foreign.example" })).status() === 403);
  check("empresa inyectada en input se rechaza", (await post("/api/crm/contacts", randomUUID(), { ...input, company_id: config.users[1].company_id })).status() === 400);
  const injectedEnvelope = await context.request.post(`${baseUrl}/api/crm/contacts`, { headers: { Origin: baseUrl }, data: { action_id: randomUUID(), input, actor_type: "system" } });
  check("actor inyectado en envelope se rechaza", injectedEnvelope.status() === 400);
  check("encabezado de idempotencia contradictorio se rechaza", (await post("/api/crm/contacts", randomUUID(), input, { "Idempotency-Key": "different" })).status() === 409);
  check("filtros duplicados se rechazan", (await apiList("source=manual&source=csv")).status === 400);

  await page.goto(`${baseUrl}/contacts/${contact.id}`);
  await page.getByRole("heading", { name: input.name, exact: true }).waitFor();
  await page.reload();
  check("recargar conserva el contacto y su preferencia", (await page.locator("main").innerText()).includes(contact.phone_e164)
    && await page.getByText("Este contacto pidió no recibir llamadas", { exact: true }).isVisible());

  await page.goto(`${baseUrl}/contacts`);
  await page.getByRole("button", { name: "Agregar contacto", exact: true }).click();
  const uiName = `Formulario QA ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nombre del contacto").fill(uiName);
  await page.getByLabel("Empresa u organización", { exact: true }).fill("Empresa de formulario ficticia");
  await page.getByLabel("Teléfono con código de país").fill("teléfono inválido");
  await page.getByRole("button", { name: "Guardar contacto", exact: true }).click();
  check("el formulario explica el formato de teléfono inválido", await page.getByText("Escribí el teléfono con + y código de país, sin espacios ni guiones.", { exact: true }).isVisible());
  await page.getByLabel("Teléfono con código de país").fill((await unusedPhones(1))[0]);
  await page.getByLabel("Sitio web", { exact: true }).fill(`https://${randomUUID()}.example`);
  const [createdResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/crm/contacts"),
    page.getByRole("button", { name: "Guardar contacto", exact: true }).click(),
  ]);
  const uiCreated = await createdResponse.json();
  check("alta desde formulario usa API autenticada", uiCreated.ok && uiCreated.data.created);
  const uiId = uiCreated.data.contact.id;
  await page.waitForURL(url => url.pathname === `/contacts/${uiId}`);
  await page.getByRole("button", { name: "Editar contacto", exact: true }).click();
  check("el teléfono puede editarse", await page.getByLabel("Teléfono con código de país").getAttribute("readonly") === null);
  const changedName = `${uiName} editado`;
  const changedPhone = (await unusedPhones(1))[0];
  await page.getByLabel("Nombre del contacto").fill(changedName);
  await page.getByLabel("Teléfono con código de país").fill(changedPhone);
  await page.getByLabel("No contactar por teléfono", { exact: true }).check();
  const [editedResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/crm/contacts/${uiId}`),
    page.getByRole("button", { name: "Guardar contacto", exact: true }).click(),
  ]);
  const uiEdited = await editedResponse.json();
  check("edición cambia teléfono y nombre conservando ID", uiEdited.ok && uiEdited.data.contact.id === uiId && uiEdited.data.contact.phone_e164 === changedPhone && uiEdited.data.contact.name === changedName);
  await page.getByRole("heading", { name: changedName, exact: true }).waitFor();
  await page.reload();
  check("edición persiste tras recargar", (await page.locator("main").innerText()).includes(changedPhone)
    && await sql(`select name from public.contacts where id=${quote(uiId)}`) === changedName);
  await page.getByRole("button", { name: "Editar contacto", exact: true }).click();
  check("DNC guardado queda marcado y no se puede desmarcar", await page.getByLabel(/^No contactar por teléfono/).isChecked() && await page.getByLabel(/^No contactar por teléfono/).isDisabled());
  await page.getByRole("button", { name: "Cerrar formulario", exact: true }).click();
  const collision = await context.request.patch(`${baseUrl}/api/crm/contacts/${uiId}`, { headers: { Origin: baseUrl }, data: { action_id: randomUUID(),
    input: { ...input, phone_e164: contact.phone_e164 } } });
  check("edición no fusiona contactos que colisionan", collision.status() === 409 && await sql(`select phone_e164 from public.contacts where id=${quote(uiId)}`) === changedPhone);

  const currentCount = Number(await sql(`select count(*) from public.contacts where company_id=${quote(user.company_id)}`));
  const phones = await unusedPhones(Math.max(0, 55 - currentCount));
  for (let index = 0; index < phones.length; index++) {
    const bulk = { name: `Paginado ficticio ${String(index).padStart(3, "0")}`, organization: null, phone_e164: phones[index], website: null,
      source: { kind: ["manual", "csv", "firecrawl"][index % 3], label: "Verificación local paginada", url: null } };
    const result = JSON.parse(await asActor({ role: "authenticated", id: user.id }, `select public.contacts_execute(${quote(JSON.stringify({ company_id: user.company_id,
      actor_type: "user", actor_id: user.id, action_id: randomUUID() }))}::jsonb,'upsertContact',${quote(JSON.stringify(bulk))}::jsonb)::text`));
    assert.ok(result.ok);
  }
  const allContacts = JSON.parse(await sql(`select jsonb_agg(to_jsonb(c) order by id)::text from public.contacts c where company_id=${quote(user.company_id)}`));
  const remainingContacts = allContacts.length - 50;
  const outside = await updateViaSql(allContacts.filter(item => item.id !== uiId && item.id !== contact.id).at(-1),
    { name: `Buscable fuera de primera página ${randomUUID().slice(0, 8)}`, source: { kind: "firecrawl", label: "Filtro servidor", url: null }, do_not_contact: true });
  const firstPage = await apiList();
  const nextPage = await apiList(`cursor=${firstPage.body.data.next_cursor}`);
  check("la lista inicial devuelve cincuenta y un cursor", firstPage.status === 200 && firstPage.body.ok && firstPage.body.data.items.length === 50 && firstPage.body.data.next_cursor);
  check("la segunda página no duplica contactos", nextPage.body.ok && nextPage.body.data.items.length === remainingContacts && nextPage.body.data.items.every(item => !firstPage.body.data.items.some(previous => previous.id === item.id)));
  const queryFilter = await apiList(`query=${encodeURIComponent(outside.name)}`);
  check("búsqueda consulta registros fuera de la primera página", queryFilter.body.ok && queryFilter.body.data.items.length === 1 && queryFilter.body.data.items[0].id === outside.id);
  const sourceFilter = await apiList("source=csv");
  check("filtro de origen se aplica en servidor", sourceFilter.body.ok && sourceFilter.body.data.items.length > 0 && sourceFilter.body.data.items.every(item => item.source.kind === "csv"));
  const dncFilter = await apiList("do_not_contact=true");
  check("filtro DNC se aplica en servidor", dncFilter.body.ok && dncFilter.body.data.items.length > 0 && dncFilter.body.data.items.every(item => item.do_not_contact));
  await page.goto(`${baseUrl}/contacts`);
  await page.getByRole("heading", { name: "Contactos", exact: true }).waitFor();
  check("la interfaz muestra cincuenta contactos por página", await page.getByRole("link", { name: /^Ver contacto / }).count() === 50);
  await page.getByRole("link", { name: "Siguiente página", exact: true }).click();
  await page.getByText(outside.name, { exact: true }).waitFor();
  check("paginación de interfaz muestra la segunda página", await page.getByRole("link", { name: /^Ver contacto / }).count() === remainingContacts && await page.getByText(outside.name, { exact: true }).isVisible());
  await page.getByLabel("Buscar contactos", { exact: true }).fill(outside.name);
  await page.getByLabel("Origen", { exact: true }).selectOption("firecrawl");
  await page.getByLabel("Preferencia de contacto", { exact: true }).selectOption("true");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("query") === outside.name && !url.searchParams.has("cursor"));
  check("filtros de interfaz combinan búsqueda, origen y DNC", await page.getByRole("link", { name: /^Ver contacto / }).count() === 1 && await page.getByText(outside.name, { exact: true }).isVisible());

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, config.users[1]);
  const foreignApi = await otherContext.request.get(`${baseUrl}/api/crm/contacts/${contact.id}`);
  check("otra empresa no puede leer el contacto por API", foreignApi.status() === 404);
  const foreignPage = await otherPage.goto(`${baseUrl}/contacts/${contact.id}`);
  check("la ficha ajena devuelve HTTP 404 y no filtra datos", foreignPage.status() === 404 && !(await otherPage.locator("main").innerText()).includes(input.name));
  const otherContact = await (await post("/api/crm/contacts", randomUUID(), input, {}, otherContext)).json();
  check("deduplicación queda dentro de cada empresa", otherContact.ok && otherContact.data.created && otherContact.data.contact.id !== contact.id);
  await otherContext.close();

  const previews = path.join(import.meta.dirname, "contacts-previews");
  await mkdir(previews, { recursive: true });
  await page.goto(`${baseUrl}/contacts`);
  await page.screenshot({ path: path.join(previews, "contacts-desktop.png"), fullPage: false });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${baseUrl}/contacts/${uiId}`);
    await page.getByRole("heading", { name: changedName, exact: true }).waitFor();
    check(`ficha de contacto cabe en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 390) await page.screenshot({ path: path.join(previews, "contact-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Editar contacto", exact: true }).click();
    check(`formulario de contacto cabe en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${baseUrl}/contacts`);
    await page.getByRole("heading", { name: "Contactos", exact: true }).waitFor();
    check(`lista y filtros caben en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check("sin errores de JavaScript", runtimeErrors.length === 0);
  check("sin escrituras a Voz, deals o tareas", unrelatedWrites.length === 0);
  console.log(JSON.stringify({ assertions, runtimeErrors, mode: "Real PostgreSQL; Auth/PostgREST HTTP substitutes; no hosted Supabase or telephone calls" }));
} finally { await context.close(); await browser.close(); }
