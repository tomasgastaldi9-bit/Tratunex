# Tratunex platform bootstrap design

**Date:** 2026-11-07

**Linear issues:** [TRA-24 · PLAT-01](https://linear.app/tratunex/issue/TRA-24/plat-01-repo-y-stack-base), [TRA-25 · PLAT-02](https://linear.app/tratunex/issue/TRA-25/plat-02-contratos-comunes-e-idempotencia)
**Owner:** Tomás

## Intent

Turn the documentation-only repository into the shared application foundation the four Tratunex contributors can install and extend. Establish the stack and common contracts before the domain teams begin integrating their modules.

## Goals

- Deliver PLAT-01 as a focused pull request with a root-level Next.js App Router app, strict TypeScript, Tailwind, Zod, Supabase SSR clients, a pinned dependency tree, `.env.example`, and real `typecheck`, `lint`, and `test` scripts.
- Keep the installation flow reproducible with `npm ci` on Node.js 24.
- Prepare the Vercel project and a shared deployment URL when the correct account/project access and required non-secret configuration are available.
- Deliver PLAT-02 as a separate follow-up pull request with the common `Ctx`, `ActionCtx`, `Result<T>`, error codes, and a Postgres-backed idempotency boundary.
- Preserve company isolation, stable `action_id` behavior, and the rule that a mutation and its idempotency receipt commit or roll back together.

## Non-goals

- Implement login, company selection, RLS for business tables, prospecting, voice, CRM, or user-facing product screens beyond the minimum application entry point.
- Create or populate a shared Supabase project, use real provider credentials, or claim a production integration before the team accounts and evidence exist.
- Add a monorepo, a second package manager, or dependencies not required by the brief.

## Constraints

- The brief in `docs/BRIEF.md` is authoritative. Tomás owns root configuration, `src/lib/**`, `src/contracts/common.ts`, platform and discovery code, and shared migrations.
- Each issue gets its own branch and pull request. PLAT-02 starts from the updated `origin/main` after PLAT-01 is integrated.
- Dependency versions are pinned and `package-lock.json` is committed. No secrets or populated local environment files enter Git.
- The Supabase changelog now warns that tables are no longer automatically exposed to the Data and GraphQL APIs. Migrations must explicitly account for exposure and RLS; internal idempotency storage should not be granted through the Data API by default.
- Current Supabase SSR guidance uses `@supabase/ssr` with separate per-request server clients and a browser client; no service-role or secret key is exposed to browser code.

## Approaches considered

1. **Root-level app, sequential PRs — selected.** Add the Next.js scaffold at the repository root for PLAT-01, integrate it, then build common contracts and idempotency on the resulting `main` for PLAT-02. This matches the brief's root `package.json` ownership and keeps each Linear issue reviewable.
2. **App under `apps/web`.** This creates an unnecessary monorepo boundary before there is a second application, changes the install workflow, and conflicts with the brief's root package and lockfile.
3. **One combined PR.** This shortens elapsed time but bundles application scaffolding with a database transaction contract, making review and future ownership harder. It conflicts with the team's one-issue-per-branch workflow.

## Design

### PLAT-01: repository and stack

- Put the Next.js App Router and package metadata at the repository root. Use `src/app`, `src/lib`, and `src/contracts`; set TypeScript strict mode and the `@/*` import alias.
- Use the brief's Node.js 24, Next.js, Tailwind, Zod, Supabase JS/SSR, and Vitest stack. Pin installed versions and commit the npm lockfile. ESLint, TypeScript, and Vitest scripts must invoke the actual installed tools rather than placeholders.
- Include only the minimal app entry point and root layout needed to prove the scaffold builds; defer product shell, navigation, and shared UI to Nano's ownership.
- Add `.env.example` using the variable names in `docs/BRIEF.md` and empty values. Keep `.env.local` ignored.
- Add server and browser Supabase client construction in the owned `src/lib` area. Validate required environment variables server-side; use only publishable values in browser code. Defer auth flows and privileged clients until their owning issue.
- Connect Vercel to the existing public GitHub repository and produce a shared URL after a successful deployment; a preview URL is not described as production. The connected Vercel account currently returns no project linked to this repository, so this acceptance item remains pending until the correct team/project is available.
- Next.js requires a root layout. `src/app/layout.tsx` is assigned to Nano in the brief, so coordinate and get Nano's agreement before adding or changing that file. Keep the scaffold's layout minimal and leave shell/navigation/global styling to Nano.

### PLAT-02: common contracts and idempotency

- Define and export the brief's common TypeScript/Zod contracts in `src/contracts/common.ts`: `Ctx`, `ActionCtx`, `Result<T>`, and the exact `ErrorCode` union. Keep `company_id`, actor identity, and `action_id` server-established.
- Keep idempotency state in a migration-owned internal table keyed by company and action. Store the actor, operation, normalized request payload/fingerprint, and completed JSON result. Do not expose this table for direct client reads or writes.
- Make each database mutation an RPC/function transaction boundary: it validates the request and authorization context, claims or locks the action receipt, compares the same `action_id`'s normalized payload, performs the domain mutation, and stores the result before returning. PostgreSQL commits the mutation and receipt atomically. A matching replay returns the stored result; a different payload or actor for the same company/action returns `CONFLICT`.
- Do not implement this as two Supabase REST calls (write first, receipt second), because those calls cannot provide one transaction. Do not build an arbitrary SQL callback/dispatcher; future domain functions call a small shared database helper inside their own allowlisted mutation function.
- Do not include domain business tables or assume CRM/voice schemas. PLAT-02 supplies the contract and reusable persistence primitive; each future domain mutation integrates it in that domain's own SQL function.

## Acceptance evidence

- **TRA-24:** a clean checkout can complete `npm ci`; the actual scripts are available; a shared URL is recorded after an actual successful Vercel deployment. If account/project access blocks deployment, report TRA-24 as incomplete rather than treating the scaffold as full acceptance.
- **TRA-25:** include a small disposable-only mutation fixture that exercises the shared database helper; the same company/action and normalized payload returns the first result without a second mutation; reusing the action with a changed payload or actor returns `CONFLICT`; concurrent duplicate requests cannot both apply the mutation. This fixture must be isolated from production schemas and the checks must run only against a disposable/local Supabase database, never by resetting the shared database.

## Risks and open implementation details

- The Vercel connection currently finds no project associated with Tratunex. A successful URL requires the correct team/project access and deployment configuration; otherwise TRA-24 remains incomplete.
- The idempotency receipt's key scope and the SQL helper's authorization boundary must be confirmed against the actual PLAT-03 company membership schema before a hosted migration. Keep the helper internal and do not grant it to browser roles until membership authorization is enforceable. The implementation must not widen authorization to make the helper convenient.
- `src/app/layout.tsx` belongs to Nano. Obtain agreement before editing it; if that coordination is unavailable, leave TRA-24's required runnable App Router entry point pending.
- Keep PLAT-01 and PLAT-02 on distinct branches/PRs; merge the first before creating the second branch from fresh `origin/main`.

## Builder's discretion

Choose exact package patch versions from current official documentation when implementing; keep them pinned. Keep the scaffold intentionally small and use the team's existing paths/terminology. If PLAT-03 reveals that the proposed receipt key or authorization boundary needs a compatible adjustment, stop before applying a hosted migration and document the contract change for a consumer review.
