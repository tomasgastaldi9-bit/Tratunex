# PAY-02: pagos ARGt con recuperación segura

Estado: preparación; no habilita pagos ni contiene un firmador conectado.

## Integraciones necesarias

- Nano: contrato público de servidor que resuelva una orden persistida por `company_id` y `order_id` con proveedor, importe entero en unidades atómicas, versión o huella de la orden y aprobación verificable. La billetera del proveedor debe provenir de su contacto persistido; no aceptar destino ni monto del navegador.
- Vale: `checkPurchasePolicy(ctx, { amount_atomic, supplier_contact_id })`, con reglas persistidas y decisión `auto_pay | needs_approval | rejected`; definir cómo se prueba una aprobación vigente y cómo se invalida cuando cambian la orden o las reglas.
- Las reglas, el proveedor, el destino, la orden y su aprobación tienen que seguir vigentes al reclamar el pago. Si no hay contrato confiable para ello, fallar cerrado.

## Invariantes

1. Exclusión y unicidad transaccional por empresa y orden; reutilizar una acción con otros datos produce conflicto. Solo una operación por orden puede avanzar a firma.
2. Aislamiento también a nivel de la billetera emisora y nonce: pagos simultáneos de empresas distintas no deben firmar transacciones diferentes con el mismo nonce.
3. Fijar red, token, destino, monto, nonce, hash y transacción firmada antes de transmitir. Guardar la transacción firmada en almacenamiento privado con permisos mínimos: cualquiera que la obtenga puede transmitirla.
4. Ante corte, timeout o respuesta ambigua, conservar el mismo hash y consultar la red; nunca construir y enviar otra transacción a ciegas. La retransmisión de los mismos bytes requiere una política explícita de recuperación.
5. `confirmed` requiere recibo exitoso de Arbitrum y comprobación de emisor, token, destino, importe y evento de transferencia. Un hash por sí solo no demuestra éxito; `reverted` y `unknown` son estados explícitos.
6. Las claves, transacciones firmadas y datos sensibles nunca se escriben en logs, Git ni respuestas al navegador. Solo el servidor accede a la llave; verificar empresa y autorización antes de consultar recibos o firmar.
7. Usar unidades enteras, 18 decimales, sin `float`. La aprobación de una transacción real no se infiere de las pruebas ni del permiso para desarrollar.

## Verificación pendiente

- Unitarias de autorización, límites, coincidencia de orden/proveedor y estados ambiguos.
- Integración Postgres con dos solicitudes simultáneas por orden y dos órdenes usando la misma billetera, con concurrencia real y condiciones de fallo.
- Simular interrupciones antes/después de persistir firma, al transmitir y al consultar el recibo; comprobar que no se produce una segunda transferencia.
- Probar recibos exitosos, revertidos, pendientes, sustituidos y coincidencia de evento. Comprobar aislamiento entre empresas.
- Primero verificar con mocks y una red/local fork seguro sin fondos; solo ejecutar una transferencia real cuando la orden, el destinatario y el importe estén definidos y autorizados.
