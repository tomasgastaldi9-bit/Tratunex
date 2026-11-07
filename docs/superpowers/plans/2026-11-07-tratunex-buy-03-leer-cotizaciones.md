# BUY-03 (2) Leer cotizaciones y puerto del comparador — plan

> superpowers:subagent-driven-development, una tarea. **Apuro: integración 16:30.** Hacé lo pedido, bien, sin extras.

**Spec:** `src/features/agent/README.md` decisiones 17–21 y `src/contracts/purchases.ts` (`rankQuotesInputSchema` con `quotes` opcional, `comparatorRankingSchema`, `RankSupplierQuotes`, `RULES_EXPLANATION_PREFIX`). En la rama base el typecheck falla en `purchase-service.ts` porque `quotes` ahora es opcional: arreglarlo es parte de la tarea.

## Global Constraints

- Tocá solo: `src/features/agent/server/purchase-service.ts` (+ test), `src/features/agent/server/quotes-source.ts` (+ `quotes-source.test.ts`, nuevo), `src/features/agent/server/ranking.ts` (+ test, solo si cambiás el texto "No dio precio" a "No dio precio en pesos") y `src/features/agent/server/public.ts`. Nada de `src/contracts/**`, otros módulos, migraciones ni `package.json`.
- Otros módulos solo por su `server/public.ts`: `listSupplierQuotes` de `@/features/voice/server/public` y `getContact` de `@/features/crm/server/public`. Inyectalos como dependencias en el servicio (para testear con falsos); el cableado real va en `public.ts`.
- Comentarios en español simple. `Result<T>`; `company_id` solo de `Ctx`; plata como texto entero con BigInt. Vitest no resuelve `@/` en imports con valor de archivos testeados. No corras `next dev`/`build`. Commit `feat(TRA-69): …` con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, sin push.

---

### Task 1: rankQuotes lee cotizaciones + rankSupplierQuotes

**`quotes-source.ts` (puro, probado):** `toQuoteForRanking(quote, supplierName)` desde el `ComparatorQuote` de Voz (tipo exportado en `src/features/voice/server/quote-import.ts`; importalo con `import type`): `quote_id = id`; `supplier_contact_id`; `supplier_name`; `unit_price_atomic` = si `unit_price?.currency === "ARS"` → `(BigInt(unit_price.amount_atomic) * 10n**16n).toString()` (centavos → unidades de ARGt de 18 decimales; escribilo sin literales `n` si el target de TS no los acepta: `BigInt(10) ** BigInt(16)`), si no → `null`; `available_quantity` = `0` si `can_supply === "no"`, si no el valor; `delivery_days = lead_time_days`; `accepts_argt`; `origin = source.kind`.

**`purchase-service.ts` → `rankQuotes`:** si `input.quotes` no viene: llama `listSupplierQuotes(ctx, { purchase_request_id })` (error → mismo error), 0 ítems → `NOT_FOUND` "Todavía no hay cotizaciones para esta compra.", más de `RANK_QUOTES_MAX` → `VALIDATION_ERROR` "Hay más de 20 cotizaciones; filtrá antes de comparar." Para cada proveedor distinto, `getContact(ctx, { contact_id })` → nombre `organization ?? name`; si falla, "Proveedor sin nombre" (no frena el ranking). Mapea con `toQuoteForRanking` y sigue igual que hoy. Si `quotes` viene, todo como hoy.

**`purchase-service.ts` → `rankSupplierQuotes(ctx, { purchase_request_id })`:** llama `rankQuotes` sin `quotes`; error → mismo error; `recommended_quote_id === null` → `NOT_FOUND` con el `explanation` como mensaje; si no, arma `{ ranking: ranking.map(r => ({ quote_id, reason })), recommended_quote_id, explanation }` donde `reason` = para las que califican `reasons.join(" · ")` + ` · ${POLICY_DECISION_LABELS[policy.decision]}` si hay `policy`; para las que no, `"No califica: " + reasons.join(" · ")`; `explanation` = el texto tal cual si `explanation_source === "ai"`, o `RULES_EXPLANATION_PREFIX + explanation` si es `"rules"`. Validá con `comparatorRankingSchema` (si no pasa → `PROVIDER_ERROR`).

**`public.ts`:** cablea las dependencias reales en el servicio de lectura y exporta `rankSupplierQuotes` (tipo `RankSupplierQuotes`).

**Pruebas:** mapeo (ARS 15050 centavos → `150500000000000000000`, USD → null, `can_supply: "no"` → 0, origen); `rankQuotes` sin `quotes` (llama a `listSupplierQuotes` con la compra, nombres de `getContact`, falla de `getContact` → "Proveedor sin nombre", 0 → NOT_FOUND, 21 → VALIDATION_ERROR, error de Voz propagado); `rankSupplierQuotes` (forma estricta válida, prefijo "sin IA", NOT_FOUND sin recomendada, error propagado). Las pruebas existentes tienen que seguir pasando.

**Verificación:** `npx vitest run src/features/agent/server`, `npm run typecheck`, `npx eslint src/features/agent/server`.
