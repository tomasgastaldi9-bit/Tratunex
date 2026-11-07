# CRM-03 · Verificación de la aplicación

El 2026-11-07, `verify-contacts-app.mjs` terminó con **exit 0, 51 comprobaciones
aprobadas y cero errores de JavaScript**. Se usó la compilación de producción de
Next, PostgreSQL 17.11 local y sustitutos HTTP de Auth/PostgREST. No se usó el
Supabase compartido, telefonía ni servicios externos.

## Recorrido comprobado

- Login y selección de dos empresas mediante las pantallas reales de Plataforma.
- Alta desde API y formulario; edición de nombre, teléfono y no-contactar.
- Recargar conserva los cambios. Reimportar con otra acción no duplica el contacto;
  otro teléfono del mismo dominio también deduplica. DNC no se revierte.
- Misma acción recupera el mismo resultado; otros datos dan conflicto. Se rechazan
  CSRF, identidad inyectada y claves de idempotencia contradictorias.
- Primera página de 50 contactos, siguiente página sin IDs repetidos y filtros
  aplicados antes de paginar. Una búsqueda encuentra un registro fuera de la
  primera página. La ejecución se repitió con 57 contactos: 50 + 7.
- La empresa ajena recibe HTTP 404 tanto por API como por la ficha y puede crear
  su propio contacto con el mismo teléfono sin acceder al de otra empresa.
- Lista, filtros, ficha y formulario caben en 1440, 768, 390 y 320 px.
- Ninguna escritura a Voz, deals o tareas.

Las capturas se revisaron visualmente: [`contacts-previews/contacts-desktop.png`](contacts-previews/contacts-desktop.png)
y [`contacts-previews/contact-mobile.png`](contacts-previews/contact-mobile.png).
Todos los nombres son ficticios; los teléfonos pertenecen al rango reservado
`+1 202 555 0100–0199` y las webs usan `.example`.

## Reproducción local

Prepará PostgreSQL y la base aislada `tratunex_contacts_verify` siguiendo
[`../database/README.md`](../database/README.md). Los scripts rechazan otra base;
no se aplica ni se resetea ninguna base compartida.

En una terminal, mantené activo el sustituto HTTP:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/contacts-local-api-fixture.mjs
```

Este proceso crea dos empresas y usuarios ficticios, claves HMAC efímeras y un
archivo privado local `%TEMP%/tratunex-contacts-local-api.json`. Solo escucha en
`127.0.0.1:55440`; los valores no se imprimen ni se guardan en Git. La lectura
REST permitida se limita a empresas, membresías y contactos; la RPC usa SQL real
bajo los roles y claims de cada usuario.

En otra terminal, compilá e iniciá la aplicación contra ese fixture:

```powershell
npm run build
node src/features/crm/verification/start-contacts-test-app.mjs
```

El launcher acepta únicamente la URL fija del fixture, pasa sus valores al
proceso hijo sin imprimirlos y fija Next a `127.0.0.1:3101`. No lee credenciales
de un Supabase real ni modifica la configuración global.

En una tercera terminal:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/verify-contacts-app.mjs
```

Se usa Chrome local mediante Playwright. El script genera contactos ficticios
en la empresa aislada del fixture y completa hasta al menos 55 registros para
verificar paginación. Las reejecuciones contemplan los registros ya existentes;
el rango reservado admite hasta 100 por empresa. Para una nueva sesión limpia,
reiniciá el fixture: crea otra pareja de empresas sin borrar la evidencia previa.

Al terminar, detené Next y el fixture con Ctrl+C y eliminá únicamente el JSON
temporal generado. Podés conservar la base local como evidencia durable.

## Límites

Este recorrido valida nuestra aplicación y las consultas/RPC sobre PostgreSQL
real. El servidor HTTP de prueba no es GoTrue ni PostgREST: no demuestra el
despliegue remoto, renovación de sesiones de Supabase, configuración del Data
API ni sus claves/JWT reales. La migración compartida queda a cargo de Tomás.
