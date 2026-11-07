# Preparación del CRM · TRA-53

Primer entregable de Nano, iniciado antes del bootstrap de Next.js. Sigue el brief v2,
secciones 5, 8, 9 y 10. Rama: `feat/TRA-53-crm-preparacion`.

## Qué se puede revisar ahora

- `src/contracts/crm.ts`: DTOs, validaciones Zod y payloads de las siete
  operaciones del CRM. No implementa las operaciones.
- `../mocks/fixtures.json`: fuente única de ejemplos ficticios de dos empresas.
- `../mocks/fixtures.js`: copia generada para abrir el boceto por `file://`.
- `../prototype/index.html`: boceto navegable de pipeline, contacto y tareas.
  Se abre directamente en un navegador. No necesita servidor, cuenta ni claves.

El boceto filtra todos los ejemplos por empresa, tiene estados de carga, vacío
y error, y muestra siempre su condición de mock. Esto sirve para revisar el
recorrido visual; no demuestra RLS, autenticación, idempotencia ni telefonía.
El reloj de referencia es `2026-11-07T15:00:00Z`; los horarios visibles usan
`America/Argentina/Buenos_Aires`, sin depender de la fecha del equipo.

Los teléfonos pertenecen al rango ficticio `202-555-0100` a `202-555-0199`
[reservado por NANPA](https://www.nanpa.com/numbering/555-line-numbers).
Los dominios usan `.example`; no son prospectos ni resultados de búsquedas reales.

## Contratos y consumidores

| Operación | Contexto separado del payload | Consumidor |
|---|---|---|
| `upsertContact` | `ActionCtx` | Prospección de Tomás y CRM |
| `getContact` | `Ctx` | Voz de Bautista y CRM |
| `recordCallResult` | `ActionCtx` | Voz de Bautista |
| `scheduleFollowup` | `ActionCtx` | Voz y CRM |
| `claimDueFollowups` | `ActionCtx` | Despacho de seguimientos de Voz |
| `completeFollowup` | `ActionCtx` | Despacho de seguimientos de Voz |
| `failFollowup` | `ActionCtx` | Despacho de seguimientos de Voz |

Se mantienen los nombres, argumentos y formas de `data` del brief.
`crmOperationSchemas` es un catálogo de schemas, no un cliente ni un servidor.
La respuesta de cada función será `Result<data>` de Plataforma. No se crea
un `Ctx`, `ActionCtx`, `Result<T>` ni `ErrorCode` alternativo.

Campos propuestos que el brief no enumera completamente: `name`,
`organization`, `phone_e164`, `website` y `source` de contacto; `title` de
oportunidad; metadatos de tarea y su `error_code`. Tomás y Bautista deben
revisarlos como consumidores antes de congelarlos. Un contacto admite varias
oportunidades. Los DTOs aceptan campos adicionales para facilitar ampliaciones;
los inputs de mutaciones rechazan campos no declarados.

`CallResultV1` conserva los campos del brief. Su `company_id` viene del
contexto de llamada confiable; el servidor verificará la coincidencia con `Ctx`,
contacto, llamada y oportunidad. El schema solo valida estructura, no autoridad.
Un ID externo de evento es string, no UUID. Los IDs internos son UUID y las
fechas de intercambio son UTC con `Z`. Un resultado técnico `unknown` no se
inventa como resultado final: solo se incluye como preview ficticio pendiente.

## Reglas que debe implementar el backend posterior

- `upsertContact`: deduplicar por teléfono normalizado y dominio dentro de la
  empresa; una reimportación nunca revierte `do_not_contact`.
- `recordCallResult`: aplicar la primera regla coincidente del brief; preservar
  etapas terminales y registrar igualmente el pedido de no contactar.
- Mutaciones: `action_id` estable, mismo resultado al reintentar y `CONFLICT`
  si cambia el payload, todo en la misma transacción.
- Seguimientos: lote 5 y lease 90 s; rechazar lease viejo. Completar significa
  llamada aceptada por Vapi, no venta concretada.
- Callback con fecha UTC; revisión humana puede carecer de fecha. No inferir
  una fecha para un "jueves" ambiguo. Dos intentos es un límite por contacto,
  no un máximo artificial del contador de cada tarea.

Este cambio no implementa estas reglas ni aplica migraciones.

## Pendientes de coordinación

1. El bootstrap de TRA-24 ya está integrado desde `origin/main`, con Zod 4.6.7.
   Tomás continúa con los contratos comunes de Plataforma.
2. Nano: conectar estos schemas a
   `src/features/crm/server/public.ts` con `server-only` y respuestas `Result<T>`.
   No hay un endpoint mock que simule éxito de escrituras sin persistir.
3. Consumidores: acordar selección de oportunidad cuando falta `deal_id` y hay
   varias; resolución de coincidencias distintas por teléfono/dominio; cierre
   manual de una tarea `human_review`; catálogo de errores de tarea.
4. Confirmar en Linear el alcance detallado de TRA-53 y su separación de los
   siguientes tickets. El ID existe en el brief; su estado y descripción no
   fueron consultados en esta sesión.
5. Revisión de Vale y de Tomás/Bautista para los contratos consumidos.

## Verificación reproducible

Con Node 24 y Zod disponible, la comprobación autónoma de esta preparación es:

```powershell
node src/features/crm/preparation/verify.mjs
```

Comprueba schemas, relaciones, separación de empresas en los datos, cobertura
de escenarios, números ficticios, fechas, inputs sin identidad inyectada y que
el bridge JS coincida con el JSON. No sustituye las pruebas de reglas con
Vitest, el recorrido de Next.js con Playwright ni las pruebas reales de base.

Antes del bootstrap puede copiarse `src/` a una carpeta temporal externa con
Zod instalado únicamente allí y ejecutar el mismo archivo. No agregar
dependencias al repo ni instalar paquetes globales para esta preparación.

Comprobación efectuada el 2026-11-07 con Node 24.22.2, Zod 4.6.7 temporal y
TypeScript 7.0.2 disponible en el equipo. La versión usada para verificar no
fija las versiones del proyecto, que sigue a cargo de Tomás. Comandos:

```powershell
$crmValidationRoot = Join-Path $env:TEMP 'tratunex-crm-preparacion-tra53'
New-Item -ItemType Directory -Path $crmValidationRoot -Force | Out-Null
npm install --prefix $crmValidationRoot --no-package-lock --no-audit --no-fund --ignore-scripts zod@4.6.7
Copy-Item -LiteralPath src -Destination $crmValidationRoot -Recurse -Force
node (Join-Path $crmValidationRoot 'src/features/crm/preparation/verify.mjs')
tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck (Join-Path $crmValidationRoot 'src/contracts/crm.ts')
node --check src/features/crm/prototype/prototype.js
git diff --check
```

Resultado: 11 comprobaciones aprobadas; typecheck y comprobación de JavaScript
sin errores. No se ejecutaron build de Next.js, Vitest, base de datos ni
integraciones live: todavía no existe el scaffold.
La versión visual 1 pasó 67 comprobaciones de navegador headless, incluyendo
Tablero y Lista, navegación a la galería y cinco anchos entre 320 y 1440 px.
El comando reproducible y las capturas están en `../prototype/README.md`.
Los estilos compartidos y la guía de adopción se encuentran en
`src/components/ui/README.md`.

Para regenerar el bridge después de cambiar fixtures:

```powershell
$fixtureJson = Get-Content -LiteralPath src/features/crm/mocks/fixtures.json -Raw -Encoding utf8
$bridgeSource = "// Generado desde fixtures.json. No editar a mano.`n" + "globalThis.CRM_MOCK_FIXTURES = " + $fixtureJson.Trim() + ";`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src/features/crm/mocks/fixtures.js'), $bridgeSource, [System.Text.UTF8Encoding]::new($false))
```
