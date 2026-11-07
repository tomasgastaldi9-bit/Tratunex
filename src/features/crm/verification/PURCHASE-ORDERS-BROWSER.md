# ORD-03 · Verificación local de órdenes

El 2026-11-07, `verify-purchase-orders-app.mjs` terminó con **exit 0 y 26
comprobaciones aprobadas**, sin errores JavaScript ni solicitudes externas del
navegador. La creación, deduplicación, consulta y actualización usan PostgreSQL
17.11 real y Auth/PostgREST sustituidos por HTTP local. No prueba Supabase
alojado, cotizaciones de proveedores reales ni pagos onchain.

El escenario usa cotizaciones explícitamente ficticias de ARS y USD compatibles
con el modelo actual de QUO-02. ARS 1,25 por 4 unidades produce ARS 5 cotizados
y ARGt 5 nominales, conservando ambos importes y mostrando la equivalencia.
USD permanece pendiente de conversión. La base local contiene una tabla
auxiliar ampliada para las pruebas SQL futuras de ARGt directo; este recorrido
de navegador no usa esa ampliación. No se firmó ni transmitió ninguna transacción;
el puerto de Pagos estaba ausente/deshabilitado.

Se verificó:

- Sesión y empresa antes de leer órdenes; ocultación de una orden de otra empresa.
- Creación solo desde `supplier_quote_id`, rechazo de importes inyectados y CSRF.
- Cálculo nominal ARS→ARGt exacto y aviso visible que no lo atribuye al mercado.
- Repetición del mismo `action_id` y otra acción sobre la misma cotización sin
  generar otra orden.
- Pago deshabilitado: HTTP 503 sin cambiar aprobación ni versión, botón inactivo
  y ningún hash de transacción inventado.
- Actualización humana de snapshots: incrementa versión y conserva aprobación
  pendiente.
- Lista sin desbordamiento a 1440, 768, 390 y 320 px; ficha a 768, 390 y 320 px.

Capturas revisadas visualmente:
[escritorio](order-previews/order-desktop.png) y
[móvil](order-previews/order-mobile.png). Se conserva el kit visual de Vale; la
navegación de compras corresponde a ORD-04.

La primera ejecución del script falló por esperar un texto de confirmación que
no coincidía con el componente. Se corrigió el selector y la ejecución completa
posterior aprobó las comprobaciones. El recorrido final con ARS nominal aprobó
las 26. No fue un fallo de actualización de la
orden.

Para reproducir, preparar la base aislada según
[`../database/PURCHASE-ORDERS.md`](../database/PURCHASE-ORDERS.md), iniciar el
fixture HTTP y construir Next. Con ese fixture activo, crear una vez el escenario
propio (si `config.ord03` ya existe, conservarlo y omitir el seed), luego ejecutar:

```powershell
node src/features/crm/verification/seed-purchase-orders-app.mjs
node src/features/crm/verification/start-contacts-test-app.mjs
# En otra terminal:
node src/features/crm/verification/verify-purchase-orders-app.mjs
```

El script acepta únicamente loopback y la configuración temporal del fixture
propio. La configuración contiene usuarios y claves sintéticos de Auth y debe
neutralizarse al detenerlo. Los helpers no leen ni imprimen claves de billeteras.
