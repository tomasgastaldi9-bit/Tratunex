# CRM-04 · Verificación del pipeline

El 2026-11-07, `verify-pipeline-app.mjs` terminó con **exit 0, 55 comprobaciones
aprobadas y cero errores de JavaScript**. Se repitió con 59 oportunidades para
comprobar que la paginación contempla registros existentes: 50 + 9, sin duplicados.

Se usó la aplicación compilada de producción con PostgreSQL 17.11 real en
`tratunex_contacts_verify`, puerto loopback 55439. Auth y PostgREST fueron
sustitutos HTTP locales con usuarios, empresas, sesiones y claves HMAC ficticias.
Esto no demuestra un despliegue Supabase remoto ni telefonía.

## Recorrido comprobado

- Login y selección de empresa mediante Plataforma; el inicio lleva a Pipeline.
- Tablero con siete etapas y empresa autenticada, sin datos de otra empresa.
- Creación desde el buscador de contactos en servidor y desde el vínculo de la
  ficha que preselecciona `contact_id`.
- Una acción repetida conserva oportunidad y respuesta; cambiar su payload
  devuelve 409. Dos intenciones diferentes permiten varias oportunidades del
  mismo contacto.
- Cambio manual a Compró con `expected_stage`; recargar conserva la etapa y la
  tarjeta aparece una sola vez en su columna. El movimiento añade una actividad.
- Un editor desactualizado recibe 409 sin cambiar la etapa ni añadir actividad.
  Se rechazan etapa inválida, empresa inyectada y CSRF.
- La actividad identifica el movimiento manual, se ordena por fecha descendente
  y pagina sin repetir IDs.
- Primera página de 50 oportunidades, cursor exclusivo y filtro de etapa aplicado
  a toda la empresa, incluido un registro fuera de la primera página.
- Otra empresa no obtiene oportunidades ni actividad ajenas; crear para un
  contacto ajeno o mover una oportunidad ajena devuelve 404. El GET del contacto
  ajeno también devuelve 404. CRM-04 no publica un GET individual de oportunidad.
- A 1440, 768, 390 y 320 px, el documento no desborda incluso con títulos y nombres
  extensos. El tablero de escritorio tiene desplazamiento propio y foco de teclado;
  en móvil se apilan las columnas. Selector y formulario también caben.
- Cero escrituras a Voz o tareas; ninguna llamada externa o telefónica.

Capturas revisadas visualmente:
[`pipeline-previews/pipeline-desktop.png`](pipeline-previews/pipeline-desktop.png)
y [`pipeline-previews/pipeline-mobile.png`](pipeline-previews/pipeline-mobile.png).
La captura móvil muestra una tarjeta con título extenso y su cambio de etapa.
Todos los nombres son ficticios; se usa un teléfono reservado y una web `.example`.

## Reproducir

Prepará la base aislada con las instrucciones de
[`../database/README.md`](../database/README.md) y aplicá en esa base local la
propuesta `../database/pipeline.sql`, como explica
[`../database/PIPELINE.md`](../database/PIPELINE.md). No apliques estos scripts
directamente a una base compartida; Tomás coordina la migración.

Mantené activo el fixture en una terminal:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/contacts-local-api-fixture.mjs
```

El fixture solo escucha en `127.0.0.1:55440`. Su lista permitida incluye las
tablas de empresas, membresías, contactos, deals y actividad, y únicamente las
RPC `contacts_execute` y `pipeline_execute`. Cada consulta usa PostgreSQL real
bajo el rol y los claims del usuario de prueba. El archivo de configuración
efímero queda en `%TEMP%/tratunex-contacts-local-api.json`, sin imprimir claves.

En otra terminal, iniciá la compilación de producción contra ese fixture:

```powershell
npm run build
node src/features/crm/verification/start-contacts-test-app.mjs
```

El launcher valida la URL exacta del fixture y fija Next a `127.0.0.1:3101`.
No lee credenciales de un Supabase real ni modifica configuración global.

En una tercera terminal:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/verify-pipeline-app.mjs
```

Playwright usa Chrome local. El recorrido crea oportunidades ficticias mediante
las rutas reales y completa al menos 55 mediante la RPC SQL verificada, todas
para el mismo contacto. Las reejecuciones conservan el conteo existente. Las
capturas se escriben en `pipeline-previews/`.

Al terminar, detené Next y el fixture con Ctrl+C. Eliminá o vaciá únicamente el
JSON temporal generado. La base local puede conservarse como evidencia durable.

La autenticación de este fixture no sustituye las comprobaciones contra GoTrue,
el Data API y las sesiones/JWT reales del Supabase compartido.
