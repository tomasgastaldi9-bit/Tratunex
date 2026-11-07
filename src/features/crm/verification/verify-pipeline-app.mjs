// CRM-04 against real local PostgreSQL and HTTP Auth/PostgREST substitutes.
// No hosted Supabase, Voice requests, tasks or telephone calls are exercised.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

const baseUrl = process.env.CRM_BASE_URL || "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Pipeline verification is local-only");
const config = JSON.parse(await readFile(path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
if (config.apiUrl !== "http://127.0.0.1:55440") throw new Error("Expected the isolated fixture API");
const account = config.users[0];
const stageNames = { new: "Nuevo", contacted: "Contactado", potential_client: "Cliente potencial", follow_up: "En seguimiento", won: "Compró", lost: "No compró", disqualified: "No calificado" };
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
  if (["POST", "PATCH", "DELETE"].includes(request.method()) && /\/api\/(voice|crm\/tasks)/.test(new URL(request.url()).pathname)) unrelatedWrites.push(request.url());
});
const post = (target, action_id, input, targetContext = context, headers = {}) => targetContext.request.post(`${baseUrl}${target}`, {
  headers: { Origin: baseUrl, "Idempotency-Key": action_id, ...headers }, data: { action_id, input },
});
const read = async (target, targetContext = context) => {
  const response = await targetContext.request.get(`${baseUrl}${target}`);
  return { response, body: await response.json() };
};
async function login(target, user) {
  await target.goto(`${baseUrl}/login`);
  await target.getByLabel("Correo").fill(user.email);
  await target.getByLabel("Contraseña").fill(user.password);
  await target.getByRole("button", { name: "Ingresar", exact: true }).click();
  await target.waitForURL(/\/login\/companies/, { timeout: 20_000 });
  await target.getByRole("button", { name: user.company_name, exact: true }).click();
  await target.getByRole("button", { name: `${user.company_name} (seleccionada)`, exact: true }).waitFor();
}
async function pipelineRpc(operation, input) {
  const result = JSON.parse(await asActor({ role: "authenticated", id: account.id }, `select public.pipeline_execute(${quote(JSON.stringify({
    company_id: account.company_id, actor_type: "user", actor_id: account.id, action_id: randomUUID() }))}::jsonb,
    ${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`));
  assert.ok(result.ok, `Local pipeline ${operation} must succeed`);
  return result.data;
}

try {
  const unauthenticated = await read("/api/crm/deals");
  check("la API del pipeline requiere sesión y empresa", [400, 403].includes(unauthenticated.response.status()));
  await page.goto(`${baseUrl}/pipeline`);
  await page.getByText("Elegí una empresa para ver el pipeline", { exact: true }).waitFor();
  check("pipeline sin empresa muestra el acceso pendiente", true);
  await login(page, account);
  check("login y selección usan Plataforma", /\/login\/companies/.test(page.url()));
  const home = await context.request.get(baseUrl, { maxRedirects: 0 });
  check("el inicio lleva al pipeline", [307, 308].includes(home.status()) && home.headers().location?.endsWith("/pipeline"));

  const key = randomUUID().slice(0, 8);
  const contactInput = { name: `Contacto ficticio ${key} con nombre extenso para comprobar el ajuste del selector y de las tarjetas de oportunidades`,
    organization: "Empresa de servicios ficticia", phone_e164: "+12025550191", website: `https://${key}.example`,
    source: { kind: "manual", label: "Verificación local del pipeline", url: null } };
  const contactResult = await (await post("/api/crm/contacts", randomUUID(), contactInput)).json();
  assert.ok(contactResult.ok);
  const contact = contactResult.data.contact;
  const apiInput = { contact_id: contact.id, title: `Propuesta API ficticia ${key}` };
  const action = randomUUID();
  const initialResponse = await post("/api/crm/deals", action, apiInput);
  const initial = await initialResponse.json();
  check("crear oportunidad empieza en Nuevo", initialResponse.status() === 200 && initial.ok && initial.data.deal.stage === "new");
  assert.deepEqual(await (await post("/api/crm/deals", action, apiInput)).json(), initial);
  check("misma acción no duplica oportunidad ni respuesta", true);
  check("misma acción con otro título responde 409", (await post("/api/crm/deals", action, { ...apiInput, title: `${apiInput.title} diferente` })).status() === 409);
  const second = await (await post("/api/crm/deals", randomUUID(), apiInput)).json();
  check("dos intenciones permiten varias oportunidades del mismo contacto", second.ok && second.data.deal.id !== initial.data.deal.id && second.data.deal.contact_id === contact.id);

  await page.goto(`${baseUrl}/pipeline`);
  await page.getByRole("heading", { name: "Pipeline", exact: true }).waitFor();
  check("tablero muestra la empresa autenticada", (await page.locator("main").innerText()).includes(account.company_name));
  for (const label of Object.values(stageNames)) {
    check(`columna ${label} visible`, await page.getByRole("region", { name: `Etapa ${label}`, exact: true }).count() === 1);
  }
  await page.getByRole("button", { name: "Crear oportunidad", exact: true }).click();
  await page.getByLabel("Buscar contacto para la oportunidad").fill(key);
  const [searchResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/contacts" && new URL(response.url()).searchParams.get("query") === key),
    page.getByRole("button", { name: "Buscar contactos", exact: true }).click(),
  ]);
  check("selector busca contactos en el servidor", (await searchResponse.json()).data.items.some(item => item.id === contact.id));
  await page.getByLabel("Contacto de la oportunidad").selectOption(contact.id);
  const uiTitle = `Propuesta ${key} con título extenso para comprobar el ajuste de las tarjetas y el cambio manual de etapa sin desbordes en pantallas pequeñas`;
  await page.getByLabel("Título de la oportunidad").fill(uiTitle);
  const [createdResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/crm/deals"),
    page.getByRole("button", { name: "Guardar oportunidad", exact: true }).click(),
  ]);
  const created = await createdResponse.json();
  check("el formulario crea una oportunidad para el contacto elegido", created.ok && created.data.deal.contact_id === contact.id && created.data.deal.stage === "new");
  const uiDeal = created.data.deal;
  const newColumn = page.getByRole("region", { name: "Etapa Nuevo", exact: true });
  await newColumn.getByRole("heading", { name: uiTitle, exact: true }).waitFor();
  const stageForm = page.getByRole("form", { name: `Cambiar etapa de ${uiTitle}`, exact: true });
  await stageForm.getByLabel(`Etapa de ${uiTitle}`, { exact: true }).selectOption("won");
  const beforeMove = Number(await sql(`select count(*) from public.activity_log where deal_id=${quote(uiDeal.id)}`));
  const [movedResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/crm/deals/${uiDeal.id}/stage`),
    stageForm.getByRole("button", { name: "Guardar etapa", exact: true }).click(),
  ]);
  const moved = await movedResponse.json();
  const movePayload = movedResponse.request().postDataJSON().input;
  check("guardar Compró envía etapa esperada y registra decisión humana", moved.ok && moved.data.deal.stage === "won" && movePayload.expected_stage === "new");
  const wonColumn = page.getByRole("region", { name: "Etapa Compró", exact: true });
  await wonColumn.getByRole("heading", { name: uiTitle, exact: true }).waitFor();
  check("la tarjeta aparece una sola vez en su nueva columna", await page.getByRole("heading", { name: uiTitle, exact: true }).count() === 1
    && await newColumn.getByRole("heading", { name: uiTitle, exact: true }).count() === 0);
  await page.reload();
  await wonColumn.getByRole("heading", { name: uiTitle, exact: true }).waitFor();
  check("recargar conserva Compró en PostgreSQL y en la columna", await sql(`select stage from public.deals where id=${quote(uiDeal.id)}`) === "won");
  const afterMove = Number(await sql(`select count(*) from public.activity_log where deal_id=${quote(uiDeal.id)}`));
  check("el movimiento añade una sola actividad", afterMove === beforeMove + 1);
  const stale = await post(`/api/crm/deals/${uiDeal.id}/stage`, randomUUID(), { stage: "lost", expected_stage: "new" });
  check("un editor desactualizado recibe 409", stale.status() === 409);
  check("el conflicto no añade actividad ni cambia Compró", Number(await sql(`select count(*) from public.activity_log where deal_id=${quote(uiDeal.id)}`)) === afterMove
    && await sql(`select stage from public.deals where id=${quote(uiDeal.id)}`) === "won");
  check("etapa inválida se rechaza", (await post(`/api/crm/deals/${uiDeal.id}/stage`, randomUUID(), { stage: "inventada" })).status() === 400);
  check("empresa inyectada en creación se rechaza", (await post("/api/crm/deals", randomUUID(), { ...apiInput, company_id: config.users[1].company_id })).status() === 400);
  check("CSRF al mover una oportunidad se rechaza", (await post(`/api/crm/deals/${uiDeal.id}/stage`, randomUUID(), { stage: "lost" }, context, { Origin: "https://foreign.example" })).status() === 403);
  const activities = await read(`/api/crm/activities?contact_id=${contact.id}`);
  check("actividad conserva orden cronológico descendente", activities.body.ok && activities.body.data.items.length >= 4
    && activities.body.data.items.every((item, index, items) => index === 0 || Date.parse(items[index - 1].occurred_at) >= Date.parse(item.occurred_at)));
  check("actividad del cambio identifica la decisión manual", activities.body.data.items.some(item => item.deal_id === uiDeal.id && item.kind === "deal_stage_changed" && /manualmente.*Compró/.test(item.summary)));
  const activityFirst = await read(`/api/crm/activities?contact_id=${contact.id}&limit=2`);
  const activityNext = await read(`/api/crm/activities?contact_id=${contact.id}&limit=2&cursor=${activityFirst.body.data.next_cursor}`);
  check("cursor de actividad no repite registros", activityFirst.body.data.items.length === 2 && activityNext.body.ok
    && activityNext.body.data.items.every(item => !activityFirst.body.data.items.some(previous => previous.id === item.id)));

  await page.goto(`${baseUrl}/contacts/${contact.id}`);
  await page.getByRole("link", { name: "Ver oportunidades de este contacto", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/pipeline" && url.searchParams.get("contact_id") === contact.id);
  await page.getByRole("button", { name: "Crear oportunidad", exact: true }).click();
  await page.waitForFunction(id => document.querySelector('select')?.value === id
    || Array.from(document.querySelectorAll('select')).some(select => select.value === id), contact.id);
  check("link de la ficha preselecciona el contacto para crear", await page.getByLabel("Contacto de la oportunidad").inputValue() === contact.id);
  await page.getByLabel("Título de la oportunidad").fill(`Oportunidad contextual ${key}`);
  const [prefilledResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/crm/deals"),
    page.getByRole("button", { name: "Guardar oportunidad", exact: true }).click(),
  ]);
  check("crear desde la ficha conserva el contacto contextual", (await prefilledResponse.json()).data.deal.contact_id === contact.id);

  const currentCount = Number(await sql(`select count(*) from public.deals where company_id=${quote(account.company_id)}`));
  for (let index = currentCount; index < 55; index++) {
    const seeded = await pipelineRpc("createDeal", { contact_id: contact.id, title: `Oportunidad paginada ficticia ${String(index).padStart(3, "0")}` });
    const stage = Object.keys(stageNames)[index % 7];
    if (stage !== "new") await pipelineRpc("setDealStage", { deal_id: seeded.deal.id, stage, expected_stage: "new" });
  }
  const allDeals = JSON.parse(await sql(`select jsonb_agg(to_jsonb(d) order by id)::text from public.deals d where company_id=${quote(account.company_id)}`));
  const outside = allDeals.filter(deal => deal.id !== uiDeal.id).at(-1);
  await pipelineRpc("setDealStage", { deal_id: outside.id, stage: "potential_client", expected_stage: outside.stage });
  const firstPage = await read("/api/crm/deals");
  const secondPage = await read(`/api/crm/deals?cursor=${firstPage.body.data.next_cursor}`);
  check("primera página del pipeline devuelve cincuenta y cursor", firstPage.body.ok && firstPage.body.data.items.length === 50 && firstPage.body.data.next_cursor);
  check("segunda página de oportunidades no duplica IDs", secondPage.body.ok && secondPage.body.data.items.length === allDeals.length - 50
    && secondPage.body.data.items.every(item => !firstPage.body.data.items.some(previous => previous.id === item.id)));
  const filtered = await read("/api/crm/deals?stage=potential_client");
  check("filtro de etapa encuentra registros fuera de la primera página", !firstPage.body.data.items.some(item => item.id === outside.id)
    && filtered.body.ok && filtered.body.data.items.some(item => item.id === outside.id) && filtered.body.data.items.every(item => item.stage === "potential_client"));
  await page.goto(`${baseUrl}/pipeline`);
  await page.getByRole("heading", { name: "Pipeline", exact: true }).waitFor();
  check("tablero declara cincuenta oportunidades en esta página", await page.getByText("50 oportunidades en esta página", { exact: true }).isVisible());
  await page.getByRole("link", { name: "Siguiente página", exact: true }).click();
  await page.getByRole("heading", { name: outside.title, exact: true }).waitFor();
  check("la navegación muestra oportunidades de la segunda página", await page.getByRole("form", { name: /^Cambiar etapa de / }).count() === allDeals.length - 50);
  await page.getByLabel("Filtrar oportunidades por etapa").selectOption("potential_client");
  await page.getByRole("button", { name: "Aplicar filtro", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("stage") === "potential_client" && !url.searchParams.has("cursor"));
  await page.getByRole("heading", { name: outside.title, exact: true }).waitFor();
  check("filtro de interfaz consulta toda la empresa", await page.getByRole("region", { name: "Etapa Cliente potencial", exact: true }).getByRole("heading", { name: outside.title, exact: true }).isVisible());

  const otherContext = await browser.newContext();
  otherContext.setDefaultTimeout(20_000);
  const otherPage = await otherContext.newPage();
  await login(otherPage, config.users[1]);
  const foreignList = await read("/api/crm/deals", otherContext);
  const foreignActivity = await read("/api/crm/activities", otherContext);
  check("otra empresa no ve oportunidades ni actividad ajenas", foreignList.body.ok && foreignList.body.data.items.length === 0 && foreignActivity.body.ok && foreignActivity.body.data.items.length === 0);
  check("crear oportunidad para contacto ajeno devuelve 404", (await post("/api/crm/deals", randomUUID(), apiInput, otherContext)).status() === 404);
  check("mover oportunidad ajena devuelve 404", (await post(`/api/crm/deals/${uiDeal.id}/stage`, randomUUID(), { stage: "lost" }, otherContext)).status() === 404);
  check("GET de contacto ajeno devuelve 404", (await otherContext.request.get(`${baseUrl}/api/crm/contacts/${contact.id}`)).status() === 404);
  await otherPage.goto(`${baseUrl}/pipeline`);
  await otherPage.getByText("Todavía no creaste oportunidades", { exact: true }).waitFor();
  check("el tablero de otra empresa está vacío sin datos ajenos", !(await otherPage.locator("main").innerText()).includes(uiTitle));
  await otherContext.close();

  const previews = path.join(import.meta.dirname, "pipeline-previews");
  await mkdir(previews, { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${baseUrl}/pipeline?contact_id=${contact.id}&stage=won&limit=100`);
    await page.getByRole("heading", { name: "Pipeline", exact: true }).waitFor();
    await page.getByRole("heading", { name: uiTitle, exact: true }).waitFor();
    const board = page.getByRole("region", { name: "Tablero de siete etapas del pipeline", exact: true });
    check(`el tablero no desborda la página en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width >= 768) {
      await board.focus();
      check(`tablero desplazable con teclado en ${width}px`, await board.evaluate(element => element.tabIndex === 0 && element.scrollWidth > element.clientWidth));
      await board.evaluate(element => { element.scrollLeft = 600; });
    }
    await board.evaluate(element => element.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 1440) await page.screenshot({ path: path.join(previews, "pipeline-desktop.png"), fullPage: false });
    if (width === 390) {
      await page.getByRole("heading", { name: uiTitle, exact: true }).evaluate(element => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -40));
      await page.screenshot({ path: path.join(previews, "pipeline-mobile.png"), fullPage: false });
    }
    await page.getByRole("button", { name: "Crear oportunidad", exact: true }).click();
    await page.getByLabel("Contacto de la oportunidad").waitFor();
    await page.waitForFunction(id => Array.from(document.querySelectorAll('select')).some(select => select.value === id), contact.id);
    await page.getByLabel("Título de la oportunidad").fill(uiTitle);
    check(`selector y formulario caben en ${width}px con texto largo`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check("sin errores de JavaScript", runtimeErrors.length === 0);
  check("sin escrituras a Voz ni tareas", unrelatedWrites.length === 0);
  console.log(JSON.stringify({ assertions, runtimeErrors, mode: "Real PostgreSQL; Auth/PostgREST substitutes; no hosted Supabase or telephone calls" }));
} finally { await context.close(); await browser.close(); }
