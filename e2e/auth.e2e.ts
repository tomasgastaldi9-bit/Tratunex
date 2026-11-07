import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "54321" || !serviceKey) {
  throw new Error("E2E requiere exclusivamente Supabase local en 127.0.0.1:54321 y su clave local.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const companyA = randomUUID();
const companyB = randomUUID();
const password = `Test-${randomUUID()}!`;
const emailA = `${randomUUID()}@example.test`;
const emailB = `${randomUUID()}@example.test`;
const userIds: string[] = [];

function sql(statement: string) {
  execFileSync("docker", ["exec", "supabase_db_TRATO", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "pipe" });
}

test.beforeAll(async () => {
  const a = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  if (a.error || !a.data.user) throw a.error ?? new Error("No se pudo crear usuario A local");
  userIds.push(a.data.user.id);
  const b = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  if (b.error || !b.data.user) throw b.error ?? new Error("No se pudo crear usuario B local");
  userIds.push(b.data.user.id);
  sql(`insert into public.companies(id,name) values ('${companyA}','Empresa E2E A'), ('${companyB}','Empresa E2E B');
       insert into public.company_members(company_id,user_id,role) values ('${companyA}','${userIds[0]}','admin'), ('${companyB}','${userIds[1]}','vendedor');`);
});

test.afterAll(async () => {
  sql(`delete from public.contacts where company_id in ('${companyA}','${companyB}');
       delete from app_private.action_receipts where company_id in ('${companyA}','${companyB}');
       delete from app_private.prospect_attempts where company_id in ('${companyA}','${companyB}');
       delete from public.companies where id in ('${companyA}','${companyB}');`);
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id)));
});

test("sesión, selección de empresa y rechazo de ID de otra empresa", async ({ page }) => {
  await page.goto("/login/companies");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Correo").fill(emailA);
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos iniciar sesión" })).toBeVisible();
  await page.getByLabel("Correo").fill(emailA);
  await page.getByLabel("Contraseña").fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/login"),
    page.getByRole("button", { name: "Ingresar" }).click(),
  ]);
  expect(loginResponse.headers()["cache-control"]).toMatch(/no-store|private/);
  await expect(page).toHaveURL(/\/login\/companies/);
  await expect(page.getByRole("button", { name: "Empresa E2E A" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Empresa E2E B" })).toHaveCount(0);
  await page.locator('input[name="company_id"]').evaluate((element, value) => { (element as HTMLInputElement).value = value; }, companyB);
  await page.getByRole("button", { name: "Empresa E2E A" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No tenés acceso" })).toBeVisible();
  await page.getByRole("button", { name: "Empresa E2E A" }).click();
  await expect(page.getByRole("button", { name: "Empresa E2E A (seleccionada)" })).toBeVisible();
  await page.getByRole("link", { name: "Ir a prospección" }).click();
  await page.getByLabel("Rubro").fill("panaderías");
  await page.getByLabel("Zona").fill("Córdoba");
  await page.getByRole("button", { name: "Buscar prospectos" }).click();
  await expect(page.getByText("Datos de ejemplo (mock)")).toBeVisible();
  await expect(page.getByText("Sin teléfono disponible")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver fuente" })).toHaveAttribute("href", "https://example.com/");
  await page.getByLabel("Archivo CSV").setInputFiles({ name: "demo.csv", mimeType: "text/csv", buffer: Buffer.from("nombre,telefono,web\nDemo,+12025550123,https://demo.example\nSin código,0351 123 4567,") });
  await expect(page.getByText(/2 filas/)).toBeVisible();
  await expect(page.getByText("Indicá el teléfono con código de país, por ejemplo +54.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar contactos" })).toHaveCount(0);
  const csv = { name: "demo.csv", mimeType: "text/csv", buffer: Buffer.from("nombre,telefono,web\nDemo,+12025550123,https://demo.example") };
  await page.getByLabel("Archivo CSV").setInputFiles(csv);
  await page.getByRole("button", { name: "Importar contactos" }).click();
  await expect(page.getByText("1 nuevos · 0 existentes · 0 con error.")).toBeVisible();
  await page.getByLabel("Archivo CSV").setInputFiles(csv);
  await page.getByRole("button", { name: "Importar contactos" }).click();
  await expect(page.getByText("0 nuevos · 1 existentes · 0 con error.")).toBeVisible();
  const { data: contacts, error: contactError } = await admin.from("contacts").select("id,company_id,phone_e164").eq("company_id", companyA);
  expect(contactError).toBeNull();
  expect(contacts).toHaveLength(1);
  expect(contacts?.[0].phone_e164).toBe("+12025550123");
  await page.goto("/login/companies");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Correo").fill(emailB);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("button", { name: "Empresa E2E B" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Empresa E2E A" })).toHaveCount(0);
});
