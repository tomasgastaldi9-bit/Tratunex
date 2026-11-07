# ORD-03 / PAY-02 · Acuerdo y revisión de la frontera de pago

Revisión de Nano del 7 de noviembre de 2026 sobre PAY-02
[`4896c39`](https://github.com/tomasgastaldi9-bit/Tratunex/commit/4896c39bc8fa7841cdd82e374d65e359e269d222)
del [PR #30](https://github.com/tomasgastaldi9-bit/Tratunex/pull/30), frente a
Órdenes integrado por #36 y #34. Sustituye las observaciones iniciales sobre
`13b13b1` y `48ee1a0`. Los cambios posteriores de PAY requieren revisar sus diferencias.

Esta entrega documenta el acuerdo. No modifica contratos, SQL, configuración ni
disponibilidad. `payInvoice` público sigue deshabilitado. La revisión actual es
de código: no acredita pruebas nuevas de pagos, migraciones remotas ni transferencias.

## Puertos y consumidores

Entrada de Tomás: `src/features/payments/server/public.ts`.
Consumidor de Nano: `src/features/crm/server/purchase-orders-public.ts` y pantalla
de órdenes. CRM consume servicios públicos, sin importar el firmador ni
`createPaymentPorts` desde archivos internos de Pagos.

| Firma pública de PAY en la referencia revisada | Estado |
|---|---|
| `payInvoice(ActionCtx, { order_id }): Promise<Result<{ payment: PaymentDTO }>>` | Exporta `payInvoiceUnavailable`: no reserva, firma, transmite ni devuelve pago exitoso. |
| `getOrderPayment(Ctx, { order_id }): Promise<Result<{ payment: OrderPayment \| null }>>` | Lee la última observación persistida. `null` es ausencia; un fallo es error explícito. No consulta ni reconcilia blockchain. |

`server/read-payment.ts` verifica sesión, identidad y empresa antes de usar
`read_order_payment` y valida `OrderPaymentSchema`. No inicializa firmador ni
cliente de blockchain. La lectura puede conectarse separadamente; su existencia
no cambia `availability` a `ready` ni autoriza una aprobación. Un fallo de consulta
se muestra como estado no disponible y exige consultar antes de otra acción.

La rama PAY ya propone esa conexión en `purchase-orders-workspace.ts` y la
pantalla de órdenes: carga el pago guardado al abrir, transmite el resultado a
la UI y distingue el fallo de consulta. Esos cambios de CRM están en #30,
pendientes de revisión e integración; no forman parte del PR documental #45.

`getPurchaseOrder` es lectura. Tampoco un resultado cacheado de aprobación
autoriza una transferencia: el claim revalida autoridad y snapshots.

## Acuerdo de autorización

Desde Órdenes aceptamos para el MVP la intención inmutable al commit del claim,
propuesta por Tomás en `payments/ORD03-CLAIM-PROPOSAL.md`:

- El primer claim fija orden, importe, destino, red, token, versiones y nonce.
  Cambios posteriores de política o billetera no modifican esa intención.
- No hay cancelación, liberación de nonce, sustitución ni retransmisión automática.
  Una interrupción puede dejar orden y nonce bloqueados para revisión.
- Recuperar la misma intención no crea otra firma ni otro pago. Una respuesta
  perdida o estado ambiguo exige consultar su identidad persistida.
- Antes de activar el botón, la UI explica esa consecuencia junto al monto y
  destino. Este acuerdo no autoriza una transferencia.

La sesión determina identidad, empresa y permisos. El claim privado comprueba
membresía y rol admin antes del replay. El navegador no aporta monto, destino,
nonce ni una bandera confiable de aprobación. Importes: cadenas enteras de
unidades atómicas; ARS conserva la equivalencia nominal publicada por Órdenes;
USD sin conversión permanece bloqueado.

Antes de la primera reserva se verifican orden aprobada, versión y aprobación
persistidas, snapshots actuales, billetera humana vigente, Arbitrum, dirección
no cero, stock, mínimos, aceptación ARGt, presupuesto, máximo y allowlist.
La aprobación humana cubre `needs_approval`, nunca `rejected`. El preflight
actual informa `authorization: "unverified"`; la autoridad está en el claim.
Cambios previos invalidan los snapshots y fallan cerrados. No se sortea el
bloqueo de refresh de una orden aprobada con SQL directo.

`source: "call"` por sí solo no acredita telefonía: el claim revisado comprueba
la asociación con una llamada Vapi telefónica completada y rechaza simulaciones
o voz web. Esto no demuestra que una llamada real haya ocurrido en este entorno.
Las cotizaciones de ejemplo no se pagan.

## Snapshots, bloqueos e idempotencia

Secuencia observada en `crm/database/purchase-orders.sql`:

| Operación | Adquisición |
|---|---|
| Aprobar/refrescar | Membresía `SHARE` → recibo → orden `UPDATE` → cotización `SHARE` → compra `SHARE` → perfil proveedor `SHARE` → contacto `SHARE` → política `SHARE` |
| Crear | Membresía → recibo → advisory empresa/cotización → orden existente `UPDATE`, o contexto en la secuencia anterior antes del insert |
| Cambiar billetera | Recibo → perfil `UPDATE`; lectura final de contacto sin lock de fila |

El claim añade mutex global `(chain_id, lower(sender))` antes de membresía,
exclusión acción/orden, orden y contexto en esa secuencia; para origen telefónico
añade `calls SHARE` tras el contexto, antes de reserva y contador de nonce.
Perfil precede a contacto. No llamar al dispatcher de aprobación
tras bloquear la reserva ni consultar blockchain dentro de la transacción.
La revisión independiente de `48ee1a0` no encontró inversión alcanzable frente a
las APIs entonces revisadas; no sustituye pruebas de carreras.
Referencia: [PostgreSQL 17 · Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html).

Una orden recupera una única intención aunque cambie `action_id` u observación
del nonce. Misma acción para otra orden/configuración produce conflicto. Los
recibos privados de Pagos separan su namespace de `crm.approvePurchaseOrder`.
La unicidad emisor/red/nonce cruza empresas: un mutex en memoria no alcanza.
Todos los caminos operativos deben usar ese asignador. La API legacy
`reserve_payment_attempt` conserva locks propios, sin mutex `pay-wallet` ni
autorización de orden: debe seguir excluida como camino alternativo de firma o
asignación. El claim rechaza reservas legacy sin `order_version`.

## Implementación que ya aporta PAY

`payInvoiceWithPorts` en `pay-service.ts` y `server/payment-ports.ts` aportan
sesión → versión/nonce → claim → preparación/envío → reconciliación → lectura.
Comprueban identidad, reserva e importe; una respuesta perdida no autoriza otro
envío. La orquestación interna aún no está conectada al `payInvoice` público.

Existen firma con límites de gas, persistencia cifrada del intento, marca durable
de transmisión única y reconciliación del mismo hash con recibo, transferencia
y bloque canónico/finalizado. Los componentes y sus pruebas están en la rama
PAY; no se presentan como piezas faltantes ni como integración desplegada y
verificada de punta a punta.

## Migraciones y activación pendiente

Tomás coordina aplicar, con las dependencias previas:

1. `20261107183911_add_supplier_profiles.sql` (ORD-01).
2. `20261107183915_add_purchase_orders.sql` (ORD-03).
3. `20261107184010_claim_order_payment.sql` y posteriores de preparación,
   marca de envío, observación y lectura de Pagos.

La comparación actual de las dos primeras con los SQL aprobados de Nano dio
igualdad normalizando finales de línea. No acredita aplicación remota. Antes de
aplicar se contrastan objetos e historial del destino y las dependencias
PLAT-02/03, CRM-03, BUY-01/02 y QUO-02. No reescribir migraciones aplicadas,
ocultar drift con `IF NOT EXISTS` ni resetear la base compartida. En esta entrega
no se accedió ni se aplicó SQL a la base compartida.

Antes de habilitar el pago corresponde:

- Tomás conecta el `payInvoice` público, valida RPC, gas, cifrado/recuperación y
  uso exclusivo del emisor/asignador de nonce.
- Nano revisa e integra la conexión de lectura propuesta en #30, completa la
  conexión operativa con el puerto público de pago y la explicación de intención
  inmutable; verifica estados ambiguos y hash conservados al recargar.
- Verificar la versión completa con PostgreSQL real y transporte simulado:
  claims concurrentes de una orden y entre empresas, replay/permisos, cambios
  de política/billetera, el nuevo lock de llamadas, pérdida de respuesta y recuperación sin otro envío;
  recibos pendientes, revertidos y confirmados. Las pruebas existentes de PAY
  son evidencia a revisar, no resultados ejecutados en esta entrega.
- Aplicar migraciones y verificar el recorrido en el destino coordinado. Solo
  entonces evaluar `availability: "ready"`. Un stub o hash aislado no prueba
  pago confirmado. La transacción real de la demo se acredita aparte.

El merge publica el acuerdo de Nano. ORD-03 sigue abierto hasta cumplir sus
criterios de pago verificable.
