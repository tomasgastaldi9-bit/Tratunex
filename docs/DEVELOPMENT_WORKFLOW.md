# Flujo de desarrollo

Este documento define cómo se coordinan Linear y GitHub. El brief [`docs/BRIEF.md`](BRIEF.md) es la fuente de verdad para producto, stack, contratos y ownership.

## Herramientas y estados

- **Linear**: tareas, responsable, prioridades, dependencias y criterios de aceptación. El equipo es **Tratunex** (`TRA`) y el proyecto es **Tratunex MVP**.
- **GitHub**: código, ramas, commits, pull requests y evidencia de revisión. No dupliques tickets en GitHub Issues.
- Estados existentes de Linear: **Backlog → Todo → In Progress → Done**; usa **Canceled** cuando corresponda. Mientras un PR está abierto, el issue queda en **In Progress**; al merge se marca **Done**. El equipo no tiene un estado In Review.
- No crees ciclos ni fechas recurrentes hasta que el equipo acuerde una cadencia. Los horarios del brief corresponden al evento que describe.

## Cómo preparar un issue de Linear

Cada issue debe incluir:

- resultado concreto y por qué hace falta;
- criterios de aceptación que otra persona pueda comprobar;
- una persona responsable y una etiqueta de dominio;
- archivos/módulo previstos y sus límites de ownership;
- bloqueos, contratos o migraciones de los que depende;
- forma de verificarlo y modo de integración (`mock`, voz web o voz live) cuando aplique.

Etiqueta cada issue con un dominio: `Domain: Platform`, `Domain: Business & Discovery` (prospección), `Domain: Agent`, `Domain: Voice` o `Domain: CRM`. Divide el trabajo que cruza propietarios en issues relacionados; deja claro qué ticket define el contrato y cuál depende de él. Mantén una sola tarea de implementación activa por persona cuando sea posible; registra el bloqueo y la próxima comprobación en Linear.

## Ramas y commits

1. Antes de cambiar de rama, revisa `git status --short --branch`, la rama actual y los últimos commits. Conserva cualquier cambio local; no descartes trabajo que no sea tuyo.
2. Al iniciar cada tarea nueva, ejecuta `git fetch origin`. Esto descarga los últimos commits y actualiza las referencias remotas (incluida `origin/main`) sin cambiar tu rama actual ni tocar tus archivos.
3. Crea una rama corta por issue directamente desde la referencia recién actualizada, nunca desde una copia local posiblemente desactualizada de `main`:
   - `git switch -c docs/TRA-123-descripcion origin/main`
   - Ajusta el prefijo (`feat/`, `fix/` o `chore/`) según el trabajo.
   Si el árbol de trabajo tiene cambios pendientes, guárdalos o termínalos de forma segura antes de cambiar de rama; no los incorpores accidentalmente a la tarea nueva.
4. Usa el identificador real del issue, minúsculas en la descripción y guiones para separar palabras.
5. Prefiere commits pequeños, enfocados y con prefijos Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:` o `refactor:`.
6. No integres directo a `main`. Todos los cambios, incluidos docs y configuración, entran por pull request.

## Pull requests y revisión

- Abre pronto un draft si el cambio depende de otro módulo o necesita coordinación.
- Enlaza el issue de Linear en título o descripción; explica el comportamiento, los archivos/dominos tocados, dependencias y límites conocidos.
- Indica los comandos de verificación ejecutados y su resultado exacto. Declara si usaste fixtures, `mock`, voz web o telefonía real.
- No pidas aprobación al autor del PR. Usa la revisión cruzada del brief: **Vale ↔ Nano** y **Bautista ↔ Tomás**. Un cambio de contrato también lo revisa al menos un dominio consumidor.
- Sincroniza con `origin/main` antes de integrar. Resuelve conflictos solo en tus archivos; para archivos compartidos acuerda primero con el dueño.
- El repo usa **squash merge** y borra automáticamente ramas integradas. Después del merge, marca el issue de Linear **Done**.

La protección técnica de `main` no está disponible en el plan de GitHub actual mientras el repositorio sea privado. El PR obligatorio es una regla de equipo y depende de que los integrantes no la eludan con un push directo.

## Ownership y coordinación de archivos

| Dominio/archivos | Responsable |
|---|---|
| Configuración raíz, `package.json`/lockfile, `src/lib/**`, contratos comunes, `src/features/platform/**`, `src/features/discovery/**`, cron, migraciones compartidas y despliegue | Tomás |
| `src/features/agent/**`, contratos/rutas del dashboard del agente | Vale |
| `src/features/voice/**`, contratos/rutas de voz y llamadas | Bautista |
| `src/features/crm/**`, pipeline, tareas, shell, navegación, layout, estilos globales y UI compartida | Nano |

El detalle exacto de páginas, API, contratos, tablas y rutas de cada dueño está en la sección 5 de [`BRIEF.md`](BRIEF.md). Leer código ajeno está permitido; editarlo requiere acuerdo del responsable.

## Contratos, base de datos y seguridad

- Para proponer un cambio entre dominios, especifica archivo/campo/firma, motivo y consumidores. El dueño publica el cambio compatible y avisa a quienes dependen de él.
- No crear un barrel compartido que obligue a varios dominios a editar el mismo archivo; importa servicios y contratos públicos concretos.
- Cada dueño propone migraciones de su dominio; Tomás coordina y ejecuta las migraciones remotas. Las migraciones aplicadas son inmutables. No hagas reset de la base compartida.
- Cada autor mantiene sus fixtures/seed; no borres ni regeneres datos compartidos sin coordinación.
- Guarda secretos solo en el entorno local o en el servicio correspondiente. `.env.example` lleva nombres de variables y valores vacíos; nunca publiques credenciales o teléfonos reales.
- Los resultados externos y los fixtures deben distinguirse. `unknown`, timeouts y errores de proveedor se muestran como tales; no repitas una llamada a ciegas.

## Verificación y terminado

Usa los comandos existentes en `package.json`; una vez definido el scaffold, CI ejecutará clean install, lint, typecheck, Vitest y build. Añade Playwright y pruebas de integración cuando el entorno pueda reproducirse con credenciales seguras.

Un issue termina cuando sus criterios se cumplen, pasan las verificaciones del dominio, se actualizaron contratos/docs afectados, la PR recibió revisión independiente y fue mergeada. No reportes integración live, despliegue ni migración sin evidencia reproducible.
