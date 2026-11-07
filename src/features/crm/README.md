# CRM-02 · Contratos e integración mock

Los DTOs, inputs y schemas Zod están en `src/contracts/crm.ts`. Los consumidores
de servidor importan las operaciones desde `src/features/crm/server/public.ts`,
marcado `server-only`. No hace falta una base ni credenciales para esta entrega.

```ts
import type { ActionCtx, Ctx } from "@/contracts/common";
import type { CallResultV1, UpsertContactInput } from "@/contracts/crm";
import {
  crmIntegration, upsertContact, getContact, recordCallResult,
  scheduleFollowup, claimDueFollowups, completeFollowup, failFollowup,
} from "@/features/crm/server/public";
```

Tomás consume `upsertContact(actionCtx, input)` y Bautista consume `getContact`,
`recordCallResult`, `scheduleFollowup`, `claimDueFollowups`, `completeFollowup` y
`failFollowup`. Las siete funciones devuelven `Promise<Result<T>>`; `Ctx`,
`ActionCtx` y `Result` pertenecen al contrato común de Plataforma.

`crmIntegration` indica `mode: "mock"` y `persistence: "process"`. El simulador
usa exclusivamente las dos empresas ficticias de `mocks/fixtures.json`; para
probar, tomá de ese archivo `company_id`, contactos, deals y tareas. Las
mutaciones requieren un `action_id` estable: repetirlo con los mismos datos
reproduce el resultado; reutilizarlo con otros datos devuelve `CONFLICT`.

El estado se guarda en memoria y se pierde al reiniciar el proceso. La validación
de contexto del simulador no autentica usuarios ni comprueba membresías reales.
Los fixtures no prueban persistencia, atomicidad de Postgres, telefonía ni
integraciones externas. Los resultados del simulador deben mostrarse como mock.

La persistencia de contactos corresponde a CRM-03; el procesamiento real de
resultados y los seguimientos con lease se entregan en sus tickets posteriores,
conservando las firmas públicas.

Verificación de la entrada pública sin base ni credenciales:

```powershell
npm test -- src/features/crm/server/public.test.ts
```

La prueba importa las siete operaciones, verifica sus firmas y lee un contacto
ficticio. `npm run typecheck` comprueba las aserciones de tipos.
