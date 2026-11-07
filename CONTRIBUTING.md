# Contribuir a Tratunex

El alcance, el stack, los contratos y el reparto de tareas están en [`docs/BRIEF.md`](docs/BRIEF.md). El proceso completo de coordinación está en [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

## Flujo corto

1. Elige un issue asignado en el proyecto **Tratunex MVP** de Linear. Asegúrate de que tenga criterios de aceptación, dominio responsable y dependencias claras.
2. Revisa `git status --short --branch` y conserva tus cambios locales. Al empezar una tarea nueva, ejecuta `git fetch origin`; esto actualiza las referencias remotas sin modificar tu rama ni tus archivos locales.
3. Crea una rama por issue directamente desde la referencia recién actualizada: `git switch -c docs/TRA-123-descripcion origin/main` (ajusta el prefijo según el trabajo). Usa el ID real del issue. Si tienes cambios locales pendientes, resuélvelos o guárdalos de forma segura antes de cambiar de rama; no los mezcles con la tarea nueva.
4. Mantén los commits pequeños y descriptivos, con prefijos como `feat:`, `fix:`, `docs:`, `chore:`, `test:` o `refactor:`.
5. Abre un pull request con el issue de Linear enlazado. Completa la plantilla, incluye la evidencia de verificación y solicita revisión a alguien distinto del autor.
6. Después del merge, Linear pasa a **Done**. GitHub usa squash merge y elimina automáticamente la rama mergeada.

## Instalación y checks

La aplicación todavía no tiene scaffold. Cuando `package.json` y sus scripts estén disponibles, usa `npm ci` y los comandos definidos allí; no inventes comandos de lint, tipos o tests. Para cambios de producto, el brief requiere Vitest para reglas de dominio, Playwright para recorridos E2E y una verificación real de base cuando se depende de atomicidad.

## Reglas de equipo

- Linear es la fuente única de tickets; no dupliques trabajo en GitHub Issues.
- `main` se integra mediante PR por acuerdo del equipo. La protección técnica de ramas no está disponible en el plan actual del repo privado.
- Respeta los dueños de archivos y coordina con ellos antes de tocar un dominio compartido.
- No incluyas secretos, datos reales ni resultados simulados presentados como live.
