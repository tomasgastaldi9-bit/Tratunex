# PLAT-01 Repository and Stack Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the documentation-only repository into a reproducible root-level Next.js application that all four contributors can install and deploy.

**Architecture:** Keep one npm application at the repository root. Use the brief's App Router and `src/` paths, strict TypeScript, server/browser Supabase client boundaries, and an explicit environment schema. Keep the layout minimal with Nano's confirmed agreement; do not add navigation or global styling.

**Tech Stack:** Node.js 24, npm, Next.js App Router, TypeScript, Tailwind CSS, Zod, `@supabase/ssr`, `@supabase/supabase-js`, ESLint, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-07-tratunex-platform-bootstrap-design.md` (PLAT-01 sections)

## Global Constraints

- Use Node.js 24 and npm; `npm ci` must work from a clean checkout.
- Pin dependency versions and commit `package-lock.json`.
- Keep `.env.local` ignored; `.env.example` contains variable names with empty values.
- Never expose Supabase secret keys in browser code or `NEXT_PUBLIC_` variables.
- Only modify Tomás-owned files plus the minimum `src/app/layout.tsx` agreed with Nano.
- The shared deployment URL is an acceptance item; do not report it complete without a successful Vercel deployment.
- Do not claim a deploy or integration without reproducible evidence.

## Review Focus

- Empty or malformed environment values must fail with a clear validation error before a server integration is used.
- Browser bundles must not import server-only keys or clients.
- A fresh Node 24 install must reproduce the committed package tree.
- The minimal root layout must not take ownership of Nano's navigation, shell, global CSS, or page.
- A Vercel URL must refer to an actual successful deployment of this repository.

---

### Task 1: Root application foundation, environment, and Supabase clients

**Files:**
- Create: `package.json`, `package-lock.json`, `.nvmrc`, `.npmrc`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `next-env.d.ts`, `eslint.config.mjs`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `src/app/layout.tsx` (minimum document wrapper only; Nano agreed)
- Create: `src/lib/env.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/env.test.ts`
- Create: `src/lib/supabase/clients.test.ts`

**Interfaces:**
- Produces root npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, and `test`.
- `test` runs Vitest and covers environment validation plus browser/server client construction.
- `getServerEnv(): ServerEnv` validates private server values only when requested.
- `getPublicEnv(): PublicEnv` returns only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`.
- `createBrowserSupabaseClient(env?)` returns a browser client using publishable values only.
- `createServerSupabaseClient(cookieStore, env?)` creates a request-scoped cookie-backed server client.

- [ ] **Step 1: Select and pin current compatible Node 24 / Next / React / Tailwind / TypeScript / Vitest versions** from current official docs; keep production and development dependencies separated.
- [ ] **Step 2: Add the minimal root-level Next.js App Router configuration and npm scripts**; set strict TypeScript and the `@/*` alias without introducing a monorepo.
- [ ] **Step 3: Write `src/lib/env.test.ts` first** for public env allowlisting, missing-value errors, and private server env parsing; do not write behavior in `env.ts` yet.
- [ ] **Step 4: Add a minimal `env.ts` function skeleton after the test exists, then run `npm test -- src/lib/env.test.ts`. Expected: assertions fail because the schema does not yet validate or allowlist values; the test runner loads successfully.**
- [ ] **Step 5: Implement Zod environment schemas** until the env tests pass; add `.env.example` from the brief with empty values only.
- [ ] **Step 6: Write failing `src/lib/supabase/clients.test.ts` cases** before client implementations. Use real Supabase client constructors with synthetic local values and an in-memory cookie store; assert browser and server clients use only public configuration.
- [ ] **Step 7: Add client-factory stubs and run `npm test -- src/lib/supabase/clients.test.ts`. Expected: assertion failures show the clients are not constructed with the configured public URL/key.**
- [ ] **Step 8: Implement browser/server client factories** using `@supabase/ssr`, passing async Next cookies only at the request boundary and never caching server clients globally; run both targeted test files and confirm they pass.
- [ ] **Step 9: Add Nano-approved `src/app/layout.tsx`** with only `<html>`, `<body>`, and metadata; leave `page.tsx`, navigation, global shell, and shared styles to Nano.
- [ ] **Step 10: Generate and commit the npm lockfile** with pinned dependencies; ensure `.env.local` and `.vercel/` remain ignored while `.env.example` is tracked.

### Task 2: Shared Vercel deployment

**Files:**
- Create locally only: `.vercel/project.json` if the Vercel integration links the project; keep `.vercel/` ignored and do not commit account metadata.
- Modify only if required and approved: Vercel project settings for the existing `tomasgastaldi9-bit/Tratunex` repository.

**Interfaces:**
- Produces a stable shared deployment URL and identifies it as preview or production accurately.

- [ ] **Step 1: Inspect the available Vercel teams/projects** and link the repo to the correct team. The current connected account reported zero projects for this repository.
- [ ] **Step 2: Configure only values already available and safe for the bootstrap**; leave provider secrets absent until supplied through the proper private channel.
- [ ] **Step 3: Deploy the current branch and inspect the deployment result.** If access or configuration is missing, stop and report the exact blocker; leave this acceptance criterion incomplete.

### Task 3: PLAT-01 verification and handoff

**Files:**
- Modify: `docs/DEVELOPMENT_WORKFLOW.md` only if the final required script/Node invocation needs a contributor-facing update.

- [ ] **Step 1: Run `npm ci` on Node.js 24** from a clean dependency state.
- [ ] **Step 2: Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`** and record each exact result.
- [ ] **Step 3: Confirm a fresh contributor can use `npm ci`** and record the actual Vercel deployment URL and environment if deploy succeeded.
- [ ] **Step 4: Commit the focused TRA-24 changes** with a Conventional Commit message; push the branch, open a PR linked to TRA-24, and request the workflow's cross-review from Bautista.
- [ ] **Step 5: Review the diff and checks internally, wait for cross-review, then squash-merge the PR.**
- [ ] **Step 6: After merge, fetch `origin` and begin TRA-25 on its own new branch from updated `origin/main`.**

---
