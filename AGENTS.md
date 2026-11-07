# Instrucciones del repositorio

## Fuente de verdad

- Antes de trabajar, revisa `git status --short --branch` y conserva cualquier cambio existente.
- Al iniciar una tarea nueva, ejecuta `git fetch origin` y crea su rama desde `origin/main` actualizado; `fetch` actualiza referencias remotas sin mezclar cambios en tu rama actual.
- Lee `docs/BRIEF.md` antes de modificar código. Define el producto, el alcance, el stack, los contratos, las reglas del pipeline, las dependencias y los dueños de archivos (sección 5).
- Sigue `docs/DEVELOPMENT_WORKFLOW.md` para Linear, ramas, commits, PRs, revisión y verificación. Usa `CONTRIBUTING.md` para el flujo humano.
- Si una instrucción de esta carpeta contradice un contrato del brief o una instrucción directa del usuario, detente y explica el conflicto antes de cambiar el alcance.

## Dueños de dominios y archivos

- Tomás: configuración raíz, `package.json`/lockfile, `.env.example`, `src/lib/**`, contratos comunes, `src/features/platform/**`, `src/features/discovery/**`, login, prospección, cron (`/api/jobs/tick`), migraciones compartidas y despliegue.
- Vale: `src/features/agent/**`, `src/contracts/agent.ts`, `/agent/**` y `/api/agent/**`.
- Bautista: `src/features/voice/**`, `src/contracts/voice.ts`, `/calls/**` y `/api/voice/**`.
- Nano: `src/features/crm/**`, `src/contracts/crm.ts`, `/pipeline`, `/contacts`, `/tasks`, `/api/crm/**`; además, shell, navegación, layout, estilos globales y componentes UI compartidos.
- Cada responsable modifica sus contratos, fixtures, pruebas, páginas y rutas. No edites el dominio de otra persona sin acordarlo con su responsable.
- Tomás coordina las migraciones compartidas. Nadie reescribe migraciones aplicadas ni hace reset de la base compartida.
- Evita archivos barrel que obliguen a varios dominios a editar el mismo punto de entrada; consume los contratos y servicios públicos del módulo (`server/public.ts`).

## Contratos e integración

- Un cambio entre dominios identifica archivo/campo o firma, motivo y consumidores; debe ser compatible cuando sea posible y revisado por al menos un consumidor.
- El servidor establece identidad, empresa y permisos; el modelo no define autoridad ni ejecuta acciones fuera de las herramientas validadas.
- Mantén UUID internos, IDs externos, `company_id`, `action_id`, idempotencia y UTC exactamente como define el brief.
- Los errores y estados ambiguos se representan explícitamente. No conviertas un fallo en resultado exitoso ni repitas llamadas a ciegas.

## Seguridad y evidencia

- Nunca guardes secretos, credenciales, teléfonos reales de prueba ni datos sensibles en Git. Usa `.env.example` solo con nombres y valores vacíos.
- Distingue `mock`, voz web y voz telefónica real en código, interfaz, PR y demo. No presentes fixtures como resultados externos.
- No afirmes que una integración, migración, prueba o despliegue funciona sin evidencia reproducible.

## Desarrollo y verificación

- Usa una rama corta vinculada a un issue de Linear; no integres cambios directamente en `main`.
- Mantén cada PR enfocado, ejecuta las comprobaciones del dominio afectado y reporta comandos y resultados exactos.
- El brief fija Vitest, Playwright y verificaciones de base de datos cuando aplica atomicidad. Añade CI cuando el scaffold de Next.js tenga scripts reales.
- No actualices el stack ni agregues dependencias globales sin un ticket y acuerdo del dueño correspondiente.
