# PLAT-05 Implementation Plan

**Goal:** Search up to five prospects by sector and location, persist their source and show missing phones.

**Architecture:** Validate inputs and Firecrawl responses server-side; authorize company membership using the existing context. A single database RPC stores search, candidates and the idempotency receipt transactionally. The page uses existing shared components, displays mock/live mode, source links and explicit errors.

**Tech Stack:** Next.js, Zod, Supabase Postgres/RLS, Firecrawl search API, Vitest, Playwright.

**Spec:** docs/BRIEF.md sections 3, 5, 7–11; Linear TRA-28.

## Constraints and review focus
- Source and any extracted phone must be traceable; never fabricate missing values.
- Resolve identity and company on the server; RLS validates membership on every request.
- Limit searches to five candidates and validate all provider data and URLs.
- Keep provider failures explicit; mock data must be labeled and must never replace a failed live request.
- Persist a stable action ID and apply search and candidates atomically; reject conflicting reuse.

## Tasks
- [ ] Test and implement input validation and Firecrawl response parsing.
- [ ] Test and implement tenant-scoped idempotent storage and migration.
- [ ] Build authorized search service and `/prospects` interface.
- [ ] Run tests, lint, types, build, database and browser checks; review diff and release via PR.
