# Interfaz CRM mock

`public.ts` es el punto de integración de servidor para Prospección y Voz.
Exporta las siete operaciones del brief sin cambiar sus argumentos y consume
`Ctx`, `ActionCtx` y `Result<T>` de `src/contracts/common.ts`.
`public.ts` y `mock-instance.ts` están marcados `server-only`.

## Modo y persistencia

`crmIntegration.mode` vale **`mock`** y `persistence` vale **`process`**.
El adaptador siempre es una simulación; no elige un modo live ni hace fallback
al faltar credenciales. La semilla contiene solamente datos ficticios.

Las mutaciones modifican una instancia compartida en memoria del proceso.
El modelo de lectura de la demo consulta esa misma instancia. Reiniciar el
proceso restablece los fixtures; varios procesos/instancias no comparten estado.
Esto no demuestra persistencia Postgres, RLS, autenticación, migraciones ni
atomicidad entre procesos. No hay endpoints HTTP de escritura en este bloque.

El reloj por defecto queda fijo en `fixtures.now`, publicado en la metadata.
Así, vencimientos, leases y la demo se reproducen con los mismos datos.
La factory permite inyectar un reloj que avance para pruebas.

## Consumo

```ts
import { crmIntegration, upsertContact } from "@/features/crm/server/public";

// ctx debe ser construido por el servidor a partir de un origen verificado.
// En esta etapa solo se admiten los dos company_id ficticios de fixtures.json.
const result = await upsertContact(actionCtx, input);
// Mostrar crmIntegration.mode en cualquier recorrido que consuma este adapter.
```

`getContact` oculta contactos de otra empresa con `NOT_FOUND`. Las funciones
validan sus inputs con Zod y las mutaciones requieren `action_id` no vacío.
La validación del contexto no autentica al actor: sesión, membresía real,
permisos y la relación entre llamada/empresa deben verificarse en Plataforma
y en el caller de Voz antes de consumir la futura implementación persistente.
Los UUID de llamadas son referencias; esta simulación no consulta la tabla de Voz.

## Reglas simuladas

- Repetir `action_id` dentro de la empresa devuelve la respuesta original;
  cambiar actor, operación o datos devuelve `CONFLICT`, como en los recibos de PLAT-02.
  El trabajo es síncrono dentro
  del proceso y la respuesta se copia para evitar mutaciones desde el caller.
- Contactos se deduplican por teléfono E.164 o dominio sin `www`. Si ambos
  identifican contactos diferentes, se devuelve `CONFLICT`. `do_not_contact`
  nunca pasa de `true` a `false` al reimportar. Un contacto nuevo obtiene una
  oportunidad en `new` para que aparezca en el pipeline de demostración.
- Resultados se deduplican por evento y rechazan un contenido distinto para
  el mismo ID. Se aplican las reglas del brief en orden y se preservan etapas
  terminales. Eventos viejos se guardan sin degradar el pipeline ni crear tareas;
  una petición de no contacto se conserva y cancela callbacks pendientes/en curso.
- Sin `deal_id`, varias oportunidades producen `CONFLICT`; no se elige una
  oportunidad arbitraria. Los casos con ninguna oportunidad devuelven `deal: null`.
- Callbacks exigen fecha; revisión humana admite fecha nula. Con llamada de
  origen se deduplica por contacto, llamada, tipo y fecha, y una oportunidad
  distinta en esa coincidencia produce `CONFLICT`.
- Solo callbacks vencidos pueden reclamarse. El lote es de hasta 5 y el lease
  debe pedirse con 90 segundos. Cada reclamo genera `lease_id` nuevo.
  Completar/fallar con lease viejo o vencido devuelve `CONFLICT`.
  Completar significa guardar la referencia de llamada aceptada, sin cerrar ventas.
- Los límites de llamadas por contacto, la ventana horaria y la confirmación
  real de aceptación por Vapi pertenecen al despacho de Voz y no se simulan
  como pruebas de telefonía en este adaptador.

Los campos DTO y las decisiones ante coincidencias ambiguas continúan sujetos
a revisión de Tomás y Bautista como consumidores. Esta implementación no declara
terminadas las tareas de base de datos, resultados ni automatización live.

## Verificación

```powershell
npm test -- src/features/crm/server/mock-crm.test.ts
```

Las pruebas usan `createMockCrm` con estado independiente. Cubren contactos,
aislamiento en memoria, idempotencia, reglas de pipeline, duplicados, eventos
viejos, seguimiento y fencing de leases. Las garantías transaccionales reales
requieren sus propias pruebas de Postgres al implementar la persistencia.
