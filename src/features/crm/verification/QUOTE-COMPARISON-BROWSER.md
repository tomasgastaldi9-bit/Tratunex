# ORD-02 · Verificación del comparador

El 2026-11-07, `verify-quote-comparison-app.mjs` terminó con **exit 0 y 38
comprobaciones aprobadas**, sin errores JavaScript ni solicitudes externas del
navegador. Se usaron PostgreSQL 17.11 real y Auth/PostgREST HTTP sustituidos,
con los módulos públicos reales de Compras, Voz, CRM y ranking de Vale.

Todos los proveedores y ofertas son ficticios y se rotulan en el escenario.
Son tres cotizaciones: web ficticia ARS 12,50, ejemplo ARS 15 y ejemplo USD sin
precio/stock/plazo confirmados; cantidad cuatro. La explicación se generó por
las reglas reales de BUY-03, con la clave del modelo vacía en el proceso hijo.
No acredita una llamada real, consulta web ni ejecución de un modelo externo.

Se verificaron las tres filas y la recomendación única con explicación visible,
columnas de precio, stock, plazo, ARGt y origen, procedencia “Reglas”, ejemplos
rotulados y valores desconocidos conservados como pendientes. La vista conserva
la política de aprobación humana sin ejecutar pagos ni mutaciones al cargar.

La lista de otra empresa no filtra información. Una compra ajena y un UUID
inválido presentan errores explícitos. El ejemplo separado permanece de solo
lectura. La tabla y las tarjetas no desbordan entre 320 y 1440 px.

Al elegir la oferta web, el widget envió solo `supplier_quote_id` y `action_id`,
creó la orden persistida de esa cotización y abrió su ficha. El servidor derivó
ARS 50 y ARGt 50 nominales exactos. La orden quedó pendiente y el botón pagar
deshabilitado. No hubo llamadas, firmas ni transferencias.

Capturas revisadas visualmente:
[escritorio](quote-previews/quotes-desktop.png) y
[móvil](quote-previews/quotes-mobile.png). Se conserva el kit de Vale.

Dos intentos iniciales del script corrigieron selectores de verificación: el
título de EmptyState es un párrafo y la etiqueta de ejemplo puede aparecer en
badge y texto. La ejecución final de 38 comprobaciones terminó completa; no
se modificó el producto para adaptar esas aserciones.

## Reproducción

Preparar la base aislada según las instrucciones de CRM y Órdenes. Iniciar
`contacts-local-api-fixture.mjs` en loopback `55440`; luego, una vez por escenario:

```powershell
node src/features/crm/verification/seed-quote-comparison-app.mjs
npm run build
node src/features/crm/verification/start-contacts-test-app.mjs
# En otra terminal:
node src/features/crm/verification/verify-quote-comparison-app.mjs
```

El seed valida la base, URL local, empresas y marcador de tablas auxiliares.
Solo amplía su propio fixture local cuando falta `source_url`; crea una tabla
auxiliar de lectura de llamadas únicamente si no existe. No altera una tabla
ajena ni instala migraciones compartidas de otros dominios. Si `config.ord02`
ya existe, se reutiliza el escenario. La configuración temporal tiene datos de
Auth sintéticos y se neutraliza al detener el servidor.

El worktree local comparte `node_modules` mediante un junction. Turbopack
rechazó esa ruta por estar fuera de su raíz; el mismo código construyó con
`npm run build -- --webpack`, sin cambios en configuración ni dependencias.
CI realiza su propia instalación sin ese junction y valida el build habitual.
