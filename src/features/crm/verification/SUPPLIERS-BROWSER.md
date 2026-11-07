# ORD-01 · Verificación de proveedores y billetera declarada

El 2026-11-07, `verify-suppliers-app.mjs` terminó con **exit 0, 65 comprobaciones
aprobadas y cero errores JavaScript** contra el build de producción de Next.

La base fue PostgreSQL 17.11 real, aislada como `tratunex_contacts_verify`, en
loopback 55439. Auth/PostgREST fueron sustitutos HTTP locales. Empresas, usuarios,
fuentes y direcciones de cobro fueron ficticios. **No se usó Supabase alojado,
ARGt real, RPC onchain, claves privadas ni funciones de pago.** Las direcciones
registradas en este recorrido son metadatos de prueba, sin afirmar checksum,
propiedad, saldo o capacidad de cobro.

## Recorrido comprobado

- Login y selección de empresa mediante las pantallas de Plataforma.
- Alta por formulario: guarda contacto y rol proveedor, redirige a la ficha y
  muestra billetera pendiente. El formulario de contacto no incluye billetera.
- La red requiere selección explícita. Se probó Arbitrum como red principal y
  Base como alternativa de metadatos; no hubo interacción con ninguna cadena.
- Una dirección de ceros se rechaza en el formulario antes de enviar una mutación.
- Dos envíos simultáneos generan una sola petición de billetera. Tras un commit
  real local se simuló una respuesta HTTP 503: la UI bloqueó campos y conservó
  intención y datos. El botón humano de confirmación repitió exactamente el
  envelope anterior y recuperó la versión 1 cacheada, sin duplicar la escritura.
- Recargar conserva dirección y red tanto en la ficha como en la lista.
- Editar nombre, teléfono, fuente y DNC conserva ID, billetera y versión.
  Reimportar con otra acción deduplica y también preserva la billetera y el DNC.
- Una dirección equivalente con otro casing es no-op: conserva casing, versión y
  timestamp anteriores.
- Una edición con versión antigua devuelve 409 sin cambiar dirección, red o
  versión. Actualizar la ficha permite revisar la billetera vigente.
- Quitar la billetera es una acción humana explícita, incrementa su versión y deja
  un estado pendiente que persiste al recargar. Configurar nuevamente vuelve a
  requerir red explícita.
- Se rechazan billetera inyectada en el alta de contacto, empresa/actor inyectados
  y CSRF. Los actores `voice` y `system` no cambian billeteras aun usando el rol SQL
  de servicio dentro de la base local.
- Se prepararon 55 proveedores: página inicial de 50, resto sin IDs repetidos y
  búsqueda de un registro fuera de la primera página. Filtros por fuente, DNC y
  billetera pendiente/configurada se aplican antes de paginar; la UI combina los
  cuatro filtros con la búsqueda.
- Otra empresa obtiene 404 en API, ficha y cambio de billetera, sin datos ajenos.
- Lista, ficha y ambos formularios caben en 1440, 768, 390 y 320 px, con nombres
  extensos y dirección completa. Cero errores JavaScript, escrituras de pagos,
  órdenes o Voz y solicitudes externas del navegador.

Capturas revisadas visualmente:
[`supplier-previews/suppliers-desktop.png`](supplier-previews/suppliers-desktop.png)
y [`supplier-previews/supplier-mobile.png`](supplier-previews/supplier-mobile.png).
La navegación del kit compartido queda para ORD-04; ORD-01 no la modifica.

## Reproducción

Prepará PostgreSQL y la base aislada con
[`../database/README.md`](../database/README.md). Aplicá en esa base local la
propuesta `../database/suppliers.sql` como indica
[`../database/SUPPLIERS.md`](../database/SUPPLIERS.md). La migración compartida la
coordina Tomás; estos comandos no apuntan al Supabase del equipo.

En una terminal, mantené activo el fixture:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/contacts-local-api-fixture.mjs
```

Solo escucha en `127.0.0.1:55440`. La lista permitida incluye empresas,
membresías, contactos y `supplier_profiles`, con las RPC exactas
`contacts_execute` y `suppliers_execute`. No publica la RPC de pipeline ni
endpoints de pago. SQL usa roles/claims de cada usuario y RLS reales de la base
aislada. La configuración HMAC efímera queda en el JSON local
`%TEMP%/tratunex-contacts-local-api.json`; las claves no se imprimen ni se guardan
en Git.

En otra terminal, compilá e iniciá Next contra ese fixture:

```powershell
npm run build
node src/features/crm/verification/start-contacts-test-app.mjs
```

El launcher solo acepta la URL exacta del fixture y fija Next a
`127.0.0.1:3101`. En una tercera terminal:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/verify-suppliers-app.mjs
```

Playwright usa Chrome local. El script crea proveedores ficticios en la empresa
del fixture y completa al menos 55 para paginar. Usa únicamente teléfonos del
rango reservado `+1 202 555 0100–0199`, dominios `.example` y direcciones sintéticas
de formato hexadecimal. Las reejecuciones contemplan registros anteriores; al
agotarse ese rango, reiniciá el fixture para obtener otra empresa aislada sin
borrar la evidencia anterior.

Las capturas se guardan en `supplier-previews/`. Al terminar, detené Next y el
fixture con Ctrl+C y eliminá o neutralizá únicamente su JSON efímero. Podés
conservar PostgreSQL local como evidencia durable.

## Límites

El sustituto HTTP no es GoTrue ni PostgREST. Este recorrido prueba la aplicación
y sus transacciones sobre PostgreSQL real, pero no el despliegue, permisos del
Data API o sesiones/JWT del Supabase alojado. Tampoco valida una dirección para
un pago, verifica su propietario o demuestra una transacción ARGt; esos pasos
pertenecen al módulo de pagos de Tomás.
