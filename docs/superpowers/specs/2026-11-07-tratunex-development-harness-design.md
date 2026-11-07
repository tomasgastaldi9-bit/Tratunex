# Tratunex Development Harness Design

## Intent

Give Vale, Bauti, Tomi, and Nano one low-friction way to plan work, edit in parallel, and integrate changes without conflicting over shared files or contracts. Linear will hold the work queue; GitHub will hold code, branches, pull requests, and review evidence.

## Goals

- Keep the owners, module boundaries, dependency direction, data rules, and contracts in `docs/brief/00_GENERAL.md` authoritative.
- Give every implementation task one owner, clear acceptance criteria, known dependencies, and a narrow file/module scope.
- Link every code change from one Linear issue to one short-lived Git branch and one pull request.
- Catch regressions with review and automated checks once the application exists, without adding empty CI jobs before it has a package manifest.
- Let the four contributors work in parallel while routing shared-file changes through their named owner.

## Non-goals

- Implement the product, install dependencies, or choose new runtime libraries.
- Rewrite the six approved brief documents or change their product, stack, contracts, or event schedule.
- Duplicate issue tracking between GitHub Issues and Linear.
- Expose the private repository to gain branch protection features.

## Approaches considered

1. **Progressive harness (selected).** Add concise repository instructions for Codex/agents and Claude Code, a human contributor guide, Linear issue/PR conventions, ownership boundaries, PR templates, and shared text-format settings now. Configure CI after the Next.js scaffold supplies real commands. This is usable immediately and avoids fake checks.
2. **Full automation before the application exists.** Add workflows and required checks now and configure every Linear state and cycle. This produces checks with no application commands to run and requires Linear access that currently needs reauthentication.
3. **Written conventions only.** Document Git and Linear practices but leave no repository templates or shared entry point. This is quick but makes the practices easy to miss and inconsistent across contributors.

The progressive harness is the best fit for a documentation-only repository that is about to begin implementation. The user created a dedicated Linear workspace named **Tratunex**. It already contains a team named **Tratunex** with key `TRA`; do not create duplicates. A project named **Tratunex MVP** is linked to the GitHub repository, and the harness task is `TRA-5`.

## Design

### Work tracking

- Linear is the single source of truth for tasks, ownership, blockers, and acceptance criteria. GitHub Issues are not used for duplicate work items.
- Use the existing `Tratunex` workspace and `Tratunex` team (key `TRA`). Use the `Tratunex MVP` project linked to the GitHub repository. Organize issues by the domains and ownership in the brief: business/discovery (Vale), voice/campaigns (Bauti), commerce/infrastructure (Tomi), and CRM/follow-ups (Nano).
- A Linear issue must state the user-visible or technical outcome, acceptance criteria, owner, affected domain/files, and any contract or migration dependency. Split cross-domain work into linked issues with one owning issue for each change.
- Keep one active implementation issue per contributor where practical. Blocked work stays visible in Linear with the blocker and next action recorded.
- Use the team's existing Linear states. The current workflow has Backlog, Todo, In Progress, Done, and Canceled but no In Review; keep the issue In Progress while its GitHub PR is open, then mark Done after merge.
- Reuse the brief's phase times only for the event day they describe; do not turn them into recurring cycles or calendar deadlines.

### Git and review

- `main` is the shared integration branch. Contributors create short-lived branches from the current `origin/main`, one branch per Linear issue: `feat/<LINEAR-ID>-slug`, `fix/<LINEAR-ID>-slug`, `docs/<LINEAR-ID>-slug`, or `chore/<LINEAR-ID>-slug`.
- Do not push directly to `main`. Open a pull request for every change, including documentation and configuration. Keep PRs focused and link the Linear issue identifier in the title or body.
- Use Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`); keep commits scoped and understandable. Prefer squash merging to keep the integration history readable, then delete the merged branch.
- Every PR describes the behavior/change, touched areas, checks run and their results, and any dependency or operational limitation. The author does not approve their own PR.
- `AGENTS.md` is the canonical agent instruction file. `CLAUDE.md` tells Claude Code to follow it; `CONTRIBUTING.md` gives human collaborators the same workflow without duplicating detailed rules.
- `.editorconfig` and `.gitattributes` standardize editor defaults and line endings to reduce formatting-only diffs across Windows and other environments.
- Use the brief's review pairs (Vale ↔ Nano; Bauti ↔ Tomi). A contract change also needs review from at least one consuming domain owner.
- Before starting, inspect `git status`, branch, and recent history. Before opening a PR, sync with current `origin/main`, resolve conflicts only in files you own, run checks relevant to the change, and inspect the final diff.

### Ownership and integration

- The file/module ownership table in the general brief is binding. A contributor may read another domain's code but must not edit it without agreement from its owner.
- Tomi remains sole editor for root configuration, package/lock files, auth, shared Supabase clients, common contracts/fixtures, and deployment. Nano owns the shared app shell, navigation, and common UI. Domain owners own their own feature folders, contracts, fixtures, routes, and tests.
- Do not introduce common barrels that force simultaneous edits. Consume a domain through its documented public service or contract.
- A proposed cross-domain contract change names the file, field/signature, reason, and consumers. The owner makes the compatible change and notifies consumers before dependent work is merged.
- Coordinate database changes through Tomi. Migrations are immutable after application; no shared database reset or migration rewrite as part of parallel development.
- Keep mock, browser voice, live voice, and testnet modes explicit. Never represent fixtures as external results or testnet funds as real money.

### Completion and automation

- A task is done when its Linear acceptance criteria are met, domain checks pass, errors/loading/empty states are handled where applicable, and docs/contracts are updated if behavior changed.
- The brief's test strategy remains authoritative: Vitest for domain rules and Playwright for end-to-end flows; use a real database integration check when correctness depends on transaction atomicity.
- After the Next.js scaffold defines stable package scripts, add a GitHub Actions pull-request workflow for clean install, lint, typecheck, Vitest, and build. Add Playwright/integration jobs only when their environment is reproducible and secrets are handled safely. No required check is invented before it exists.
- Keep secrets out of Git; `.env.example` contains names and empty values only. Do not commit credentials, real phone numbers, private keys, or wallet seeds.

## Constraints and known limits

- The current repository contains documentation only; application CI has no valid commands yet.
- GitHub API returned HTTP 403 when reading branch protection for this private repository, stating that the feature requires GitHub Pro or a public repository. Keep the repository private and treat pull-request-only integration as a team rule unless the plan changes.
- The new Linear workspace and team are verified. Only Tomi currently appears as a member; do not invite users until their Linear accounts are confirmed.
- Contributor-to-GitHub-login mapping beyond the repository owner has not been confirmed. Do not add CODEOWNERS entries based on guesses.

## Decisions left to the implementer

- Choose the least elaborate Linear states and labels that support the workflow above; avoid adding cycles until the team agrees on a cadence.
- Add CI when the scaffold and scripts are present, using the exact commands established by that scaffold.
- Keep branch names linked to the actual Linear issue key returned by Linear; do not assume a team identifier in advance.
