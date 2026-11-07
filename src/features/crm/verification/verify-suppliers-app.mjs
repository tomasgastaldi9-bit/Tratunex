// ORD-01: real isolated PostgreSQL, HTTP Auth/PostgREST substitutes and
// deliberately fictional wallet metadata. No hosted Supabase, ARGt or onchain calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { asActor, quote, sql } from "./contacts-postgres-client.mjs";

const baseUrl = process.env.CRM_BASE_URL || "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Supplier verification is local-only");
const config = JSON.parse(await readFile(path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
if (config.apiUrl !== "http://127.0.0.1:55440") throw new Error("Expected the owned synthetic loopback fixture");
const account = config.users[0];
const wallet = { chain: "arbitrum", address: `0x${"Ab".repeat(20)}` };
const alternateWallet = { chain: "base", address: `0x${"Cd".repeat(20)}` };
let assertions = 0;
const check = (label, condition) => { assert.ok(condition, label); assertions++; console.log(`PASS ${label}`); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(20_000);
context.setDefaultNavigationTimeout(30_000);
const page = await context.newPage();
const runtimeErrors = [];
const prohibitedWrites = [];
const externalRequests = [];
page.on("pageerror", error => runtimeErrors.push(error.message));
page.on("request", request => {
  const url = new URL(request.url());
  if (["POST", "PATCH", "DELETE"].includes(request.method()) && /\/api\/(voice|payments|orders)/.test(url.pathname)) prohibitedWrites.push(url.pathname);
  if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) externalRequests.push(url.hostname);
});
const post = (target, action_id, input, targetContext = context, headers = {}) => targetContext.request.post(`${baseUrl}${target}`, {
  headers: { Origin: baseUrl, "Idempotency-Key": action_id, ...headers }, data: { action_id, input },
});
const read = async (target, targetContext = context) => {
  const response = await targetContext.request.get(`${baseUrl}${target}`);
  return { response, body: await response.json() };
};
async function unusedPhones(count) {
  const used = JSON.parse(await sql(`select coalesce(jsonb_agg(phone_e164),'[]'::jsonb)::text from public.contacts where company_id=${quote(account.company_id)}`));
  const available = Array.from({ length: 100 }, (_, index) => `+120255501${String(index).padStart(2, "0")}`).filter(phone => !used.includes(phone));
  if (available.length < count) throw new Error("Reserved fictional phone range exhausted in the isolated fixture company");
  return available.slice(0, count);
}
async function login(target, user) {
  await target.goto(`${baseUrl}/login`);
  await target.getByLabel("Correo").fill(user.email);
  await target.getByLabel("Contraseña").fill(user.password);
  await target.getByRole("button", { name: "Ingresar", exact: true }).click();
  await target.waitForURL(/\/login\/companies/);
  await target.getByRole("button", { name: user.company_name, exact: true }).click();
  await target.getByRole("button", { name: `${user.company_name} (seleccionada)`, exact: true }).waitFor();
}
async function suppliersRpc(operation, input, actorType = "user") {
  const output = await asActor({ role: actorType === "user" ? "authenticated" : "service_role", id: account.id },
    `select public.suppliers_execute(${quote(JSON.stringify({ company_id: account.company_id, actor_type: actorType,
      actor_id: account.id, action_id: randomUUID() }))}::jsonb,${quote(operation)},${quote(JSON.stringify(input))}::jsonb)::text`);
  return JSON.parse(output);
}

try {
  const anonymous = await read("/api/crm/suppliers");
  check("API de proveedores requiere sesión y empresa", [400, 403].includes(anonymous.response.status()));
  await page.goto(`${baseUrl}/suppliers`);
  await page.getByText("Elegí una empresa para ver sus proveedores", { exact: true }).waitFor();
  check("sin empresa se ofrece seleccionar una", true);
  await login(page, account);
  await page.goto(`${baseUrl}/suppliers`);
  await page.getByRole("heading", { name: "Proveedores", exact: true }).waitFor();
  check("lista muestra la empresa autenticada", (await page.locator("main").innerText()).includes(account.company_name));

  const key = randomUUID().slice(0, 8);
  const supplierName = `Proveedor ficticio ${key} con nombre extenso para comprobar el ajuste de la ficha y sus datos de cobro`;
  const initialPhone = (await unusedPhones(1))[0];
  const website = `https://${key}.example`;
  await page.getByRole("button", { name: "Agregar proveedor", exact: true }).click();
  await page.getByLabel("Nombre del proveedor").fill(supplierName);
  await page.getByLabel("Empresa u organización", { exact: true }).fill("Distribuidora ficticia de insumos");
  await page.getByLabel("Teléfono con código de país").fill(initialPhone);
  await page.getByLabel("Sitio web", { exact: true }).fill(website);
  check("el alta de proveedor separa la billetera del contacto", await page.getByLabel("Dirección pública de cobro").count() === 0);
  const [createdResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/crm/suppliers"),
    page.getByRole("button", { name: "Guardar proveedor", exact: true }).click(),
  ]);
  const created = await createdResponse.json();
  check("alta humana guarda proveedor con billetera pendiente", created.ok && created.data.created && created.data.supplier.collection_wallet === null && created.data.supplier.wallet_version === 0);
  const supplierId = created.data.supplier.id;
  await page.waitForURL(url => url.pathname === `/suppliers/${supplierId}`);
  await page.getByRole("heading", { name: supplierName, exact: true }).waitFor();
  check("ficha presenta Billetera pendiente como estado válido", await page.getByText("Billetera pendiente", { exact: true }).isVisible());
  const walletPath = `/api/crm/suppliers/${supplierId}/wallet`;
  const walletPattern = `**${walletPath}`;
  const walletRequests = [];
  let appliedWallet;
  const interruptedWallet = async route => {
    walletRequests.push(route.request().postDataJSON());
    if (walletRequests.length === 1) {
      const realResponse = await route.fetch();
      appliedWallet = await realResponse.json();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false,
        error: { code: "PROVIDER_UNAVAILABLE", message: "Synthetic response loss after commit", retryable: true } }) });
    } else await route.continue();
  };
  await page.route(walletPattern, interruptedWallet);
  await page.getByRole("button", { name: "Configurar billetera de cobro", exact: true }).click();
  check("la red requiere elección humana explícita", await page.getByLabel("Red de la billetera").inputValue() === "");
  await page.getByLabel("Red de la billetera").selectOption(wallet.chain);
  await page.getByLabel("Dirección pública de cobro").fill(`0x${"0".repeat(40)}`);
  await page.getByRole("button", { name: "Guardar billetera", exact: true }).click();
  await page.getByText(/La dirección de ceros no es válida/).waitFor();
  check("el formulario rechaza dirección de ceros sin enviar una mutación", walletRequests.length === 0);
  await page.getByLabel("Dirección pública de cobro").fill(wallet.address);
  await page.getByLabel("Dirección pública de cobro").evaluate(input => {
    const form = input.closest("form"); form.requestSubmit(); form.requestSubmit();
  });
  await page.getByText("Guardado pendiente de confirmar", { exact: true }).waitFor();
  check("doble submit produce una sola petición de billetera", walletRequests.length === 1 && appliedWallet.ok);
  check("respuesta ambigua bloquea red y dirección sin confirmar éxito", await page.getByLabel("Red de la billetera").isDisabled()
    && await page.getByLabel("Dirección pública de cobro").isDisabled());
  const [retryResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === walletPath && response.status() === 200),
    page.getByRole("button", { name: "Confirmar guardado", exact: true }).click(),
  ]);
  const recovered = await retryResponse.json();
  assert.deepEqual(walletRequests[1], walletRequests[0]);
  check("reintento humano conserva exactamente la acción y los datos", walletRequests.length === 2);
  check("recuperar el resultado no duplica la versión de billetera", recovered.ok && recovered.data.supplier.wallet_version === 1 && appliedWallet.data.supplier.wallet_version === 1);
  await page.unroute(walletPattern, interruptedWallet);
  await page.getByRole("button", { name: "Editar billetera de cobro", exact: true }).waitFor();
  await page.reload();
  check("recargar ficha muestra red y dirección registradas", await page.getByText(wallet.address, { exact: true }).isVisible()
    && await page.getByText("Arbitrum", { exact: true }).isVisible());
  await page.goto(`${baseUrl}/suppliers?wallet_status=configured`);
  await page.getByRole("heading", { name: "Proveedores", exact: true }).waitFor();
  check("lista muestra billetera y red configuradas", await page.getByText(wallet.address, { exact: true }).isVisible()
    && await page.getByText("Billetera registrada · Arbitrum", { exact: true }).isVisible());

  await page.goto(`${baseUrl}/suppliers/${supplierId}`);
  await page.getByRole("button", { name: "Editar proveedor", exact: true }).click();
  const changedName = `${supplierName} editado`;
  const changedPhone = (await unusedPhones(1))[0];
  await page.getByLabel("Nombre del proveedor").fill(changedName);
  await page.getByLabel("Teléfono con código de país").fill(changedPhone);
  await page.getByLabel("Origen del proveedor").selectOption("csv");
  await page.getByLabel("Detalle de la fuente").fill("Archivo ficticio revisado por una persona");
  await page.getByLabel("No contactar por teléfono", { exact: true }).check();
  const [editedResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/crm/suppliers/${supplierId}`),
    page.getByRole("button", { name: "Guardar proveedor", exact: true }).click(),
  ]);
  const edited = await editedResponse.json();
  check("editar nombre, teléfono, fuente y DNC conserva ID", edited.ok && edited.data.supplier.id === supplierId && edited.data.supplier.name === changedName
    && edited.data.supplier.phone_e164 === changedPhone && edited.data.supplier.source.kind === "csv" && edited.data.supplier.do_not_contact);
  check("editar contacto conserva billetera y versión", edited.data.supplier.wallet_version === 1 && edited.data.supplier.collection_wallet.address === wallet.address
    && !Object.hasOwn(editedResponse.request().postDataJSON().input, "collection_wallet"));
  const reimportInput = { name: changedName, organization: "Distribuidora ficticia de insumos", phone_e164: changedPhone, website,
    source: { kind: "csv", label: "Archivo ficticio revisado por una persona", url: null }, do_not_contact: false };
  const importAction = randomUUID();
  const reimport = await (await post("/api/crm/suppliers", importAction, reimportInput)).json();
  check("reimportar con otra acción deduplica y conserva billetera", reimport.ok && !reimport.data.created && reimport.data.supplier.id === supplierId
    && reimport.data.supplier.collection_wallet.address === wallet.address && reimport.data.supplier.wallet_version === 1 && reimport.data.supplier.do_not_contact);
  assert.deepEqual(await (await post("/api/crm/suppliers", importAction, reimportInput)).json(), reimport);
  check("repetir importación recupera el mismo resultado", true);
  check("misma acción con otro payload devuelve 409", (await post("/api/crm/suppliers", importAction, { ...reimportInput, name: "Otro proveedor" })).status() === 409);
  const casing = await (await post(walletPath, randomUUID(), { collection_wallet: { ...wallet, address: wallet.address.toLowerCase() }, expected_wallet_version: 1 })).json();
  check("cambiar solo casing es no-op y conserva casing previo", casing.ok && casing.data.supplier.wallet_version === 1
    && casing.data.supplier.collection_wallet.address === wallet.address && casing.data.supplier.wallet_updated_at === recovered.data.supplier.wallet_updated_at);

  await page.reload();
  await page.getByRole("button", { name: "Editar billetera de cobro", exact: true }).click();
  const changedElsewhere = await (await post(walletPath, randomUUID(), { collection_wallet: alternateWallet, expected_wallet_version: 1 })).json();
  assert.ok(changedElsewhere.ok);
  const [staleResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === walletPath),
    page.getByRole("button", { name: "Guardar billetera", exact: true }).click(),
  ]);
  check("edición desactualizada recibe 409", staleResponse.status() === 409);
  const afterStale = await read(`/api/crm/suppliers/${supplierId}`);
  check("conflicto preserva dirección, red y versión vigentes", afterStale.body.ok && afterStale.body.data.supplier.wallet_version === 2
    && afterStale.body.data.supplier.collection_wallet.chain === "base" && afterStale.body.data.supplier.collection_wallet.address === alternateWallet.address);
  await page.getByRole("button", { name: "Actualizar ficha", exact: true }).click();
  await page.getByText(alternateWallet.address, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar billetera de cobro", exact: true }).click();
  const [clearedResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === walletPath),
    page.getByRole("button", { name: "Quitar billetera registrada", exact: true }).click(),
  ]);
  const cleared = await clearedResponse.json();
  check("quitar billetera es acción humana explícita y versionada", cleared.ok && cleared.data.supplier.collection_wallet === null && cleared.data.supplier.wallet_version === 3);
  await page.getByText("Billetera pendiente", { exact: true }).waitFor();
  await page.reload();
  check("recargar conserva el estado pendiente tras quitar billetera", await page.getByText("Billetera pendiente", { exact: true }).isVisible());
  await page.getByRole("button", { name: "Configurar billetera de cobro", exact: true }).click();
  check("volver a configurar requiere elegir red nuevamente", await page.getByLabel("Red de la billetera").inputValue() === "");
  await page.getByLabel("Red de la billetera").selectOption(wallet.chain);
  await page.getByLabel("Dirección pública de cobro").fill(wallet.address);
  const [configuredResponse] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === walletPath),
    page.getByRole("button", { name: "Guardar billetera", exact: true }).click(),
  ]);
  check("nueva configuración guarda Arbitrum explícito", (await configuredResponse.json()).data.supplier.collection_wallet.chain === "arbitrum");
  check("wallet inyectada en alta de contacto se rechaza", (await post("/api/crm/suppliers", randomUUID(), { ...reimportInput, collection_wallet: wallet })).status() === 400);
  check("empresa inyectada se rechaza", (await post("/api/crm/suppliers", randomUUID(), { ...reimportInput, company_id: config.users[1].company_id })).status() === 400);
  const forgedActor = await context.request.post(`${baseUrl}${walletPath}`, { headers: { Origin: baseUrl }, data: { action_id: randomUUID(),
    input: { collection_wallet: null, expected_wallet_version: 4 }, actor_type: "system" } });
  check("actor inyectado en envelope se rechaza", forgedActor.status() === 400);
  check("CSRF al cambiar billetera se rechaza", (await post(walletPath, randomUUID(), { collection_wallet: null, expected_wallet_version: 4 }, context,
    { Origin: "https://foreign.example" })).status() === 403);
  for (const actorType of ["voice", "system"]) {
    const denied = await suppliersRpc("setSupplierWallet", { contact_id: supplierId, collection_wallet: null, expected_wallet_version: 4 }, actorType);
    check(`${actorType} no cambia billetera aunque tenga rol SQL de servicio`, !denied.ok && denied.error.code === "FORBIDDEN");
  }

  const count = Number(await sql(`select count(*) from public.supplier_profiles where company_id=${quote(account.company_id)}`));
  const phones = await unusedPhones(Math.max(0, 55 - count));
  for (let index = 0; index < phones.length; index++) {
    const seeded = await suppliersRpc("upsertSupplier", { name: `Proveedor paginado ficticio ${String(index).padStart(3, "0")}`, organization: null,
      phone_e164: phones[index], website: null, source: { kind: ["manual", "csv", "firecrawl"][index % 3], label: "Verificación local paginada", url: null } });
    assert.ok(seeded.ok);
  }
  const allIds = JSON.parse(await sql(`select jsonb_agg(contact_id order by contact_id)::text from public.supplier_profiles where company_id=${quote(account.company_id)}`));
  const outsideId = allIds.filter(id => id !== supplierId).at(-1);
  const outsideRead = await suppliersRpc("getSupplier", { contact_id: outsideId });
  const previous = outsideRead.data.supplier;
  const outsideName = `Proveedor fuera de primera página ${key}`;
  const updatedOutside = await suppliersRpc("updateSupplier", { contact_id: outsideId, name: outsideName, organization: previous.organization,
    phone_e164: previous.phone_e164, website: previous.website, source: { kind: "firecrawl", label: "Filtro en servidor", url: null }, do_not_contact: true });
  assert.ok(updatedOutside.ok);
  assert.ok((await suppliersRpc("setSupplierWallet", { contact_id: outsideId, collection_wallet: alternateWallet, expected_wallet_version: updatedOutside.data.supplier.wallet_version })).ok);
  const firstPage = await read("/api/crm/suppliers");
  const nextPage = await read(`/api/crm/suppliers?cursor=${firstPage.body.data.next_cursor}`);
  check("primera página contiene cincuenta proveedores y cursor", firstPage.body.ok && firstPage.body.data.items.length === 50 && firstPage.body.data.next_cursor);
  check("segunda página no repite proveedores", nextPage.body.ok && nextPage.body.data.items.length === allIds.length - 50
    && nextPage.body.data.items.every(item => !firstPage.body.data.items.some(first => first.id === item.id)));
  const searched = await read(`/api/crm/suppliers?query=${encodeURIComponent(outsideName)}`);
  check("búsqueda encuentra proveedor fuera de la primera página", !firstPage.body.data.items.some(item => item.id === outsideId)
    && searched.body.ok && searched.body.data.items.length === 1 && searched.body.data.items[0].id === outsideId);
  for (const [filter, predicate] of [["source=csv", item => item.source.kind === "csv"], ["do_not_contact=true", item => item.do_not_contact],
    ["wallet_status=configured", item => item.collection_wallet !== null], ["wallet_status=pending", item => item.collection_wallet === null]]) {
    const filtered = await read(`/api/crm/suppliers?${filter}`);
    check(`filtro ${filter} se aplica en servidor`, filtered.body.ok && filtered.body.data.items.length > 0 && filtered.body.data.items.every(predicate));
  }
  await page.goto(`${baseUrl}/suppliers`);
  await page.getByRole("heading", { name: "Proveedores", exact: true }).waitFor();
  check("interfaz muestra cincuenta proveedores por página", await page.getByRole("link", { name: /^Ver proveedor / }).count() === 50);
  await page.getByRole("link", { name: "Siguiente página", exact: true }).click();
  await page.getByText(outsideName, { exact: true }).waitFor();
  check("navegación muestra el resto sin duplicar", await page.getByRole("link", { name: /^Ver proveedor / }).count() === allIds.length - 50);
  await page.getByLabel("Buscar proveedores", { exact: true }).fill(outsideName);
  await page.getByLabel("Origen", { exact: true }).selectOption("firecrawl");
  await page.getByLabel("Preferencia de contacto", { exact: true }).selectOption("true");
  await page.getByLabel("Billetera de cobro", { exact: true }).selectOption("configured");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await page.waitForURL(url => url.searchParams.get("query") === outsideName && !url.searchParams.has("cursor"));
  await page.getByText(outsideName, { exact: true }).waitFor();
  check("UI combina búsqueda, origen, DNC y billetera antes de paginar", await page.getByRole("link", { name: /^Ver proveedor / }).count() === 1);

  const otherContext = await browser.newContext();
  otherContext.setDefaultTimeout(20_000);
  const otherPage = await otherContext.newPage();
  await login(otherPage, config.users[1]);
  const foreign = await read(`/api/crm/suppliers/${supplierId}`, otherContext);
  check("otra empresa no obtiene proveedor por API", foreign.response.status() === 404);
  const foreignPage = await otherPage.goto(`${baseUrl}/suppliers/${supplierId}`);
  check("ficha ajena devuelve HTTP 404 sin datos", foreignPage.status() === 404 && !(await otherPage.locator("main").innerText()).includes(changedName));
  const foreignWrite = await post(walletPath, randomUUID(), { collection_wallet: null, expected_wallet_version: 4 }, otherContext);
  check("otra empresa no modifica billetera", foreignWrite.status() === 404);
  const otherList = await read("/api/crm/suppliers", otherContext);
  check("lista de otra empresa no filtra proveedores ajenos", otherList.body.ok && otherList.body.data.items.length === 0);
  await otherContext.close();

  const previews = path.join(import.meta.dirname, "supplier-previews");
  await mkdir(previews, { recursive: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${baseUrl}/suppliers?wallet_status=configured`);
    await page.getByRole("heading", { name: "Proveedores", exact: true }).waitFor();
    check(`lista y filtros caben en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 1440) await page.screenshot({ path: path.join(previews, "suppliers-desktop.png"), fullPage: false });
    await page.goto(`${baseUrl}/suppliers/${supplierId}`);
    await page.getByRole("heading", { name: changedName, exact: true }).waitFor();
    check(`ficha y dirección completa caben en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 390) await page.screenshot({ path: path.join(previews, "supplier-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Editar billetera de cobro", exact: true }).click();
    check(`formulario de billetera cabe en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "Cerrar formulario de billetera", exact: true }).click();
    await page.getByRole("button", { name: "Editar proveedor", exact: true }).click();
    check(`formulario de proveedor cabe en ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check("sin errores de JavaScript", runtimeErrors.length === 0);
  check("sin escrituras a pagos, órdenes o Voz", prohibitedWrites.length === 0);
  check("browser no solicita servicios externos ni RPC onchain", externalRequests.length === 0);
  console.log(JSON.stringify({ assertions, runtimeErrors, mode: "Real PostgreSQL; synthetic Auth/PostgREST and wallet metadata; no hosted Supabase or real ARGt" }));
} finally { await context.close(); await browser.close(); }
