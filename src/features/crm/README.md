# CRM: recorrido Next.js e integración mock

Este bloque continúa la base de Nano (TRA-53) sobre el bootstrap, contratos
comunes y autenticación PLAT-03 de Plataforma. El alcance se basa en `docs/BRIEF.md`; la descripción y el
estado individuales de los issues de Linear no se pudieron consultar.

## Ejecutar la app

```powershell
npm run dev -- --port 3100
```

Abrir `http://localhost:3100/pipeline`. También están disponibles `/contacts`,
`/contacts/[id]` y `/tasks`. El inicio redirige al pipeline.

- Tablero de siete etapas y lista, búsqueda y filtro de etapa.
- Detalle con oportunidades, último resultado, historial, pedido de no contactar
  y advertencia cuando el último intento tiene estado desconocido.
- Tareas con filtros por estado/tipo y fechas en Argentina; una revisión humana
  sin fecha se presenta como pendiente de definir.
- Dos escenarios ficticios: `?demo=prisma` y `?demo=orbita`. El servidor selecciona
  solamente estas empresas conocidas y filtra los datos antes de enviarlos al
  navegador. Un contacto fuera del escenario seleccionado devuelve 404.

El selector es exclusivo de la demostración. No representa una sesión, permisos
ni aislamiento RLS. Estas pantallas aún no consumen la empresa activa del login;
la integración persistente usará el contexto verificado de Plataforma.
Las pantallas son de consulta; el botón de llamar permanece deshabilitado hasta
integrar la ruta de Voz. No se publican endpoints de escritura sin auth.

## Superficie pública para consumidores de servidor

Importar desde `src/features/crm/server/public.ts` (protegido con `server-only`).
Las siete funciones conservan las firmas del brief y devuelven `Result<T>` de
`src/contracts/common.ts`. `crmIntegration` declara explícitamente
`mode: "mock"`, `persistence: "process"` y el reloj fijo del fixture.

```typescript
import { crmIntegration, upsertContact } from "@/features/crm/server/public";

// ctx debe provenir del servidor del consumidor. Mantener action_id al reintentar.
// El consumidor debe rotular el resultado con crmIntegration.mode.
const result = await upsertContact(ctx, input);
```

Las escrituras se conservan solo en una instancia de memoria. Cada proceso o
reinicio puede tener un estado diferente. El modelo de lectura de las páginas
usa la misma instancia dentro de su proceso. No usar este adapter para telefonía
real ni presentarlo como persistencia o atomicidad de Postgres.

El simulador cubre deduplicación por teléfono/dominio, `do_not_contact` persistente
en reimportaciones, recibos por acción, reglas ordenadas del pipeline, eventos
repetidos/anteriores, callback sin fecha clara, tareas con lease y rechazo de
workers con lease anterior. Los callbacks se reclaman en lotes de hasta cinco,
con lease de 90 segundos. Las revisiones humanas no disparan llamadas.

Casos ambiguos responden `CONFLICT`: teléfono y dominio apuntan a contactos
distintos; resultado sin `deal_id` cuando el contacto tiene varias oportunidades;
reutilización de `action_id` o `event_id` con otros datos. El mock solo admite las
dos empresas de los fixtures y no verifica la existencia de una llamada en Voz.
El consumidor sigue siendo responsable de proporcionar el contexto confiable y
la llamada correspondiente. El reloj fijo permite reproducir vencimientos;
las pruebas inyectan un reloj para simular el transcurso del tiempo.

## Revisión e integración posterior

Vale revisa shell y UI. Tomás consume `upsertContact`; Bautista consume
`getContact`, `recordCallResult` y las funciones de seguimiento. Los DTOs propuestos
deben recibir revisión de al menos un consumidor antes de congelarse.

Para completar CRM-03/05/07 reales todavía hacen falta esquema y migraciones
coordinadas con Tomás, RLS por membresía, transacciones Postgres con recibos,
validación contra llamadas de Voz, registro durable de actividad y pruebas de
concurrencia contra la base. Este bloque no aplica migraciones ni activa cron.

## Verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
node src/features/crm/preparation/verify.mjs
```

Las pruebas de reglas están en `server/mock-crm.test.ts`. El recorrido de navegador
y las capturas se mantienen en `verification/`. PLAT-03 incorpora Playwright al
scaffold. Después de `npm ci`, el script lo resuelve localmente y usa Chrome
instalado:

```powershell
$env:CRM_BASE_URL = 'http://localhost:3100'
node src/features/crm/verification/verify-app.mjs
```

Evidencia del 2026-11-07: `npm run lint`, `npm run typecheck` y `npm run build`
terminaron con exit 0; `npm test` aprobó 46 pruebas en cuatro archivos (35 del
simulador CRM). La preparación aprobó sus 11 comprobaciones. El recorrido real
de Next.js con Playwright aprobó 77 comprobaciones en Chrome, incluyendo los
cuatro anchos, navegación, búsquedas, tareas y respuestas 404. El build genera
`/`, `/contacts`, `/contacts/[id]`, `/pipeline` y `/tasks`.
