import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Use the platform's local @playwright/test installation by default.
// PLAYWRIGHT_MODULE_PATH optionally selects another existing installation.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "@playwright/test"));
} catch {
  throw new Error("Playwright no disponible. Ejecutá npm ci; opcionalmente definí PLAYWRIGHT_MODULE_PATH con otra instalación existente.");
}

const baseUrl = process.env.CRM_BASE_URL || "http://localhost:3100";
const fixtures = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../mocks/fixtures.json"), "utf8"));
const previews = path.join(import.meta.dirname, "previews");
const prisma = fixtures.companies[0].id;
const orbita = fixtures.companies[1].id;
const counts = { assertions: 0 };
const check = (message, actual) => {
  assert.ok(actual, message);
  counts.assertions += 1;
  console.log(`PASS ${message}`);
};

const browser = await chromium.launch({ channel: process.env.CRM_BROWSER_CHANNEL || "chrome", headless: true });
try {
  await (async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/Failed to load resource.*404/.test(message.text())) {
      runtimeErrors.push(message.text());
    }
  });
  const navigate = async (pathname, demo = "prisma") => {
    const response = await page.goto(`${baseUrl}${pathname}${pathname.includes("?") ? "&" : "?"}demo=${demo}`);
    await page.locator("h1").last().waitFor();
    return response;
  };
  const fitsViewport = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  // Next may retain a hidden streamed loading boundary before hydration cleanup.
  const mainText = () => page.locator("main").last().innerText();
  const ownDeals = company => fixtures.deals.filter(item => item.company_id === company);
  const ownTasks = company => fixtures.tasks.filter(item => item.company_id === company);
  const contactPath = id => `/contacts/${id}`;
  const rich = fixtures.contacts.find(contact => contact.company_id === prisma && fixtures.tasks.some(task => task.contact_id === contact.id) && fixtures.call_results.some(result => result.contact_id === contact.id));
  const capturePreviews = async () => {
    fs.mkdirSync(previews, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [pathname, filename] of [["/pipeline", "pipeline.png"], ["/contacts", "contacts.png"], [contactPath(rich.id), "contact.png"], ["/tasks", "tasks.png"]]) {
      await navigate(pathname);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(previews, filename), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await navigate(contactPath(rich.id));
    await page.screenshot({ path: path.join(previews, "mobile.png"), fullPage: true });
  };

  // After a full development run, refresh the artifacts against next start
  // without repeating the complete interaction suite or showing dev overlays.
  if (process.env.CRM_CAPTURE_ONLY === "1") {
    for (const pathname of ["/pipeline", "/contacts", contactPath(rich.id), "/tasks"]) {
      check(`ruta de producción disponible: ${pathname}`, (await navigate(pathname)).status() === 200);
    }
    const foreign = fixtures.contacts.find(contact => contact.company_id === prisma);
    check("producción rechaza contacto ajeno con 404", (await navigate(contactPath(foreign.id), "orbita")).status() === 404);
    const returnLink = page.getByRole("link", { name: "Volver al pipeline", exact: true });
    await page.waitForFunction(() => document.querySelector('a[href="/pipeline?demo=orbita"]'));
    await returnLink.click();
    await page.waitForURL(url => url.pathname === "/pipeline" && url.searchParams.get("demo") === "orbita");
    check("volver desde 404 conserva la demo Órbita", await page.locator(".crm-deal-card").count() === ownDeals(orbita).length);
    check("producción rechaza contacto inválido con 404", (await navigate("/contacts/no-es-un-uuid")).status() === 404);
    await capturePreviews();
    check("sin errores de navegador al capturar producción", runtimeErrors.length === 0);
    console.log(JSON.stringify({ mode: "mock", captureOnly: true, baseUrl, assertions: counts.assertions, runtimeErrors, screenshots: ["pipeline.png", "contacts.png", "contact.png", "tasks.png", "mobile.png"] }));
    return;
  }

  const rootResponse = await page.goto(baseUrl);
  await page.locator(".crm-pipeline-column").first().waitFor();
  check("home abre el pipeline", rootResponse.ok() && new URL(page.url()).pathname === "/pipeline");
  check("modo mock visible", /mock/i.test(await page.locator("body").innerText()));
  check("pipeline contiene las siete etapas", await page.locator(".crm-pipeline-column").count() === 7);
  check("pipeline muestra oportunidades de Prisma", await page.locator(".crm-deal-card").count() === ownDeals(prisma).length);
  check("pipeline desktop sin desbordamiento de página", await fitsViewport());
  await page.evaluate(() => document.fonts.ready);
  check("fuente Inter local cargada", await page.evaluate(() => Array.from(document.fonts).some(font => font.family.replaceAll('"', "") === "Inter" && font.status === "loaded")));

  for (const contact of fixtures.contacts.filter(item => item.company_id === orbita)) {
    check(`datos ajenos ausentes incluso del HTML: ${contact.name}`, !(await page.content()).includes(contact.name));
  }

  const search = page.getByRole("searchbox", { name: "Buscar oportunidad" });
  await search.fill("sin-resultados-8295");
  check("búsqueda sin coincidencias vacía las tarjetas", await page.locator(".crm-deal-card").count() === 0);
  check("búsqueda vacía comunica el resultado", /sin|ningun|no encontr/i.test(await mainText()));
  await search.fill("");
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  check("lista muestra todas las oportunidades propias", await page.locator(".crm-deal-table tbody tr").count() === ownDeals(prisma).length);
  check("vista lista anunciada como activa", await page.getByRole("button", { name: "Lista", exact: true }).getAttribute("aria-pressed") === "true");

  const multiple = fixtures.contacts.find(contact => contact.company_id === prisma && ownDeals(prisma).filter(deal => deal.contact_id === contact.id).length > 1);
  await search.fill(multiple.name);
  check("búsqueda conserva varias oportunidades del mismo contacto", await page.locator(".crm-deal-table tbody tr").count() === ownDeals(prisma).filter(deal => deal.contact_id === multiple.id).length);
  await search.fill("");
  await page.getByLabel("Filtrar por etapa").selectOption("potential_client");
  check("filtro de etapa respeta el pipeline", await page.locator(".crm-deal-table tbody tr").count() === ownDeals(prisma).filter(deal => deal.stage === "potential_client").length);
  await page.getByLabel("Filtrar por etapa").selectOption("all");
  await page.locator(".crm-deal-table tbody a").first().click();
  await page.locator(".crm-contact-grid").waitFor();
  check("desde la oportunidad se abre un contacto", new URL(page.url()).pathname.startsWith("/contacts/") && /Demo/.test(await page.locator("h1").innerText()));
  check("detalle conserva empresa de demostración", new URL(page.url()).searchParams.get("demo") === "prisma");
  check("la llamada permanece explícitamente deshabilitada", await page.getByRole("button", { name: /llamar/i }).isDisabled());

  const dnc = fixtures.contacts.find(contact => contact.company_id === prisma && contact.do_not_contact);
  await navigate(contactPath(dnc.id));
  check("pedido de no contactar visible", /no contactar/i.test(await mainText()));
  check("no contactar mantiene bloqueada la llamada", await page.getByRole("button", { name: /llamar/i }).isDisabled());

  const unknown = fixtures.call_previews.find(call => call.company_id === prisma && call.status === "unknown");
  await navigate(contactPath(unknown.contact_id));
  check("último intento desconocido se muestra como ambiguo", /último intento con estado desconocido/i.test(await mainText()));
  const oldResult = fixtures.call_results.find(result => result.company_id === prisma && result.contact_id === unknown.contact_id);
  check("resultado final anterior se conserva", (await mainText()).includes(oldResult.summary));

  await page.getByLabel("Empresa de demostración").selectOption("orbita");
  await page.waitForURL(url => url.pathname === "/pipeline" && url.searchParams.get("demo") === "orbita");
  await page.locator(".crm-pipeline-column").first().waitFor();
  check("cambiar empresa desde detalle vuelve al pipeline", new URL(page.url()).pathname === "/pipeline");
  check("empresa Órbita solo muestra sus oportunidades", await page.locator(".crm-deal-card").count() === ownDeals(orbita).length);
  for (const contact of fixtures.contacts.filter(item => item.company_id === prisma)) {
    check(`Órbita excluye datos de Prisma de la vista: ${contact.name}`, !(await mainText()).includes(contact.name));
  }
  // A client-side navigation keeps the previous document's initial RSC scripts.
  // Check serialization on a fresh server response, not that prior document.
  await navigate("/pipeline", "orbita");
  for (const contact of fixtures.contacts.filter(item => item.company_id === prisma)) {
    check(`respuesta nueva de Órbita excluye datos de Prisma: ${contact.name}`, !(await page.content()).includes(contact.name));
  }

  const foreign = fixtures.contacts.find(contact => contact.company_id === prisma);
  const foreignResponse = await navigate(contactPath(foreign.id), "orbita");
  check("contacto de otra demo responde 404", foreignResponse.status() === 404);
  check("404 no expone el contacto ajeno", !(await page.content()).includes(foreign.name));
  const invalidResponse = await navigate("/contacts/no-es-un-uuid");
  check("contacto con identificador inválido responde 404", invalidResponse.status() === 404);

  const invalidDemoResponse = await navigate("/pipeline", "empresa-no-permitida");
  const invalidDemoText = await mainText();
  check("demo arbitraria se rechaza o usa solo fixture predeterminado", invalidDemoResponse.status() === 404 || (await page.locator(".crm-deal-card").count() === ownDeals(prisma).length && !invalidDemoText.includes("Inés Demo")));
  await navigate(`/pipeline?company_id=${orbita}`);
  check("company_id de query no redefine contexto de demo", await page.locator(".crm-deal-card").count() === ownDeals(prisma).length && !(await mainText()).includes("Inés Demo"));

  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Contactos", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/contacts");
  await page.getByRole("heading", { name: "Contactos", exact: true }).waitFor();
  check("navegación abre contactos", new URL(page.url()).pathname === "/contacts");
  check("contactos contiene una fila por persona", await page.locator(".crm-contacts-table tbody tr").count() === fixtures.contacts.filter(item => item.company_id === prisma).length);
  const contactLinks = await page.locator(".crm-contacts-table tbody a").evaluateAll(links => links.map(link => link.getAttribute("href")));
  check("varias oportunidades no duplican contactos", new Set(contactLinks).size === contactLinks.length);
  await page.getByRole("searchbox", { name: "Buscar contactos" }).fill(multiple.name);
  check("búsqueda de contactos devuelve una persona", await page.locator(".crm-contacts-table tbody tr").count() === 1);
  await page.locator(".crm-contacts-table tbody a").first().click();
  await page.locator(".crm-contact-grid").waitFor();
  check("lista de contactos abre el detalle correcto", await page.locator("h1").innerText() === multiple.name);
  await navigate("/contacts", "orbita");
  check("lista de contactos cambia de empresa", await page.locator(".crm-contacts-table tbody tr").count() === fixtures.contacts.filter(item => item.company_id === orbita).length);

  await navigate("/tasks");
  await page.getByLabel("Filtrar tareas").selectOption("all");
  check("tareas muestran todos los estados de la empresa", await page.locator(".crm-task-table tbody tr").count() === ownTasks(prisma).length);
  check("revisión sin fecha se presenta explícitamente", /fecha por definir|sin fecha/i.test(await mainText()));
  await page.getByLabel("Filtrar tareas").selectOption("pending");
  check("filtro tareas pendientes", await page.locator(".crm-task-table tbody tr").count() === ownTasks(prisma).filter(task => task.status === "pending").length);
  await page.getByLabel("Filtrar tareas").selectOption("all");
  await page.getByLabel("Empresa de demostración").selectOption("orbita");
  await page.waitForURL(url => url.searchParams.get("demo") === "orbita");
  check("tareas siguen el cambio de empresa", await page.locator(".crm-task-table tbody tr").count() === ownTasks(orbita).length);

  await capturePreviews();

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await navigate("/pipeline");
    check(`pipeline tablero cabe en ${width}px`, await fitsViewport());
    await page.getByRole("button", { name: "Lista", exact: true }).click();
    check(`pipeline lista cabe en ${width}px`, await fitsViewport());
    await navigate(contactPath(rich.id));
    check(`detalle cabe en ${width}px`, await fitsViewport());
    if (width === 390) await page.screenshot({ path: path.join(previews, "mobile.png"), fullPage: true });
    await navigate("/tasks");
    check(`tareas caben en ${width}px`, await fitsViewport());
    await navigate("/contacts");
    check(`contactos caben en ${width}px`, await fitsViewport());
    if (width === 320) {
      await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
      check("menú móvil anuncia que está abierto", await page.getByRole("button", { name: "Cerrar menú", exact: true }).getAttribute("aria-expanded") === "true");
      await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Seguimientos", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/tasks");
      check("navegación móvil cierra el menú", await page.getByRole("button", { name: "Abrir menú", exact: true }).getAttribute("aria-expanded") === "false");
    }
  }
  check("sin errores de JavaScript en el navegador", runtimeErrors.length === 0);
  console.log(JSON.stringify({ mode: "mock", baseUrl, assertions: counts.assertions, runtimeErrors, screenshots: ["pipeline.png", "contacts.png", "contact.png", "tasks.png", "mobile.png"] }));
  })();
} finally {
  await browser.close();
}
