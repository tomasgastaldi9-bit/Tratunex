# Vale — negocio, catálogo y prospección

**Brief final de implementación · Contrato técnico v1.0 · Brief v1.2 · Equipo: Vale, Bauti, Tomi y Nano.**

Leé primero `00_GENERAL.md`. Este archivo define tu trabajo de punta a punta: configuración del negocio, catálogo, proveedores y búsqueda de posibles clientes. La asignación es por responsabilidad; podés desarrollar pantallas y backend dentro de tus carpetas.

El producto completo conserva ventas, llamadas, CRM, seguimiento, pedidos, cobros y compras a proveedores. Tu módulo aporta información verificable al resto. Este documento es un plan: todavía no implica código implementado ni servicios configurados.

## 1. Tu entrega

El dueño configura su negocio, carga productos y reglas comerciales, registra proveedores y busca empresas que podrían comprarle. Ve candidatos con sus fuentes y elige cuáles incorporar al CRM. Bauti consulta tu información durante las llamadas; Tomi la utiliza para validar pedidos y compras.

Tu recorrido demostrable es: **configurar negocio → cargar catálogo → buscar candidatos → revisar evidencia → importar contactos → dejarlos disponibles para llamadas**. También configurás los proveedores que alimentan el recorrido de reposición.

## 2. Stack cerrado

Usamos Node 24, Next.js App Router estable fijado con `package-lock`, TypeScript strict, Tailwind, Zod, Supabase Postgres y Auth con `@supabase/ssr`. Tu integración externa es Firecrawl REST. El equipo comparte Vitest, Playwright y despliegue en Vercel.

No agregues otro backend, ORM, buscador o librería de estado sin coordinar. Tomi mantiene dependencias y configuración raíz. Usá componentes compartidos de Nano. El adaptador Firecrawl se ejecuta exclusivamente en servidor; su clave nunca llega al navegador.

## 3. Ownership: qué podés modificar

- `src/features/business/**` y `src/features/discovery/**`.
- Páginas `/business` y `/prospects`, dentro de sus carpetas de App Router.
- `src/app/api/business/**`, `src/app/api/catalog/**`, `src/app/api/prospects/**` y `src/app/api/suppliers/**`.
- `src/contracts/business.ts`, `src/contracts/discovery.ts` y fixtures propios dentro de tus módulos.
- Migraciones nuevas de tus tablas, coordinadas con Tomi antes de aplicarlas.

Escribís únicamente `businesses`, `products`, `supplier_settings`, `prospect_searches` y `prospect_candidates`. **No escribís `contacts`: importás mediante `upsertContact` de Nano.** No editás layout, componentes compartidos, `common.ts`, configuración, lockfile ni migraciones aplicadas. Tomi es el único ejecutor de migraciones remotas.

## 4. Datos y reglas del negocio

### Perfil y catálogo

Guardá nombre, descripción, sector, público objetivo, zona atendida y condiciones comerciales. Separá hechos verificables de instrucciones de conversación. Una instrucción puede explicar cómo presentar un producto; no puede habilitar descuentos inexistentes.

Todos los IDs de dominio son UUID y tus tablas incluyen `business_id`, salvo `businesses`, cuyo propio `id` identifica al negocio. El catálogo usa exclusivamente USDC: precio unitario como `unit_amount_atomic` según ProductDTO de la sección 14 del general, representado por cadena de entero; persistencia `numeric(78,0)`. No uses `float`, pesos ni conversión de moneda. Los decimales se consultan al contrato seleccionado; con seis decimales, 12,5 USDC son `"12500000"`.

Cada producto debe permitir identificar nombre, descripción, precio y disponibilidad comercial. Si muestran stock, diferencien cantidad conocida de dato desconocido; tu consulta no constituye por sí sola una reserva de inventario. Tomi valida las cantidades y condiciones del pedido.

### Proveedores y política de compras

El proveedor es un contacto del CRM cuyo array `roles` incluye `supplier`. Primero pedís a Nano crear o actualizar ese contacto y después guardás `supplier_settings`. Usá FK al contacto, validá pertenencia al mismo negocio y agregá `UNIQUE(business_id, contact_id)`. Una FK al ID por sí sola no evita referencias entre negocios; resolvelo con restricción compuesta o validación respaldada por la base.

Tus ajustes permiten identificar proveedor habilitado, condiciones y wallet de prueba autorizada. Tomi mantiene la política de ejecución y presupuesto: máximo por pedido, límite diario y reserva atómica. La pantalla incluye límites y consume `GET/PATCH /api/commerce/purchase-policy`; no escribe sus tablas. La política vive en `purchase_policies`, las reservas en `purchase_budget_reservations`, y el día presupuestario usa zona argentina. La IA no modifica wallets ni límites. `getSupplierSettings` entrega datos; `executeSupplierPayment` decide y ejecuta en el módulo de Tomi.

## 5. Contratos públicos

Exportá desde `src/features/business/server/public.ts`:

```ts
getBusinessContext(ctx)
listProducts(ctx, { query? })
getProductsByIds(ctx, { product_ids })
getSupplierSettings(ctx, { contact_id })
```

Y desde `src/features/discovery/server/public.ts`:

```ts
searchProspects(ctx, { query, location, limit })
importProspects(actionCtx, { candidate_ids })
```

Los argumentos y DTO se validan con Zod. Todas las funciones devuelven `Result<T>`: `{ok:true,data:T}` o `{ok:false,error:{code,message,retryable}}`, usando los códigos comunes. Queries reciben `RequestContext`; importación recibe `ActionContext` con `action_id` estable. El backend establece negocio y actor tras validarlos; no confíes en el `business_id` enviado por una pantalla o por el modelo.

Importá contratos directamente, sin crear un `index.ts` compartido. Otros módulos acceden a tus servicios únicamente por `server/public.ts`; entre pantallas de módulos distintos se usa HTTP. Tus dependencias son business y CRM; no importes implementaciones de voz o comercio.

## 6. Búsqueda con Firecrawl

Implementá un adaptador REST siguiendo la [documentación oficial de Search](https://docs.firecrawl.dev/features/search). El flujo combina búsqueda con revisión o scrape de un número acotado de páginas relevantes. Aplicá 5 resultados y 5 páginas máximas, concurrencia 2 y timeout de 20 segundos por operación; evitá crawling abierto durante la demo.

Persistí la consulta y estado en `prospect_searches`. Guardá candidatos en `prospect_candidates` con nombre, URL fuente, evidencia disponible, teléfono original si aparece, teléfono normalizado cuando sea válido y campos pendientes de verificar.

**Buscar no garantiza encontrar teléfonos.** No generes números, no completes dígitos y no conviertas una coincidencia dudosa en contacto verificado. Conservá la URL y un fragmento breve que respalde el dato. Si hay varias sucursales, mantené la asociación entre teléfono, ubicación y fuente; no mezcles resultados.

Normalizá a E.164 solamente cuando exista contexto suficiente de país y numeración. Si el valor es ambiguo, conservá el original y marcá revisión; nunca lo pases a campañas como teléfono válido. La ausencia de teléfono permite conservar el candidato, pero impide llamarlo hasta completar el dato.

Deduplicá candidatos dentro del negocio mediante una huella estable de los datos disponibles, con restricción única. Un valor `NULL` de teléfono no debe permitir duplicados indefinidos. La deduplicación final de contactos pertenece a Nano.

### Compatibilidad y señales comerciales

Mostrá una rúbrica explicable: sector compatible, zona compatible y oferta relevante. Cada dimensión tiene evidencia favorable, desfavorable o desconocida. Podés mostrar cuántas dimensiones son favorables, conservando cuáles siguen desconocidas. **Compatibilidad no significa interés**: únicamente la conversación aporta interés, rechazo o intención de pedido. No muevas oportunidades a `interested` por un resultado de búsqueda.

### Importación

`importProspects` valida candidatos, negocio y datos antes de llamar `upsertContact(actionCtx,input)` con el formato definido por `crm.ts`. Guardá la relación candidato→contacto y un resumen de importados, existentes y fallidos. Repetir la misma acción no crea contactos nuevos. Para subacciones derivá identificadores estables por candidato; mantenelos al reintentar.

## 7. Seguridad y experiencia de uso

Las rutas de usuario validan sesión y pertenencia al negocio. Escribí RLS para tus tablas y comprobá que un usuario no pueda consultar ni modificar otro negocio. Las funciones invocadas por voz también validan el contexto confiable recibido. Nunca exponés credenciales privilegiadas al cliente ni desactivás RLS para resolver una integración.

`/business` incluye perfil, catálogo y proveedores. `/prospects` incluye búsqueda, resultados, evidencia, revisión e importación. Cada pantalla necesita estados loading, vacío, error y éxito. Mostrá teléfonos ausentes, inválidos o pendientes de revisión; no habilites la llamada por tener solamente un nombre.

Usá `DISCOVERY_MODE=mock|live` en servidor y mostrá el modo en UI. Los fixtures se construyen con los UUID compartidos de `src/fixtures/common.ts`, que mantiene Tomi. No edites ese archivo; pedí nuevas constantes si hacen falta.

## 8. Tickets por fase

| Fase | Tickets y aceptación |
|---|---|
| 09:00–09:45 | **VA-01:** implementar DTO v1, esquema y RLS definidos en el general; crear exports públicos con respuestas fixture. **Listo:** Bauti y Tomi pueden importar tus funciones y Nano conoce el formato de importación. |
| 09:45–11:00 | **VA-02:** perfil y catálogo persistentes. **VA-03:** búsqueda mock e importación al CRM. **Listo:** tras recargar siguen los datos y el recorrido integrado muestra contactos reales de la base. Probar acceso Firecrawl en paralelo. |
| 11:00–13:00 | **VA-04:** búsqueda/scrape REST con límites, evidencia, normalización y errores. **Listo:** resultados live o error explícito; jamás fixtures presentados como búsqueda real. |
| 13:00–15:00 | **VA-05:** proveedor y sus ajustes; contexto comercial consumido por voz y comercio. **Listo:** se puede demostrar venta y reposición usando los mismos productos y contactos acordados. |
| 15:00–16:30 | **VA-06:** deduplicación, RLS, reintentos y estados UI. **Listo:** pasan los casos relevantes de abajo. |
| 16:30–18:00 | **VA-07:** congelar contratos, preparar datos y ensayar. **Listo:** ambas historias funcionan y toda simulación queda identificada. |

## 9. Pruebas que importan

- Un resultado sin teléfono conserva evidencia y no queda listo para llamar.
- Un teléfono ambiguo no se presenta como E.164 validado.
- Reimportar el mismo candidato no duplica el contacto ni pierde sus roles.
- Dos búsquedas con el mismo negocio encontrado no multiplican candidatos equivalentes.
- Un proveedor no puede referenciar un contacto de otro negocio.
- Un fallo de Firecrawl produce error recuperable y permite reintentar sin resultados inventados.
- Precios decimales se convierten sin pérdida a enteros atómicos; valores inválidos se rechazan.
- Bauti recibe productos vigentes y Tomi obtiene ajustes del proveedor correcto.

## 10. Prompt para tu asistente de programación

> Leé `00_GENERAL.md` y `01_VALE.md`. Implementá únicamente el ticket VA que te indique. Respetá stack, DTO y firmas públicas. Editá solo business, discovery, sus páginas, rutas, contratos y fixtures; no modifiques configuración, contratos ajenos ni migraciones aplicadas. Importá CRM por su `server/public.ts`. Usá UUID, USDC atómico, contexto validado y RLS. No inventes teléfonos, interés comercial ni resultados externos. Mostrá mock/live. Primero indicá archivos a modificar y dependencias del ticket; después implementá y comprobá sus criterios. Si falta un contrato ajeno, describí el cambio al propietario y avanzá con el fixture acordado.


Los campos y envoltorios de respuesta se fijan en la sección 14 del general; implementar esos nombres exactos. `SupplierSettingsDTO` contiene contact_id, enabled, wallet_address y max_unit_amount_atomic; no guarda la clave privada de ningún proveedor.


## Configuración final para tu implementación

Aplicar sección 15 del general: Sur Insumos, tres productos del seed, Firecrawl REST v2, 5 candidatos/5 URLs máximo, concurrencia 2 y timeout 20 s. FitSignal y ProspectCandidateDTO tienen forma exacta en ese apartado. Implementar las instrucciones y DTO definidos; no abrir una elección de stack. El proveedor de demo es el UUID compartido y su tope unitario de compra es 1500000 atómicos. Mostrar la política de Tomi por API. Las tareas de la primera fase son programar schemas y fixtures v1 y configurar la clave Firecrawl.


## Adaptación al nicho y al jurado

Leer sección 16 del general. El comprador del software es la distribuidora; las cafeterías encontradas son sus posibles clientes. Configurar Sur Insumos con ese relato y conservar la evidencia de cada candidato. Encaje comercial y uso de stablecoins son hipótesis distintas.

VA-J01 añade al perfil opcional stablecoin_usage: already_uses, interested, not_used o unknown, con unknown como valor inicial. El dato se declara o valida; no se deduce automáticamente del sector. Señalar moneda operativa y aceptación de la contraparte sólo cuando exista ese dato, sin convertir el catálogo ni agregar FX.

El precio y stock de demo son ficticios. El guion muestra fuente, encaje y producto antes de llamar. No presentar como clientes nuestros a los negocios encontrados ni como prospectos interesados a todos los resultados de búsqueda. Completar primero integración/importación y después esta mejora compatible.


## Límite de presentación

La exposición total dura como máximo 120 segundos, incluyendo cualquier audio o demo. Leer [Objetivos, alcances y pitch](05_OBJETIVOS_ALCANCES_Y_PITCH.md). Los módulos completos se mantienen; el pitch muestra evidencia breve del recorrido y reserva el detalle técnico para preguntas si las hay.
