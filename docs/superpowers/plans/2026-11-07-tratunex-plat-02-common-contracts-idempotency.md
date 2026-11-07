# PLAT-02 Common Contracts and Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every domain the same validated server context/result contract and a PostgreSQL transaction primitive for idempotent mutations.

**Architecture:** Keep TypeScript/Zod contracts in `src/contracts/common.ts`. Store receipts in an internal, non-Data-API schema. Domain SQL mutation functions use shared claim/complete helpers within the same PostgreSQL transaction; the PLAT-02 proof fixture is disposable-only and never part of application data.

**Tech Stack:** TypeScript, Zod, Vitest, Supabase Postgres, SQL migrations, pgTAP, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-11-07-tratunex-platform-bootstrap-design.md` (PLAT-02 sections)

## Global Constraints

- Start this issue on its own branch from fresh `origin/main` after the PLAT-01 PR has merged.
- Preserve `company_id`, actor identity, and stable `action_id`; the server establishes the context.
- Use JSONB-normalized request content and a stored SHA-256 fingerprint; never store full potentially sensitive request payloads in receipts.
- A mutation and its receipt/result must commit or roll back in one database transaction.
- Keep internal receipt storage/functions unavailable to browser roles until PLAT-03 membership authorization is enforceable.
- Do not alter or reset a shared Supabase project; run database checks only on a disposable local database.
- Use the installed Supabase CLI's `migration new` command to create migration filenames; inspect commands with `--help` first.

## Review Focus

- Replaying the same company/action/actor/operation/payload returns the original JSON result and does not increment the fixture mutation twice.
- Reusing a company/action with a changed payload, actor, or operation returns a typed `CONFLICT` and applies no second change.
- Concurrent requests using the same action key cannot both execute the mutation.
- A mutation error rolls back both the business mutation and the in-progress receipt.
- Browser roles cannot access internal receipts or invoke internal helper functions directly.

---

### Task 1: Common TypeScript and Zod contracts

**Files:**
- Create: `src/contracts/common.ts`
- Create: `src/contracts/common.test.ts`

**Interfaces:**
- `Ctx = { company_id: string; actor_type: 'user' | 'voice' | 'system'; actor_id: string }`
- `ActionCtx = Ctx & { action_id: string }`
- `Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean } }`
- `ErrorCode` is exactly `VALIDATION_ERROR | NOT_FOUND | FORBIDDEN | CONFLICT | PROVIDER_ERROR | PROVIDER_UNAVAILABLE | RATE_LIMITED`.

- [ ] **Step 1: Add failing Vitest cases** for context parsing, non-empty action IDs, success/error result branches, and the exact error-code union.
- [ ] **Step 2: Implement the TypeScript types and Zod schemas** in `src/contracts/common.ts` without client or server imports.
- [ ] **Step 3: Run the targeted contract tests** and then `npm run typecheck`.
- [ ] **Step 4: Confirm a small consumer import example typechecks** from the public contract path.

### Task 2: Internal receipt schema and shared SQL helpers

**Files:**
- Create migration with `supabase migration new add_idempotent_action_receipts` after checking CLI availability and usage.
- Create: `supabase/tests/database/idempotent_actions.test.sql`

**Interfaces:**
- Internal receipt key: `(company_id, action_id)`; persist actor, operation, request fingerprint, result JSON, and timestamps.
- `app_private.claim_action(company_id, actor_type, actor_id, action_id, operation, request_payload)` returns whether the caller owns a new action or a completed cached result.
- `app_private.complete_action(company_id, action_id, result)` stores the JSON result for the current transaction.
- Internal helper behavior is transaction-scoped; exported domain mutation functions must call the helper, apply their own mutation, and complete the receipt before returning.

- [ ] **Step 1: Create a fresh Supabase local project scaffold** without linking or changing any hosted project; add only required local database configuration.
- [ ] **Step 2: Add a migration for a non-exposed `app_private.action_receipts` table** and required hashing support; grant no direct table or helper access to `anon` or `authenticated`.
- [ ] **Step 3: Add claim and completion functions** that normalize JSONB for fingerprinting, serialize concurrent uses of the same key, return cached results for matching calls, and raise a stable conflict outcome for changed actor/operation/payload.
- [ ] **Step 4: Add a disposable-only counter mutation fixture in the database test file** that calls claim, increments once, and stores the result in the same SQL transaction; keep the fixture out of production migrations.
- [ ] **Step 5: Add pgTAP assertions** for replay/no double increment, changed payload/actor/operation conflict, rollback on failure, and lack of direct browser-role access.
- [ ] **Step 6: Run `supabase test db` against the local disposable stack** and inspect `supabase db lint --help`; run lint if supported by the pinned CLI and local stack.
- [ ] **Step 7: Check authorization assumptions against PLAT-03's actual membership schema before any hosted migration or grant change.** Keep the internal helpers unavailable to app/browser roles until that contract exists.

### Task 3: PLAT-02 verification and handoff

**Files:**
- Modify: `docs/BRIEF.md` only if implementation reveals a compatible contract detail that needs to be recorded; otherwise leave the brief unchanged.

- [ ] **Step 1: Run `npm test`, `npm run typecheck`, and `supabase test db`** against local/disposable data; record commands and exact results.
- [ ] **Step 2: Review SQL for transaction boundaries, function privileges, RLS exposure, input hashing, and rollback behavior.**
- [ ] **Step 3: Commit only PLAT-02 files** with a Conventional Commit message; open a separate PR linked to TRA-25.
- [ ] **Step 4: Request Bautista's review and identify the consumer contract review needed from other domains.**
- [ ] **Step 5: Do not call TRA-25 complete until replay and conflict behavior are proven and the PR is merged.**

---
