# CRM-04 · Pipeline manual persistido

`pipeline.sql` es una propuesta incremental sobre CRM-03 (`contacts.sql`) y
PLAT-02/03. Tomás coordina su versión y aplicación al Supabase compartido.
No modifica migraciones anteriores, contactos, tablas de Voz ni seguimientos.
La comprobación descrita aquí se ejecutó únicamente en PostgreSQL local.

La propuesta crea `deals` y `activity_log`. Sus claves compuestas aseguran que
empresa, contacto y oportunidad correspondan entre sí. Cada tabla habilita RLS
de lectura por membresía vigente. Los clientes, incluido `service_role`, no
escriben directamente: las mutaciones pasan por la RPC transaccional.

## API SQL

`pipeline_execute(p_ctx, p_operation, p_input)` devuelve `Result<T>`:

- `createDeal({ contact_id, title })` devuelve `{ deal }`. Crea una oportunidad
  en `new` y una actividad. Un contacto puede tener varias oportunidades;
  distintas intenciones usan distintos `action_id`. El estado inicial también
  es `new` si el contacto está marcado como no contactar: crear una oportunidad
  manual no inicia llamadas ni modifica esa preferencia.
- `setDealStage({ deal_id, stage, expected_stage? })` devuelve `{ deal }`.
  Bloquea la fila antes de comprobar `expected_stage`; si está desactualizada,
  devuelve `CONFLICT`. Las siete etapas del brief son válidas. Una persona puede
  corregir o reabrir etapas terminales. Guardar la misma etapa conserva
  `updated_at` y no genera otra actividad.
- `listDeals({ limit?, cursor?, contact_id?, stage? })` devuelve
  `{ items, next_cursor }`. Orden UUID ascendente, cursor exclusivo.
- `listActivities({ limit?, cursor?, contact_id? })` devuelve la misma forma,
  ordenada por `occurred_at DESC, id DESC`. El cursor UUID resuelve la fecha y el
  ID del registro dentro de la empresa activa; uno inexistente o ajeno devuelve
  `NOT_FOUND`. El log es inmutable para los clientes. Cada movimiento describe
  las etapas anterior y nueva en español y conserva su actor y fecha UTC.

Ambas listas aplican sus filtros antes de paginar, usan límite predeterminado
50 y máximo 100, y consultan un registro adicional para calcular el cursor.
No confían en un `company_id` del input.

El dispatcher privilegiado está en `app_private` con `search_path` vacío; el
wrapper público usa `SECURITY INVOKER`. Cada operación comprueba sesión/actor y
membresía antes de devolver incluso un recibo cacheado. Las mutaciones manuales
solo admiten `actor_type: user`. Lecturas de Voz/sistema requieren el rol SQL
`service_role`; un claim JSON no otorga esa autoridad. `anon` no ejecuta la RPC
y los helpers permanecen privados.

Oportunidad, actividad y recibo PLAT-02 se guardan en una misma transacción.
Repetir la acción devuelve exactamente su snapshot anterior; reutilizarla con
otros datos u operación produce `CONFLICT`. Los errores revierten el recibo
nuevo junto con el resto de la mutación. No hay llamadas externas ni reintentos
automáticos en esta RPC.

## Verificación reproducible

Requiere la base aislada `tratunex_contacts_verify` con los prerrequisitos de
CRM-03 ya instalados. Preserva los datos existentes. El helper solo conecta a
loopback y a ese nombre de base.

```powershell
$env:CRM_PSQL = 'ruta/local/pgsql/bin/psql.exe'
$env:CRM_PGPORT = '55439'
$env:PGCLIENTENCODING = 'UTF8'
& $env:CRM_PSQL -X -h 127.0.0.1 -p 55439 -U postgres -d tratunex_contacts_verify -v ON_ERROR_STOP=1 -f src/features/crm/database/pipeline.sql
node src/features/crm/verification/verify-pipeline-db.mjs
```

El 2026-11-07, PostgreSQL **17.11** aprobó **55 comprobaciones, exit 0**:
ocho creaciones concurrentes con la misma acción; carrera entre dos cambios
desde la misma etapa; repetición idempotente; oportunidades múltiples; recarga
desde nuevas conexiones; siete etapas y reapertura manual; no-op sin actividad;
filtros y paginación; historial cronológico con cursor ajeno/inexistente;
compatibilidad Zod; RLS, ACL y actores falsos; revocación de membresía antes del
caché; rollback conjunto de oportunidad, actividad y recibo. El script limpia
solo las empresas y UUID aleatorios creados por su propia ejecución.

El fixture de Auth de esta base sustituye GoTrue/JWT. Estos resultados no
demuestran un Supabase remoto, PostgREST real, telefonía ni clasificación
automática. Las reglas de eventos de `recordCallResult` corresponden a CRM-05;
esta entrega registra únicamente decisiones manuales.
