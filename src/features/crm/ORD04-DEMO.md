# ORD-04 · Menú de compras y preparación de demo

El menú conserva el kit de Vale y sigue cuatro pasos:

| Paso | Ruta |
|---|---|
| Nueva compra | `/purchases/new` |
| Proveedores | `/suppliers` |
| Cotizaciones | `/orders/quotes` |
| Pagos | `/orders` (órdenes, aprobación y consulta del pago) |

Pipeline, tareas, conocimiento y prospección de clientes no aparecen en el menú.
Las páginas existentes se conservan. Una sola sección queda activa: el prefijo
más específico gana. Solicitar/importar cotizaciones pertenece a Cotizaciones;
las reglas de pago pertenecen al paso Nueva compra.

## Continuar sin copiar UUID

La entrada Cotizaciones muestra compras guardadas de la empresa seleccionada.
Permite solicitar cotizaciones con la compra elegida o abrir el comparador.
Proveedores también enlaza a ese selector. La lectura usa cliente de usuario,
autorización, filtro de empresa y RLS; proyecta únicamente ID, empresa, producto,
cantidad, unidad y fecha del schema publicado de BUY-01. No lee presupuesto ni
duplica reglas o escrituras de Agente. Después de elegir, la compra completa
se resuelve por `getPurchaseRequest` público.

Se muestran 20 compras por página, ordenadas por fecha e ID descendentes; la
fila extra detecta la siguiente página. El tope de 1000 páginas se representa
explícitamente y no genera un enlace inválido. Fallos y datos incompatibles no
se sustituyen por una lista vacía ni por fixtures.

## Escenario Sur Insumos

La preparación reproducible está en [demo/README.md](demo/README.md): compra de
500 vasos, dos ofertas ficticias rotuladas y el lugar del proveedor real. El
SQL se entrega para revisión/ejecución coordinada por Tomás, con destino e IDs
explícitos, permiso admin, política manual e idempotencia transaccional.
El proveedor real y su billetera se registran por una persona; el seed no los
modifica ni inventa su cotización. El placeholder con DNC solo existe en el
ensayo aislado local y permanece marcado como pendiente.

La entrada del ensayo es `/purchases/new` con Sur Insumos ya seleccionada.
El enlace de continuación de `/login/companies` sigue en el dominio de Tomás
y todavía apunta a `/prospects`; se deja identificado para su integración,
sin editar su flujo de autenticación. El recorrido de producto verificado
continúa exclusivamente por los pasos de compras.

## Límites de la entrega

Esta entrega integra menú, selección de compras y preparación de datos. La
tercera cotización exige la llamada real de Bauti; el pago confirmado exige
PAY-02 operativo y su hash/recibo. No se ejecutaron esas acciones ni se aplicó
SQL en la base compartida. Hasta verificar ese recorrido completo, TRA-77
permanece abierto aunque la preparación de código esté integrada.
