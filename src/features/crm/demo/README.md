# ORD-04 · Preparación de Sur Insumos

Este paquete prepara **500 vasos de papel de 240 cc**, entrega un lunes futuro,
dos proveedores/cotizaciones de ejemplo rotulados y un lugar explícitamente
pendiente para la llamada real. No llama, no importa resultados externos, no
crea órdenes, no aprueba ni paga. Los precios de ejemplo **180 y 200 ARS** son
valores simbólicos: totales 90.000 y 100.000 ARS nominales. No fijan el precio que
debe decir el proveedor real ni representan ofertas obtenidas de terceros.

## Artefacto revisable para Tomás

- `sur-insumos.manifest.example.json`: plantilla de IDs nuevos y parámetros.
- `sur-insumos.sql`: bloque transaccional sin DDL, reservado al operador SQL
  revisado por el equipo; no es una RPC pública ni una migración.
- `seed-sur-insumos-app.mjs` en `../verification/`: reproducción aislada local.

Requiere PLAT-02/03, CRM-03/ORD-01, BUY-01/02 y QUO-02, incluido `source_url`.
Tomás verifica esos prerrequisitos y coordina la ejecución compartida. No se
modifica `supabase/migrations` ni se altera ninguna tabla del equipo.

Antes de ejecutar en compartido:

1. Confirmar el **UUID de la empresa llamada exactamente `Sur Insumos`** y una
   persona admin de esa empresa. Usar IDs nuevos y distintos para compra,
   ejemplos y cotizaciones. Los teléfonos del manifest solo admiten el rango
   reservado de ficción `+12025550100` a `+12025550199`.
2. El dueño configura las reglas por el flujo de BUY-02: máximo de al menos
   100.000 ARGt nominales, `auto_pay_limit_atomic: "0"` y sin allowlist para
   comparar los ejemplos. El seed comprueba estas condiciones; **no cambia una
   política existente**. Cada pago seguiría requiriendo aprobación humana y
   las verificaciones de PAY; este paquete no habilita pagos.
3. Copiar la plantilla a un archivo privado de preparación y completar un lunes
   futuro, `seed_id` estable y los UUID nuevos. Conservar exactamente ese
   manifest para los reintentos. No subir teléfonos, nombres reales, claves ni
   credenciales al repo.
4. Si ya hay un proveedor real, completar solo
   `existing_live_supplier_contact_id`. Debe pertenecer a Sur Insumos, tener
   `do_not_contact: false` y una billetera Arbitrum cargada por una persona en
   Proveedores. Se verifica el recibo humano de `setSupplierWallet` para su
   versión actual; eso prueba la carga por UI, **no** propiedad, checksum, saldo
   o capacidad de cobro. El seed no modifica ese contacto, DNC, billetera ni
   versión. Si falta el ID, el slot queda pendiente y no se inventa un proveedor
   o resultado real. `allow_local_placeholder` debe seguir en `false`.
5. El operador ejecuta en una única transacción y revisa la salida antes del
   commit. Ejemplo de estructura, reemplazando el JSON con el manifest privado:

```sql
begin;
select set_config('tratunex_demo.input', '<JSON DEL MANIFEST>', true);
-- Pegar aquí el bloque completo de sur-insumos.sql.
select current_setting('tratunex_demo.output');
-- Revisar company_id, purchase_request_id y live_slot_status.
commit;
```

Un ID/teléfono ya existente produce conflicto: nunca se usa un upsert para
sobrescribir contactos. El mismo manifest reproduce el recibo estable sin
duplicar filas. Cambiar el proveedor real o cualquier parámetro con el mismo
`seed_id` produce conflicto. Una modificación deliberada requiere preparar un
manifest nuevo y revisar los IDs; no actualiza ejemplos silenciosamente.

## Reproducción local

Con el fixture HTTP de Auth/PostgREST iniciado en `127.0.0.1:55440` y una
empresa A ficticia **vacía** en `tratunex_contacts_verify`:

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
node src/features/crm/verification/seed-sur-insumos-app.mjs
```

El wrapper solo conecta a loopback/base aislada. Renombra únicamente la empresa
A vacía de ese fixture a Sur Insumos y crea sus reglas locales de aprobación
manual. Guarda el manifest y la salida en `config.ord04` del archivo temporal
privado del fixture. Repetir la orden reutiliza ese manifest. No sustituye un
destino por otro: una variación posterior del ID real da conflicto.

Sin proveedor real, la opción exclusivamente local crea un placeholder con
teléfono reservado, `do_not_contact: true` y metadatos de billetera ficticios.
No recibe cotización. Los otros dos contactos de ejemplo también tienen DNC;
sus billeteras son metadatos ficticios y sus cotizaciones usan
`source: example`, `call_id: null`, `source_url: null`. No pueden confundirse con
llamadas telefónicas o resultados de Firecrawl.

Verificación del seed:

```powershell
node src/features/crm/demo/verify-sur-insumos.mjs
```

El 2026-11-07 aprobaron **19 comprobaciones PostgreSQL 17.11**: idempotencia,
recibo/filas atómicos y rollback, empresa/actor/política incorrectos, destino de
otra empresa, red de cobro incorrecta, DNC, preservación exacta de un destino
cargado por persona y ausencia de cotización inventada para ese destino.
Solo se limpian los UUID aleatorios de esa prueba; no se borran datos ajenos.

## Dependencias para completar el recorrido

La compra preparada se abre desde el selector de Cotizaciones de Sur Insumos.
El comparador puede mostrar los dos ejemplos y la recomendación por reglas.
La tercera cotización exige que **Bauti** ejecute/registre una llamada real al
proveedor revisado y entregue su resultado con procedencia correcta. No hay
un botón de este seed que inicie esa llamada ni se afirma que ya ocurrió.

El paso financiero depende de **Tomás/PAY**: fondos, reglas, destino humano,
aprobación, reserva idempotente y hash verificable de una transacción real. Un
recibo de preparación o una orden aprobada no constituye un pago. El estado
pendiente sigue visible hasta que existan esas integraciones y su evidencia.
