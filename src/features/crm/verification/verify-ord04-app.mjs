// Local UI verification, synthetic Auth/PostgREST + real isolated PostgreSQL.
// External server fetches are blocked by the verification launcher.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
const base = "http://localhost:3101";
const config = JSON.parse(await readFile(path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
assert.equal(config.apiUrl, "http://127.0.0.1:55440");
assert.ok(config.ord04 && config.users[0].company_name === "Sur Insumos");
const account = config.users[0];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20_000);
let count = 0;
const check = (name, ok) => { assert.ok(ok, name); count++; console.log(`PASS ${name}`); };
const errors = [], unsafe = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => {
  const url = new URL(request.url());
  if ((request.method() === "POST" && /\/api\/(voice|payments)|\/pay$/.test(url.pathname))
    || (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname))) unsafe.push(url.pathname);
});
const nav = () => page.getByRole("navigation", { name: "Menú principal" });
async function active(href) {
  check(`selección única en ${href}`, await nav().locator('[aria-current="page"]').count() === 1
    && await nav().locator('[aria-current="page"]').getAttribute("href") === href);
}
try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Correo").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(/\/login\/companies/);
  await page.getByRole("button", { name: "Sur Insumos", exact: true }).click();
  await page.getByRole("button", { name: "Sur Insumos (seleccionada)", exact: true }).waitFor();
  await page.goto(`${base}/purchases/new`);
  await page.getByRole("heading", { name: "Nueva compra", exact: true }).waitFor();
  const labels = await nav().getByRole("link").allTextContents();
  check("menú contiene los cuatro pasos nuevos", labels.join("|") === "Nueva compra|Proveedores|Cotizaciones|Pagos");
  check("menú oculta pipeline, tareas y prospección de clientes", !/Pipeline|Tareas|Prospección|Agente/.test(await nav().innerText()));
  await active("/purchases/new");
  await page.getByLabel("Qué necesitás comprar").fill("Compra desde menú · Datos de prueba");
  await page.getByLabel(/Cantidad/).fill("500");
  await page.getByLabel("Unidad", { exact: true }).fill("unidades");
  await page.getByLabel(/Para cuándo/).fill(config.ord04.needed_by);
  await page.getByLabel(/Presupuesto total/).fill("100000");
  await page.getByLabel("Zona de entrega", { exact: true }).fill("CABA");
  await page.getByRole("button", { name: "Crear compra", exact: true }).click();
  await page.getByText("Creamos la compra", { exact: true }).waitFor();
  check("Nueva compra guarda mediante BUY-01", /created=/.test(page.url()));
  await nav().getByRole("link", { name: "Proveedores", exact: true }).click();
  await page.getByRole("heading", { name: "Proveedores", exact: true }).waitFor();
  await active("/suppliers");
  check("Sur Insumos tiene dos ejemplos y el slot pendiente rotulado", (await page.locator("main").innerText()).includes("Proveedor ejemplo 1")
    && (await page.locator("main").innerText()).includes("Pendiente proveedor real"));
  await page.getByRole("link", { name: "Cotizar una compra", exact: true }).click();
  await page.getByRole("heading", { name: "Compras de tu empresa", exact: true }).waitFor();
  await active("/orders/quotes");
  check("compra recién creada aparece sin copiar IDs", await page.getByRole("heading", { name: "Compra desde menú · Datos de prueba", exact: true }).isVisible());
  check("selector no pide UUID manual", await page.locator('input[name="purchase_request_id"]').count() === 0);
  await page.locator(`a[href="/calls/quotes/import?purchase_request_id=${config.ord04.purchase_request_id}"]`).click();
  await page.getByRole("heading", { name: "Traer cotización de una llamada", exact: true }).waitFor();
  await active("/orders/quotes");
  check("la pantalla de cotización recibe la compra de 500 vasos", (await page.locator("main").innerText()).includes("500 unidades de Vasos de papel 240 cc"));
  await page.getByRole("link", { name: "Abrir el comparador de esta compra", exact: true }).click();
  await page.getByRole("heading", { name: "Comparar cotizaciones", exact: true }).waitFor();
  await active("/orders/quotes");
  check("solo se muestran las dos cotizaciones realmente preparadas", await page.getByRole("table").locator("tbody tr").count() === 2);
  check("ejemplos no habilitan crear órdenes ni simulan llamada real", await page.getByRole("button", { name: "Crear orden de compra", exact: true }).count() === 0
    && !/Llamada telefónica|Llamada real/.test(await page.locator("main").innerText()));
  const directory = path.join(process.cwd(), "src/features/crm/verification/ord04-previews");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, "demo-desktop.png"), fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    check(`navegación y contenido caben a ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`cuatro etiquetas completas a ${width}px`, (await nav().getByRole("link").allTextContents()).join("|") === "Nueva compra|Proveedores|Cotizaciones|Pagos");
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: path.join(directory, "demo-mobile.png"), fullPage: true });
  await nav().getByRole("link", { name: "Pagos", exact: true }).click();
  await page.getByRole("heading", { name: "Órdenes de compra", exact: true }).waitFor();
  await active("/orders");
  check("Pagos conserva estado vacío sin inventar transferencias", (await page.locator("main").innerText()).includes("Todavía no hay órdenes de compra"));
  check("ninguna llamada, pago o solicitud externa del navegador", unsafe.length === 0);
  check("cero errores JavaScript", errors.length === 0);
  console.log(`ORD04_BROWSER_ASSERTIONS=${count}; REAL_CALL=pending; PAY=unavailable; DATA=fictional`);
} finally { await browser.close(); }
