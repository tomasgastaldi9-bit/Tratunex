# BUY-03 Elegir el mejor proveedor y explicarlo — plan de implementación

> Para agentes: superpowers:subagent-driven-development. Una sola tarea. **Hay apuro: entregas a las 17:30.** Hacé lo pedido, bien y sin extras.

**Objetivo:** implementar `rankQuotes(ctx, { purchase_request_id, quotes })` (contrato en `src/contracts/purchases.ts`, sección BUY-03): ordenar con una regla fija, recomendar la primera que califica, calcular qué haría el agente al pagarla (`decidePurchasePolicy`) y explicar en 2-3 frases con Claude Haiku 5.5, con respaldo armado con reglas.

**Spec:** `src/features/agent/README.md` decisiones 17–19 (la regla de orden exacta está ahí) y el contrato. Ya están en la rama base.

## Global Constraints

- Tocá solo: `src/features/agent/server/ranking.ts` (+ `ranking.test.ts`), `src/features/agent/server/explain.ts` (+ `explain.test.ts`), `src/features/agent/server/purchase-service.ts` (+ su test) y `src/features/agent/server/public.ts` (reemplazar el esqueleto de `rankQuotes`, misma firma). Nada de `src/contracts/**`, `src/lib/**`, `package.json`. **Sin dependencias nuevas** (nada de `@anthropic-ai/sdk`: se usa `fetch`).
- Comentarios en español simple explicando el por qué. `Result<T>` siempre; `company_id` solo de `Ctx`; montos siempre texto entero con `BigInt` (nunca `number` con coma).
- Vitest no resuelve `@/`: imports con valor relativos en archivos que importa un test. Nunca llames a la API real en tests: mockeá `fetch` (inyectalo como parámetro).
- No corras `next dev`/`next build`. `node_modules` ya enlazado en tu worktree. No commitees `node_modules`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `.superpowers/`.
- Commit `feat(TRA-69): …` terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push.

---

### Task 1: ranking + explicación + rankQuotes

**`ranking.ts` (puro, probado):** `rankQuotesByRules({ request, quotes, policy, today })` → `{ ranking: QuoteRank[], recommended_quote_id }`, con `today` como fecha `AAAA-MM-DD` inyectada (en el servidor: la fecha de hoy en `America/Argentina/Buenos_Aires`). Exactamente la regla de la decisión 18 del README:
- `total_atomic = unit_price_atomic × request.quantity` (BigInt); null si no hay precio.
- No califica (con un motivo en castellano por cada causa): sin precio ("No dio precio"); total > `budget_atomic` ("$ X supera el presupuesto de $ Y", con `formatPesos`); `accepts_argt === "no"` ("No acepta cobrar en ARGt"); `available_quantity !== null && < quantity` ("Tiene N de M"); `delivery_days !== null` y llega después de `needed_by` contando días desde `today` ("Entrega en N días y la necesitás en M").
- Califican: orden por total asc → plazo asc (null al final) → `accepts_argt` "yes" antes que "unknown" → origen call < web < example. Motivos positivos cortos ("El precio total más bajo", "Entrega en N días", "Acepta ARGt" / "No confirmó si acepta ARGt", "Cotización de prueba" si `origin === "example"`).
- Las que no califican van después, en el orden en que llegaron. `position` 1..N. `policy = decidePurchasePolicy(policy, total_atomic, supplier_contact_id)` para las que califican; null para las otras.
- `recommended_quote_id` = la primera que califica, o null.

**`explain.ts`:**
- `explainByRules(resumen)` → texto de 2-3 frases armado con reglas: si hay recomendada, "Recomiendo a {proveedor}: {motivos principales}. Total {formatPesos}." + el `reason` de su política; si no hay, "Ninguna cotización sirve para esta compra: {motivo principal de la mejor}." Siempre en castellano.
- `explainWithClaude(resumen, { apiKey, fetchImpl, timeoutMs = 8000 })` → `{ text, source: "ai" }` o `null` si no se pudo. Llamada:
  - `POST https://api.anthropic.com/v1/messages`, headers `content-type: application/json`, `x-api-key: <apiKey>`, `anthropic-version: 2026-10-21`.
  - Body: `{ model: "claude-haiku-5-5", max_tokens: 2000, output_config: { effort: "low" }, system: <instrucciones>, messages: [{ role: "user", content: <JSON del resumen> }] }`. **No mandes** `temperature`/`top_p`/`top_k`, ni `thinking` con `budget_tokens`, ni prefill.
  - Instrucciones del sistema (en castellano): sos el agente de compras de una pyme argentina; explicá al dueño en 2 o 3 frases, en castellano rioplatense y sin listas, por qué se recomienda esa cotización, qué regla de pago se aplica y si el agente paga solo o pide aprobación; usá SOLO los datos del JSON, no inventes precios, plazos ni proveedores; si no hay recomendada, explicá por qué ninguna sirve.
  - Respuesta: si `stop_reason === "refusal"` → null. Si no, juntá el texto de los bloques `type === "text"` (ignorá `thinking`); vacío → null.
  - `AbortController` con `timeoutMs`; cualquier error de red, status no 2xx o JSON raro → null (log con `console.error("[agent] …", status/código)` sin datos de la empresa ni la clave).
- `explainRanking(resumen, opciones)`: si hay `apiKey` intenta Claude; si devuelve null o no hay clave → `{ text: explainByRules(resumen), source: "rules" }`.
- El "resumen" que va a Claude: compra (producto, cantidad, fecha, presupuesto en pesos con `formatPesos`), la recomendada y hasta 3 primeras con total en pesos, plazo, acepta ARGt, origen, motivos y decisión de pago con su motivo. Nada de ids internos ni datos de la empresa más allá de eso.

**`purchase-service.ts`:** agregá `rankQuotes(ctx, input)`: valida `ctxSchema` + `rankQuotesInputSchema`; lee la compra con el lector existente de `getPurchaseRequest` (filtrando por `ctx.company_id`; no existe → `NOT_FOUND`); lee la política con el lector existente (si falla la lectura → `PROVIDER_UNAVAILABLE`); arma el ranking con `rankQuotesByRules` (hoy en hora de Argentina); explica con `explainRanking` (clave: `process.env.ANTHROPIC_API_KEY`, inyectable para tests; `fetch` inyectable); valida la salida con `rankQuotesOutputSchema`.

**`public.ts`:** `rankQuotes` con el cliente de lectura (`readOnlyCookies: true`).

**Pruebas:** `ranking.test.ts` con 3 cotizaciones de la demo (una más barata pero sin stock, una que no acepta ARGt, una que sirve) + cada causa de descarte + desempates + límite de fecha; `explain.test.ts` con `fetch` falso: éxito (toma solo bloques `text`, manda headers y body correctos, sin `temperature`), `refusal` → reglas, error 500 → reglas, timeout → reglas, sin clave → reglas sin llamar a `fetch`; `purchase-service.test.ts` para `rankQuotes` (NOT_FOUND, error de lectura de reglas, éxito con fuente "rules").

**Verificación:** `npx vitest run src/features/agent/server`, `npm run typecheck`, `npx eslint src/features/agent/server`.
