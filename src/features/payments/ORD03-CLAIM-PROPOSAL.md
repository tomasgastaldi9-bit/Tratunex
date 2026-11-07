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

Una operación repetida para la misma orden debe devolver la misma reserva, sin
reasignar nonce aunque cambie la observación de red o el `action_id`. Reutilizar
una acción para otra orden o una configuración incompatible produce conflicto.
Antes de un replay se comprueba de nuevo la identidad, membresía y rol. Ante un resultado incierto consultar la
reserva existente, nunca volver a firmar o enviar ciegamente. La transición a
confirmado requiere un recibo comprobado, no solamente un hash. La concurrencia
entre cambio de política/billetera, aprobación, reserva y reintentos debe probarse
contra PostgreSQL real antes de activar el puerto.

## Respuesta a la revisión de Nano (PR #45)

El orden propuesto es mutex de emisor → membresía → exclusión de acción y orden
→ orden → cotización → compra → perfil de proveedor → contacto → política →
reserva y contador de nonce. Los accesos de pago deben usar un orden común;
hay que verificarlo con pruebas de concurrencia y sin consultar la red dentro
de la transacción. `needs_approval` puede pasar únicamente cuando el claim
compruebe bajo bloqueo la aprobación humana persistida y sus snapshots
vigentes; `rejected` nunca pasa. El preflight actual rechaza ambos y permanece
así hasta que exista evidencia transaccional; no se introduce un booleano del
cliente como sustituto.

### Propuesta para acordar: sin cancelación durante la demo

- El commit del claim crea una intención inmutable: los cambios posteriores de
  reglas o billetera no cambian su importe ni destino. El usuario debe entender
  esa consecuencia antes de aprobar. La firma solo ocurre tras el claim autorizado.
- No se ofrece cancelación ni liberación automática de la orden o del nonce
  después del claim, incluso si no se ve una firma o la red no responde. La
  intención se recupera por su ID y se consulta su estado; un error ambiguo
  no habilita un segundo intento con otros bytes o nonce.
- Una reserva sin firma queda bloqueada para revisión manual. Recuperar o
  abandonar una intención requiere un procedimiento futuro revisado, con
  exclusión del firmador y pruebas de carreras; no se asume que eliminar la
  fila o liberar el nonce invalide una firma ya producida.
- Una transacción preparada o enviada se reconcilia con el mismo hash. No se
  habilita retransmisión automática ni sustitución. Si hay recibo revertido,
  la orden permanece vinculada al intento y no se genera otro pago automático.
- `confirmed` requiere verificar transacción y recibo de Arbitrum, evento y
  finalidad según una política explícita; contar bloques es una observación,
  no prueba suficiente de finalidad. Los estados inciertos permanecen visibles.

Esta es una propuesta conservadora con costo operativo: una interrupción puede
dejar la orden y el nonce bloqueados hasta que exista un procedimiento seguro.
Nano debe confirmar esta semántica antes de activar el puerto.

## Pendiente de acuerdo con Nano

Nano revisó la frontera y propuso el orden de bloqueos en el PR #45; resta
acordar la semántica anterior, definir cómo la reserva usa los snapshots y
funciones internas de ORD-03, y conectar el puerto
de pagos desde `src/features/crm/server/purchase-orders-public.ts` solo cuando la
reserva y la reconciliación estén terminadas. Su SQL de órdenes todavía es una
propuesta `src/features/crm/database/purchase-orders.sql`, no una migración
versionada aplicada al Supabase compartido. Deben resolverse sus dependencias y
el orden de migración antes de habilitar el flujo en ese entorno.

La reserva actual `reserve_payment_attempt` solo comprueba el formato de los datos
que recibe; por sí sola no verifica orden, aprobación ni política y no debe usarse
como atajo de autorización. También queda pendiente la gestión segura del nonce,
la transmisión y la reconciliación de estados del pago.
