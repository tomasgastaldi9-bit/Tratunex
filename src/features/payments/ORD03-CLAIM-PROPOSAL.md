# PAY-02 / ORD-03: propuesta de reserva para revisión

Estado: propuesta, no autorizada ni implementada. El puerto `payInvoice` sigue
deshabilitado. La lectura de `getPurchaseOrder` no es una autorización de pago.

## Contrato propuesto

Agregar una operación de servidor transaccional que reciba únicamente identidad
autenticada, `company_id`, `order_id`, `action_id`, red y datos de la billetera
emisora; nunca aceptar del navegador el importe ni el destino. El resultado debe
ser una reserva durable con ID, versión de orden y billetera, importe exacto,
destino y nonce, o un error explícito. No devolver firmas ni claves al cliente.

En la misma transacción se deben comprobar y bloquear la membresía y rol, orden,
cotización, compra, proveedor y política, en un orden compatible con las demás
operaciones. Revalidar los snapshots contra los valores actuales, aprobación
humana vigente y su versión, máximo y presupuesto, proveedor permitido,
disponibilidad, aceptación ARGt y que el destino y su versión sigan iguales.
La aprobación humana cubre el umbral manual, no los límites ni la allowlist.
Rechazar moneda sin importe listo, datos de ejemplo, dirección cero y red distinta
de Arbitrum. La reserva y todos los datos autorizados deben quedar persistidos
antes de firmar; impedir dos reservas para una misma orden o nonce de la billetera.

Una operación repetida debe devolver la misma reserva sin crear otra; si cambian
sus parámetros, devolver conflicto. Ante un resultado incierto consultar la
reserva existente, nunca volver a firmar o enviar ciegamente. La transición a
confirmado requiere un recibo comprobado, no solamente un hash. La concurrencia
entre cambio de política/billetera, aprobación, reserva y reintentos debe probarse
contra PostgreSQL real antes de activar el puerto.

## Pendiente de acuerdo con Nano

Nano debe revisar la frontera de autoridad y el orden de bloqueos, acordar cómo
la reserva usa los snapshots y funciones internas de ORD-03, y conectar el puerto
de pagos desde `src/features/crm/server/purchase-orders-public.ts` solo cuando la
reserva y la reconciliación estén terminadas. Su SQL de órdenes todavía es una
propuesta `src/features/crm/database/purchase-orders.sql`, no una migración
versionada aplicada al Supabase compartido. Deben resolverse sus dependencias y
el orden de migración antes de habilitar el flujo en ese entorno.

La reserva actual `reserve_payment_attempt` solo comprueba el formato de los datos
que recibe; por sí sola no verifica orden, aprobación ni política y no debe usarse
como atajo de autorización. También queda pendiente la gestión segura del nonce,
la transmisión y la reconciliación de estados del pago.
