# BUY-01 y BUY-02 Compras y reglas de pago — plan de implementación

> Para agentes: se ejecuta con superpowers:subagent-driven-development. Cada tarea en su worktree y rama; el controlador integra en `feat/TRA-67-compras`. **Hay apuro (entregas 17:30): hacé lo pedido, bien y sin extras.**

**Objetivo:** que el dueño cargue "qué necesita comprar" en `/purchases/new` (BUY-01) y sus reglas de pago en `/agent/rules` (BUY-02), y que `checkPurchasePolicy` (la llama el pago de Tomás antes de firmar) decida paga solo / pide aprobación / rechaza con un motivo en español.

**Spec (fuente de verdad):** `src/features/agent/README.md` sección "Compras" (decisiones 12–16, tablas, funciones SQL, mapa de archivos) y el contrato `src/contracts/purchases.ts` (`decidePurchasePolicy` es LA regla; no la reescribas, usala). Ya están en la rama base.

## Global Constraints

- Tocá solo los archivos de tu tarea. No edites `src/contracts/**`, `src/components/ui/**`, `src/lib/**`, migraciones existentes, `package.json`. Sin dependencias nuevas.
- Si el contrato o el README no alcanzan, reportá `NEEDS_CONTEXT` (no los cambies).
- Comentarios en español simple explicando el por qué (la dueña está aprendiendo).
- `Result<T>` siempre; un error nunca es éxito; `company_id` solo de `Ctx`. Montos siempre texto entero (`amount_atomic`), nunca `number` con coma.
- Vitest no resuelve `@/`: en archivos que importa un test, imports con valor relativos.
- Tailwind lee comentarios: nada con forma de clase incompleta.
- No corras `next dev`/`next build`. `node_modules` ya enlazado en tu worktree. No commitees `node_modules`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `.superpowers/`.
- Copiá los patrones de AGT-01/02 que ya andan: SQL en `supabase/migrations/20261107164500_add_agent_knowledge.sql` (security definer, `claim_action`/`complete_action`, grants, mensajes); servidor en `src/features/agent/server/section-service.ts` + `save-errors.ts`; pantallas en `src/app/agent/profile/**`, `ProfileForm.tsx`, `profile-form-data.ts`, `AccessAlert.tsx` (contexto, `key={actionId}`, `action_id` por render y reglas de reintento, URL de éxito, estados).
- Commit en tu rama (`feat(TRA-67): …` o `feat(TRA-68): …`), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push.

---

### Task 1: Base de datos — `purchase_requests`, `purchase_policies` y funciones

**Archivos:** crear `supabase/migrations/20261107173000_add_purchases.sql` y `supabase/tests/database/purchases.test.sql`.

- Tablas, RLS y grants exactamente como el README ("Tablas"): lectura para miembros por `company_members`, sin escrituras directas, `anon` sin acceso. `numeric(78,0)` con check `> 0` en `budget_atomic` y `>= 0` en los de reglas; check `auto_pay_limit_atomic <= max_per_purchase_atomic`; `needed_by date`; `status` con check `in ('open')`.
- `create_purchase_request(p_company_id, p_action_id, p_request jsonb)`: security definer, search_path fijo. Sesión obligatoria (`FORBIDDEN: sign in required`), miembro de la empresa (cualquier rol) o `42501 FORBIDDEN`, valida el JSON (campos y tipos; montos como texto `^[0-9]+$`) con `VALIDATION_ERROR:`, `claim_action` con operación `'purchase.create_request'` y el JSON como payload; inserta y devuelve `{"purchase_request": {id, product, quantity, unit, needed_by (AAAA-MM-DD), budget_atomic (texto), zone, status, created_at, created_by}, "created": true}`; reintento → resultado guardado.
- `save_purchase_policy(p_company_id, p_action_id, p_policy jsonb)`: solo admin (`42501`), valida (montos texto, límite ≤ máximo, si `only_allowed_suppliers` entonces al menos un id, y todos los ids son contactos de ESA empresa en `public.contacts`, si no `VALIDATION_ERROR: unknown supplier`), `claim_action` `'purchase.save_policy'`, upsert por `company_id`, devuelve `{"policy": {...montos como texto...}}`.
- Grants: `revoke all … from public, anon`; `grant execute … to authenticated`.
- pgTAP (rollback, ids propios): miembro crea compra; reintento mismo `action_id` → mismo id sin duplicar; otros datos → `CONFLICT`; datos inválidos → `VALIDATION_ERROR`; otra empresa no ve ni crea; admin guarda reglas y las reemplaza; vendedor no puede (`42501`); límite > máximo → error; proveedor de otra empresa → `VALIDATION_ERROR: unknown supplier`; escrituras directas y `anon` → `42501`.
- Verificación: hay un Supabase local con todas las migraciones corriendo desde `/Users/valentinodonayo/hack-ba/tratunex-agt01-verify` (puertos 553xx). Copiá ahí tu migración y tu test, `npx --yes supabase@2.117.0 migration up --local --include-all`, `npx --yes supabase@2.117.0 test db --local`, y borrá las copias. No resetees esa base ni toques su `config.toml`. Pegá la salida.

---

### Task 2: Servidor — `purchase-service.ts`

**Archivos:** crear `src/features/agent/server/purchase-service.ts` (+ `purchase-service.test.ts`); modificar `src/features/agent/server/public.ts` (reemplazar los 5 esqueletos de compras, mismas firmas). Podés reusar `save-errors.ts` (y agregar casos si hace falta, sin cambiar los existentes).

- `createPurchaseService(getClient)` → `{ createPurchaseRequest, getPurchaseRequest, getPurchasePolicy, savePurchasePolicy, checkPurchasePolicy }` con los tipos del contrato.
- `createPurchaseRequest`: valida `actionCtxSchema` + `purchaseRequestInputSchema`, actor `user`, `rpc("create_purchase_request", { p_company_id, p_action_id, p_request })`, valida salida con `createPurchaseRequestOutputSchema`.
- `getPurchaseRequest`: lee `purchase_requests` por id **y** `company_id` del ctx; sin fila → `NOT_FOUND`; montos y fecha convertidos a texto `AAAA-MM-DD`/entero; valida con `purchaseRequestSchema`.
- `getPurchasePolicy`: lee la fila de la empresa (o null) + si es admin (`can_edit`) usando `company_members` del usuario de la sesión (RLS deja leer la propia membresía); `numeric` a texto.
- `savePurchasePolicy`: valida, actor `user`, `rpc("save_purchase_policy", …)`, traduce errores (incluido `VALIDATION_ERROR: unknown supplier` → "Uno de los proveedores elegidos no es de tu empresa. Recargá la página.").
- `checkPurchasePolicy(ctx, input)`: valida `ctxSchema` + `checkPurchasePolicyInputSchema`, lee la política con el mismo lector, y devuelve `decidePurchasePolicy(policy, amount_atomic, supplier_contact_id)` del contrato. Error al leer → `PROVIDER_UNAVAILABLE` (nunca "paga solo" por error).
- `public.ts`: lectura con `createRequestSupabaseClient({ readOnlyCookies: true })` para `get*` y `checkPurchasePolicy`; escritura con `createRequestSupabaseClient()`.
- Pruebas (cliente falso): cada rama, params exactos de cada rpc, `NOT_FOUND`, conversión de montos de la base (que llegan como número o texto) a texto, y que un error de lectura en `checkPurchasePolicy` NO devuelve `auto_pay`.
- Verificación: `npx vitest run src/features/agent/server`, `npm run typecheck`, `npx eslint src/features/agent/server`.

---

### Task 3: Pantallas — `/purchases/new` y `/agent/rules`

**Archivos:** crear `src/app/purchases/new/layout.tsx` (AppShell), `src/app/purchases/new/page.tsx`, `src/app/purchases/new/actions.ts`, `src/features/agent/components/PurchaseRequestForm.tsx`, `purchase-form-data.ts` (+ test); `src/app/agent/rules/page.tsx`, `src/app/agent/rules/actions.ts`, `src/features/agent/components/PolicyForm.tsx`, `policy-form-data.ts` (+ test); modificar `src/app/agent/page.tsx`.

**`/purchases/new`:** `PageHeader` "Nueva compra", "Contale al agente qué necesitás y él busca proveedores, pide cotizaciones y te recomienda el mejor.". Campos: `Input` "Qué necesitás comprar" (requerido), `Input type=number` "Cantidad" (requerido, entero ≥1) + `Input` "Unidad" (opcional, placeholder "unidades"), `Input type=date` "Para cuándo" (requerido, hint "Fecha límite de entrega."), `Input` "Presupuesto total" en pesos enteros (requerido, hint "En pesos. El agente paga en ARGt (1 ARGt ≈ 1 peso)."), `Input` "Zona de entrega" (opcional). Botón primary "Crear compra" (`loading` "Creando…"). Éxito: redirect a `/purchases/new?created=<id>` que muestra `Alert success` "Creamos la compra" + resumen (producto, cantidad, fecha, presupuesto con `formatPesos`) y el formulario vacío para otra. Errores por campo y generales como en el perfil. Sin contexto → `AccessAlert`. Cualquier miembro puede crear (no hay modo solo lectura).

**`/agent/rules`:** `PageHeader` "Reglas de pago", "Hasta dónde puede pagar el agente solo y a quién.". Estados como el perfil (`AccessAlert`, error de lectura, solo lectura para vendedor con aviso "Solo una persona admin puede cambiar las reglas de pago", éxito "Guardamos las reglas" + "El agente las usa desde el próximo pago."). Campos (pesos enteros, convertidos con `pesosToAtomic` al enviar): "Máximo por compra" y "El agente paga solo hasta" (hint "Arriba de este monto pide tu aprobación."); moneda fija mostrada como texto "Moneda de pago: ARGt"; interruptor/checkbox "Pagar solo a proveedores permitidos" y, si está activo, lista de casillas con los contactos del CRM (`listContacts` de `src/features/crm/server/public.ts`, solo lectura; mostrar `name` y `organization`; si no hay contactos, texto "Todavía no hay proveedores en el CRM." con link a `/contacts`). Debajo, bloque "Así decide el agente" con tres ejemplos calculados en vivo con `decidePurchasePolicy` del contrato (un monto bajo el límite, uno entre límite y máximo, uno arriba del máximo) mostrando `POLICY_DECISION_LABELS` con `Badge` (success / warning / danger) y el `reason`. Botón primary "Guardar reglas".

**`/agent`:** el `ProgressCard` pasa a dos pasos: "Perfil de empresa" (hecho si hay versión) y "Reglas de pago" (hecho si hay política; leela con `getPurchasePolicy`); la lista muestra "Perfil de empresa" (Abrir), "Reglas de pago" (Abrir → `/agent/rules`) y saca las filas de instrucciones, criterios y conocimiento (el brief v3 las esconde). Agregá en el `PageHeader` una acción primary "Nueva compra" → `/purchases/new`.

**Pruebas:** `purchase-form-data` (lectura de cantidad y pesos → `budget_atomic`, fecha, errores por campo) y `policy-form-data` (pesos → atomic, lista de ids, errores incluido el de límite > máximo).

**Verificación:** `npx vitest run src/features/agent/components`, `npm run typecheck`, `npx eslint src/app/agent src/app/purchases src/features/agent/components`.
