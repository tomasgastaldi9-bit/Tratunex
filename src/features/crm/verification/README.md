# Verificación del CRM en Next.js

Este recorrido comprueba la aplicación ejecutada por Next.js en **modo mock**.
Usa los contactos y oportunidades ficticios de `../mocks/fixtures.json`.
La elección `demo=prisma|orbita` permite revisar las dos demostraciones; no
representa una sesión autenticada ni demuestra RLS de Supabase.

Primero iniciar la aplicación en otra terminal:

```powershell
npm run dev -- --port 3100
```

Con las dependencias de Plataforma instaladas mediante `npm ci`, ejecutar con
el `@playwright/test` local y Google Chrome:

```powershell
$env:CRM_BASE_URL = 'http://localhost:3100'
node src/features/crm/verification/verify-app.mjs
```

Después de completar el recorrido, las capturas pueden renovarse contra una
compilación de producción para excluir la interfaz de desarrollo de Next.js:

```powershell
npm run build
npm run start -- --port 3100
# En otra terminal, conservando CRM_BASE_URL:
$env:CRM_CAPTURE_ONLY = '1'
node src/features/crm/verification/verify-app.mjs
Remove-Item Env:CRM_CAPTURE_ONLY
```

Ese modo verifica las cuatro rutas principales, los dos 404 y el regreso al
pipeline conservando la demo seleccionada. Actualiza las cinco capturas y
comprueba errores de navegador. No repite el recorrido completo.

`PLAYWRIGHT_MODULE_PATH` es opcional y permite usar otra instalación existente
en lugar de la dependencia local. Por ejemplo:

```powershell
$env:PLAYWRIGHT_MODULE_PATH = Join-Path $env:TEMP 'tratunex-crm-preparacion-tra53/node_modules/playwright'
```

`CRM_BROWSER_CHANNEL` permite seleccionar otro canal ya instalado, por ejemplo
`msedge`.

El script falla si no se cumplen las comprobaciones del recorrido. Revisa el
pipeline, búsqueda, vista de lista, filtro por etapa, detalle del contacto,
pedido de no contactar, resultado técnico desconocido, tareas y cambio de demo.
Comprueba las respuestas 404 para contactos ajenos o inválidos, que `company_id`
en la query no redefine el contexto y que el HTML no contenga contactos de la
otra demo. Revisa desbordamiento de página en 320, 390, 768 y 1440 px.

Al finalizar guarda capturas actuales en `previews/` y muestra el número de
comprobaciones aprobadas y los errores de JavaScript observados. Estas pruebas
no validan persistencia, llamadas reales, autenticación ni transacciones de base
de datos. Las reglas del servicio mock tienen sus propias pruebas con Vitest.

## Evidencia del 7 de noviembre de 2026

La versión verificada adopta `docs/DESIGN.md` y la base visual de Vale
(`origin/feat/TRA-53-ui-base`): Kantumruy Pro, menú negro de cinco secciones y
barra fija inferior en celular. El recorrido también comprueba que el menú
compartido conserve el escenario de demostración al navegar entre módulos.

Con Next.js en desarrollo en `http://localhost:3100`, el comando siguiente terminó
con exit 0: **81 comprobaciones aprobadas**, `runtimeErrors: []`. Se utilizó
`@playwright/test` local, sin definir `PLAYWRIGHT_MODULE_PATH`.

```powershell
node src/features/crm/verification/verify-app.mjs
```

Después del build, con `next start` en el mismo puerto, el comando siguiente
terminó con exit 0: **8 comprobaciones aprobadas**, `runtimeErrors: []`. Las
cuatro rutas principales respondieron 200, los contactos inválidos o ajenos
respondieron 404 y volver desde el 404 conservó la demo Órbita.

```powershell
$env:CRM_CAPTURE_ONLY = '1'
node src/features/crm/verification/verify-app.mjs
```

Las cinco capturas entregadas en `previews/` corresponden a esta ejecución
de producción del diseño de Vale, sin la interfaz de desarrollo de Next.js.

`node --check src/features/crm/verification/verify-app.mjs` y
`npx eslint src/features/crm/verification/verify-app.mjs` también terminaron
con exit 0.
