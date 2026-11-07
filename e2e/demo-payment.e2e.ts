import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { resolve } from "node:path";

let server: ViteDevServer, origin: string;
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { "next/navigation": resolve("e2e/fixtures/demo-payment-navigation.ts") } },
    server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "demo-payment-fixture", configureServer(vite) {
      vite.middlewares.use("/__demo_payment_test", (_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/e2e/fixtures/demo-payment-entry.tsx"></script>'); });
    } }] });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Local fixture did not start");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

test("una recuperación de demo exige una nueva confirmación y conserva la acción", async ({ page }) => {
  const actions: string[] = [];
  await page.route("**/api/crm/orders/*/demo-payment", async route => {
    const body = route.request().postDataJSON() as { action_id: string; input: unknown };
    expect(body.input).toEqual({}); actions.push(body.action_id);
    await route.fulfill({ json: { ok: true, data: { payment: { id: "90000000-0000-4000-8000-000000000001", status: actions.length === 1 ? "reserved" : "unknown",
      tx_hash: null, explorer_url: null, amount_atomic: "1000000000000000000", token: "ARGt", chain: "arbitrum" } } } });
  });
  await page.goto(`${origin}/__demo_payment_test`);
  const checkbox = page.getByRole("checkbox"), send = page.getByRole("button", { name: "Enviar 1 ARGt de demo" });
  await expect(send).toBeDisabled();
  await checkbox.check(); await send.click();
  const resume = page.getByRole("button", { name: "Continuar intento de demo" });
  await expect(resume).toBeDisabled(); await expect(checkbox).not.toBeChecked();
  await checkbox.check(); await resume.click();
  await expect(resume).toHaveCount(0);
  expect(actions).toHaveLength(2); expect(actions[0]).toBe(actions[1]);
});

test("el resultado ambiguo desplaza un estado reservado anterior", async ({ page }) => {
  await page.route("**/api/crm/orders/*/demo-payment", async route => route.fulfill({ json: { ok: true, data: { payment: {
    id: "90000000-0000-4000-8000-000000000001", status: "unknown", tx_hash: null, explorer_url: null,
    amount_atomic: "1000000000000000000", token: "ARGt", chain: "arbitrum" } } } }));
  await page.goto(`${origin}/__demo_payment_test?stale=1`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar intento de demo" }).click();
  await expect(page.getByRole("button", { name: "Continuar intento de demo" })).toHaveCount(0);
});

test("un estado incierto del servidor desplaza una reserva local anterior", async ({ page }) => {
  await page.route("**/api/crm/orders/*/demo-payment", async route => route.fulfill({ json: { ok: true, data: { payment: {
    id: "90000000-0000-4000-8000-000000000001", status: "reserved", tx_hash: null, explorer_url: null,
    amount_atomic: "1000000000000000000", token: "ARGt", chain: "arbitrum" } } } }));
  await page.goto(`${origin}/__demo_payment_test`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enviar 1 ARGt de demo" }).click();
  await expect(page.getByRole("button", { name: "Continuar intento de demo" })).toBeVisible();
  await page.getByRole("button", { name: "Simular estado del servidor" }).click();
  await expect(page.getByRole("button", { name: "Continuar intento de demo" })).toHaveCount(0);
});
