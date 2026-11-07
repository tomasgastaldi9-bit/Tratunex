// Real application modules and isolated PostgreSQL; synthetic Auth/PostgREST.
// All suppliers/quotes are fictional. No model API, calls or payments.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.CRM_BASE_URL || "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Local verification only");
const config = JSON.parse(await readFile(path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
if (config.apiUrl !== "http://127.0.0.1:55440" || !config.ord02) throw new Error("Expected the owned ORD-02 fixture");
const account = config.users[0];
const comparisonUrl = `${baseUrl}/orders/quotes?purchase_request_id=${config.ord02.purchase_a_id}`;
let assertions = 0;
const check = (label, value) => { assert.ok(value, label); assertions++; console.log(`PASS ${label}`); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(20_000);
const page = await context.newPage();
const errors = [], external = [], mutations = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => {
  const url = new URL(request.url());
  if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) external.push(url.hostname);
  if (["POST", "PATCH", "DELETE"].includes(request.method()) && /\/api\/(crm|voice|payments)/.test(url.pathname)) mutations.push({ path: url.pathname, body: request.postData() });
});
try {
  await page.goto(comparisonUrl);
  await page.getByRole("link", { name: "Seleccionar empresa" }).waitFor();
  check("comparador requiere sesión y empresa", true);
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Correo").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(/\/login\/companies/);
  await page.getByRole("button", { name: account.company_name, exact: true }).click();
  await page.getByRole("button", { name: `${account.company_name} (seleccionada)`, exact: true }).waitFor();
  await page.goto(`${baseUrl}/orders/quotes`);
  await page.getByRole("heading", { name: "Compras de tu empresa", exact: true }).waitFor();
  check("entrada no expone un formulario de UUID", await page.locator('input[name="purchase_request_id"]').count() === 0);
  await page.locator(`a[href="/orders/quotes?purchase_request_id=${config.ord02.purchase_a_id}"]`).click();
  await page.getByRole("heading", { name: "Comparar cotizaciones", exact: true }).waitFor();
  const table = page.getByRole("table");
  await table.waitFor();
  const rows = table.locator("tbody tr");
  check("se muestran tres cotizaciones de la compra", await rows.count() === 3);
  check("la compra conserva la empresa activa", (await page.locator("main").innerText()).includes(account.company_name));
  check("solo una fila aparece recomendada", await table.locator('tbody tr[data-recommended="true"]').count() === 1);
  const recommended = table.locator('tbody tr[data-recommended="true"]');
  check("recomendado corresponde a la cotización web elegida por BUY-03", (await recommended.innerText()).includes("Datos de prueba: Web ficticia"));
  check("explicación se identifica como reglas, sin atribuir IA ejecutada", await page.getByText("Reglas", { exact: true }).isVisible() && await page.getByText("IA", { exact: true }).count() === 0);
  check("explicación de la recomendación está visible", await page.getByText("Proveedor recomendado", { exact: true }).isVisible());
  for (const label of ["Proveedor", "Precio y total", "Stock", "Entrega y condiciones", "Acepta ARGt", "Origen", "Evaluación"]) {
    check(`columna ${label} visible`, await table.getByRole("columnheader", { name: label, exact: true }).isVisible());
  }
  const recommendedText = await recommended.innerText();
  check("precios y totales conservan ARS exactos", recommendedText.includes("ARS 12,5") && recommendedText.includes("ARS 50"));
  check("política manual se muestra sin ejecutar pago", recommendedText.includes("Requiere aprobación"));
  check("ejemplos persistidos se rotulan", await rows.filter({ has: page.getByText("Ejemplo (datos de prueba)", { exact: true }) }).count() === 2);
  const unknown = rows.filter({ hasText: "Datos de prueba: Ejemplo sin confirmar" });
  const unknownText = await unknown.innerText();
  check("precio y stock desconocidos siguen pendientes", unknownText.includes("Precio pendiente") && unknownText.includes("sin confirmar") && !unknownText.includes("USD 0"));
  check("cotización desconocida no califica ni resulta recomendada", unknownText.includes("No califica en el ranking") && await unknown.getAttribute("data-recommended") !== "true");
  check("solo la fila cuyo origen no es example permite crear orden", await page.getByRole("button", { name: "Crear orden de compra", exact: true }).count() === 1);
  check("la lectura no genera mutaciones", mutations.length === 0);
  const screenshots = path.join(process.cwd(), "src/features/crm/verification/quote-previews");
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "quotes-desktop.png"), fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    check(`comparación no desborda a ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const cards = page.getByRole("region", { name: "Cotizaciones en tarjetas" });
    // The section may not expose region when unnamed semantics are unavailable;
    // the source markup always carries aria-label for an exact DOM fallback.
    const container = await cards.count() ? cards : page.locator('section[aria-label="Cotizaciones en tarjetas"]');
    check(`tres tarjetas accesibles a ${width}px`, await container.locator(":scope > div").count() === 3 && await container.isVisible());
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: path.join(screenshots, "quotes-mobile.png"), fullPage: true });
  await page.goto(`${baseUrl}/orders/quotes?purchase_request_id=${config.ord02.purchase_b_id}`);
  await page.getByText("Esta compra no está disponible", { exact: true }).waitFor();
  check("otra empresa no filtra compra ni cotizaciones", !(await page.locator("main").innerText()).includes("Ejemplo de empresa B"));
  await page.goto(`${baseUrl}/orders/quotes?purchase_request_id=no-uuid`);
  await page.getByText("Revisá la solicitud de compra", { exact: true }).waitFor();
  check("ID inválido presenta error explícito", true);
  await page.goto(`${baseUrl}/orders/quotes/example`);
  await page.getByText("comparación ilustrativa con datos ficticios").waitFor();
  check("ejemplo separado permanece sin acciones de compra", await page.getByRole("button", { name: "Crear orden de compra", exact: true }).count() === 0 && mutations.length === 0);
  await page.goto(comparisonUrl);
  const responsePromise = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/crm/orders");
  await page.getByRole("button", { name: "Crear orden de compra", exact: true }).click();
  const response = await responsePromise;
  const created = await response.json();
  check("elección crea la orden persistida de esa cotización", response.status() === 200 && created.ok && created.data.order.supplier_quote_id === config.ord02.quote_a_web_id);
  await page.waitForURL(new RegExp(`/orders/${created.data.order.id}$`));
  await page.getByRole("heading", { name: "Orden de compra", exact: true }).waitFor();
  const envelope = JSON.parse(mutations[0].body);
  check("cliente envía solo quote_id y action_id, sin precio ni billetera", mutations.length === 1 && Object.keys(envelope).sort().join(",") === "action_id,input"
    && Object.keys(envelope.input).join(",") === "supplier_quote_id");
  check("orden deriva ARGt nominal exacto de ARS 50", created.data.order.amount_atomic === "50000000000000000000" && created.data.order.quoted_currency === "ARS");
  check("la navegación termina en orden pendiente y pago deshabilitado", created.data.order.status === "awaiting_approval" && await page.getByRole("button", { name: "Aprobar y pagar", exact: true }).isDisabled());
  check("ninguna acción llamó o pagó", mutations.every(item => item.path === "/api/crm/orders"));
  check("cero errores JavaScript", errors.length === 0);
  check("cero solicitudes externas del navegador", external.length === 0);
  console.log(`ORD02_BROWSER_ASSERTIONS=${assertions}; EXPLANATION=rules; DATA=fictional; PAYMENTS=unavailable`);
} finally { await browser.close(); }
