# ORD-04 · Verificación de menú y preparación

El 2026-11-07 `verify-ord04-app.mjs` terminó con **exit 0 y 24 comprobaciones
aprobadas** contra Next de producción, PostgreSQL 17.11 aislado y Auth/PostgREST
sustituidos por HTTP local. No prueba Supabase alojado, llamada real ni pago.

Se creó una compra mediante el formulario real BUY-01, se navegó a Proveedores,
se eligió una compra guardada desde Cotizaciones sin copiar IDs, se abrió la
página de solicitud/importación de Bauti con la compra de 500 vasos y se volvió
al comparador. Finalmente se abrió Pagos sin inventar órdenes o transferencias.

El menú mostró exactamente cuatro pasos y un solo activo, incluidos los alias
y el caso Cotizaciones dentro de `/orders`. El selector mostró la compra recién
creada. La preparación Sur Insumos tenía dos ofertas de ejemplo y un proveedor
pendiente ficticio con DNC; no se fabricó una tercera oferta. Entre 320 y 1440 px
el contenido y las cuatro etiquetas permanecieron completos, sin desbordamiento.

No hubo errores JavaScript, llamadas, pagos ni solicitudes externas del
navegador. El preload de verificación impidió también fetches externos del
servidor (incluida la consulta de precio de Belo), conservando explícito su
estado no disponible. Las claves de integraciones están vacías solo en el
proceso hijo de prueba; no se cambia configuración del despliegue.

El primer intento ajustó selectores para el asterisco de campos obligatorios.
La ejecución completa posterior terminó sin fallos del producto.

Capturas revisadas: [escritorio](ord04-previews/demo-desktop.png) y
[móvil](ord04-previews/demo-mobile.png).

## Reproducción

Preparar las dependencias locales de CRM y abrir el fixture HTTP en `55440`,
con una empresa A sintética vacía; ejecutar:

```powershell
node src/features/crm/verification/seed-sur-insumos-app.mjs
npm run build
node src/features/crm/verification/start-contacts-test-app.mjs
# En otra terminal:
node src/features/crm/verification/verify-ord04-app.mjs
```

El seed y sus 19 comprobaciones SQL están documentados en
[`../demo/README.md`](../demo/README.md). Conservar el manifest para reintentos;
detener el fixture y neutralizar su configuración temporal al terminar.
