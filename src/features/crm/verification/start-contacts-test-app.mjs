// Starts Next against the synthetic local API; no values are printed or persisted.
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const config = JSON.parse(await readFile(path.join(tmpdir(), "tratunex-contacts-local-api.json"), "utf8"));
if (config.apiUrl !== "http://127.0.0.1:55440") throw new Error("This launcher accepts only the local verification fixture");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3101"], {
  stdio: "inherit", windowsHide: true, env: { ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.anonKey,
    SUPABASE_SECRET_KEY: config.serviceKey,
    NEXT_PUBLIC_APP_URL: "http://localhost:3101",
  },
});
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
