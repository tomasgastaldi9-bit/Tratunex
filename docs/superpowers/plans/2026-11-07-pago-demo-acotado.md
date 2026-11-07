# Pago de demo acotado Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and check each task with its tests.

**Goal:** Permitir una sola transferencia real de 1 ARGt con una orden de ejemplo rotulada, sin habilitar cotizaciones ficticias para pagos normales.

**Architecture:** Mantener intactas las migraciones ya aplicadas y el claim ordinario. Una autorización privada limita la excepción a una empresa, una orden, el emisor y el destinatario aprobados; una ruta específica valida esos datos y reutiliza la reserva y marca de transmisión existentes. La identidad proviene de la sesión; importe y billeteras nunca provienen del navegador.

**Tech Stack:** Next.js, Supabase/Postgres, viem, Vitest y Playwright.

**Spec:** `docs/BRIEF.md`, sección «Excepción autorizada para la demo».

## Global Constraints

- Arbitrum One, contrato ARGt de Twin, exactamente 1000000000000000000 unidades atómicas; destino `0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1` y emisor del agente documentado.
- Solo la empresa y orden autorizadas; admisión restringida a admin autenticado, snapshots, presupuesto y política vigentes. Deshabilitar al terminar.
- Nunca modificar migraciones aplicadas, transmitir automáticamente al reintentar, exponer claves o presentar una cotización ficticia como real.

## Tasks

- [ ] Crear una nueva migración con autorización privada y operaciones de demo limitadas a una orden, sin cambiar los permisos del flujo ordinario. Probar en Postgres aislado rechazo de otra empresa, orden, monto, emisor, destino, actor y snapshots; probar condiciones de carrera y la misma reserva/nonce.
- [ ] Conectar una operación de servidor y UI de demo que exijan confirmación humana, muestren datos ficticios y adviertan transferencia real irreversible; comprobar que consultas o errores ambiguos no crean ni transmiten otra operación.
- [ ] Probar el flujo con claves y transporte ficticios, incluidas interrupciones antes y después de persistir y marcar el envío; revisar de forma independiente el diff y las migraciones.
- [ ] Aplicar la migración aprobada sin reset y preparar la empresa y orden de demo; verificar configuración, saldos, destino e importe antes de habilitar la excepción.
- [ ] Con intervención del usuario, ejecutar una sola transferencia real, reconciliar recibo/finalidad, deshabilitar la excepción y añadir hash y enlace verificables al README.
- [ ] Ejecutar lint, typecheck, pruebas, build y CI; revisar los PR, hacer push y merge; marcar los issues como terminados solamente cuando se cumpla su aceptación real.
