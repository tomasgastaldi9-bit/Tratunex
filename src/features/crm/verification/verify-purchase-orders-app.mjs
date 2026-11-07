// Local-only verification: synthetic Auth/PostgREST, isolated PostgreSQL and
// explicitly fictional quotes (including future ARGt). No network payment port.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.CRM_BASE_URL || "http://localhost:3101";
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) throw new Error("Local verification only");
const config = JSON.parse(await readFile(path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
if (config.apiUrl !== "http://127.0.0.1:55440" || !config.ord03) throw new Error("Expected the owned ORD-03 fixture");
const account = config.users[0];
let assertions = 0;
const check = (label, value) => { assert.ok(value, label); assertions++; console.log(`PASS ${label}`); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const external = [];
const browserPayments = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => {
  const url = new URL(request.url());
  if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) external.push(url.hostname);
  if (request.method() === "POST" && /\/pay$/.test(url.pathname)) browserPayments.push(url.pathname);
});
const post = (target, action_id, input, headers = {}) => context.request.post(`${baseUrl}${target}`, {
  headers: { Origin: baseUrl, "Idempotency-Key": action_id, ...headers }, data: { action_id, input },
});
try {
  await page.goto(`${baseUrl}/orders`);
  await page.getByRole("link", { name: "Seleccionar empresa" }).waitFor();
  check("sin sesión se requiere seleccionar empresa", true);
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Correo").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(/\/login\/companies/);
  await page.getByRole("button", { name: account.company_name, exact: true }).click();
  await page.getByRole("button", { name: `${account.company_name} (seleccionada)`, exact: true }).waitFor();
  await page.goto(`${baseUrl}/orders`);
  await page.getByRole("heading", { name: "Órdenes de compra", exact: true }).waitFor();
  check("lista muestra la empresa autenticada", (await page.locator("main").innerText()).includes(account.company_name));

  const action = randomUUID();
  const input = { supplier_quote_id: config.ord03.quote_a_ready_id };
  const created = await post("/api/crm/orders", action, input);
  const body = await created.json();
  check("creación toma únicamente la cotización del servidor", created.status() === 200 && body.ok && typeof body.data.created === "boolean");
  const order = body.data.order;
  check("datos ficticios ARGt conservan atómicos exactos y no aprueban", order.status === "awaiting_approval" && order.amount_atomic !== null && typeof order.amount_atomic === "string");
  const replay = await (await post("/api/crm/orders", action, input)).json();
  check("mismo action_id recupera la misma orden", replay.ok && replay.data.order.id === order.id);
  const dedup = await (await post("/api/crm/orders", randomUUID(), input)).json();
  check("otra acción para la misma cotización no duplica orden", dedup.ok && !dedup.data.created && dedup.data.order.id === order.id);
  check("precio inyectado por navegador se rechaza", (await post("/api/crm/orders", randomUUID(), { ...input, amount_atomic: "1" })).status() === 400);
  check("CSRF se rechaza", (await post("/api/crm/orders", randomUUID(), input, { Origin: "https://example.test" })).status() === 403);
  check("orden de otra empresa permanece oculta", (await context.request.get(`${baseUrl}/api/crm/orders/${config.ord03.order_b_id}`)).status() === 404);
  check("ID de orden inválido se rechaza", (await context.request.get(`${baseUrl}/api/crm/orders/no-uuid`)).status() === 400);

  const refusedPay = await post(`/api/crm/orders/${order.id}/pay`, randomUUID(), { expected_version: order.version });
  check("PAY deshabilitado responde 503", refusedPay.status() === 503 && !(await refusedPay.json()).ok);
  const after = await (await context.request.get(`${baseUrl}/api/crm/orders/${order.id}`)).json();
  check("PAY ausente no cambia aprobación ni versión", after.ok && after.data.order.status === "awaiting_approval" && after.data.order.version === order.version);

  await page.goto(`${baseUrl}/orders/${order.id}`);
  await page.getByRole("heading", { name: "Orden de compra", exact: true }).waitFor();
  check("botón pagar permanece deshabilitado", await page.getByRole("button", { name: "Aprobar y pagar", exact: true }).isDisabled());
  check("no se inventa hash de pago", await page.locator('a[href^="https://arbiscan.io/tx/"]').count() === 0);
  const beforeVersion = after.data.order.version;
  await page.getByRole("button", { name: "Actualizar datos de la orden", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Actualizamos los datos guardados de la orden." }).waitFor();
  const refreshed = await (await context.request.get(`${baseUrl}/api/crm/orders/${order.id}`)).json();
  check("actualización humana incrementa versión sin aprobar", refreshed.ok && refreshed.data.order.version === beforeVersion + 1 && refreshed.data.order.status === "awaiting_approval");

  const screenshots = path.join(process.cwd(), "src/features/crm/verification/order-previews");
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "order-desktop.png"), fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    check(`ficha no desborda a ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.screenshot({ path: path.join(screenshots, "order-mobile.png"), fullPage: true });
  await page.goto(`${baseUrl}/orders`);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    check(`lista no desborda a ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check("el navegador no inició pagos", browserPayments.length === 0);
  check("cero errores JavaScript", errors.length === 0);
  check("cero solicitudes externas del navegador", external.length === 0);
  console.log(`ORD03_BROWSER_ASSERTIONS=${assertions}; PAYMENT_MODE=unavailable; QUOTE_MODE=fictional-future-ARGt`);
} finally {
  await browser.close();
}
