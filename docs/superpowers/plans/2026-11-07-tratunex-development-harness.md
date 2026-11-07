# Tratunex Development Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a practical Linear and GitHub workflow for the four Tratunex contributors that prevents overlapping edits and keeps integration fast.

**Architecture:** Linear is the sole task tracker; GitHub remains the source for code, branches, pull requests, and review. Repository guidance and templates are added before application CI; Linear setup and repository settings are verified separately.

**Tech Stack:** Markdown, Git/GitHub, GitHub CLI/API, Linear. No application dependencies are added.

**Spec:** `docs/superpowers/specs/2026-11-07-tratunex-development-harness-design.md`; source contracts and ownership: `docs/brief/00_GENERAL.md`.

## Global Constraints

- The team is Vale (business/discovery), Bauti (voice/campaigns), Tomi (commerce/infrastructure), and Nano (CRM/follow-ups).
- The general brief's ownership, dependency, data, security, test, and contract rules remain authoritative.
- Keep the GitHub repository private. Branch protection returned HTTP 403 because the current plan does not support it for this private repository.
- Use the user-created Linear workspace `Tratunex` and existing team `Tratunex` (key `TRA`); do not create duplicates or another workspace.
- The Linear project `Tratunex MVP` and harness issue `TRA-5` already exist and are verified. Only Tomi is currently listed as a team member.
- Use existing Linear states (Backlog, Todo, In Progress, Done, Canceled); an open PR stays In Progress until merge because this team has no In Review state.
- Do not create empty CI jobs. Add application checks only after the Next.js scaffold defines their scripts.
- Do not guess GitHub logins for CODEOWNERS; none is needed for this harness.
- Do not add or run application tests for this documentation and configuration task.

## Review Focus

- An issue or PR changes files owned by another contributor without agreement; confirm each workflow template directs authors to the ownership map and owner.
- A contract change lacks review from a consumer; confirm the documented contract-change path includes consumer review.
- A PR claims tests or live integrations ran when only fixtures were used; confirm the PR template asks for exact commands/results and mock/live/testnet mode.
- A secret or real phone/wallet credential enters Git; confirm the ignore rules and contributor guidance cover local env files and secret-safe examples.
- CI references package scripts or required branch rules that do not exist; confirm guidance defers CI and explains the GitHub plan limitation.

---

### Task 1: Add repository workflow and contributor instructions

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `CONTRIBUTING.md`
- Create: `docs/DEVELOPMENT_WORKFLOW.md`
- Create: `docs/templates/linear-issue.md`
- Create: `.github/pull_request_template.md`
- Create: `.editorconfig`
- Create: `.gitattributes`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: ownership and architecture contracts from `docs/brief/00_GENERAL.md`.
- Produces: one documented Linear → branch → PR lifecycle, concise instructions for agents and Claude Code, a human contributor guide, reusable issue and PR templates, consistent editor/line-ending defaults, and ignores for planned Node/Next.js artifacts and `.env*` except `.env.example`.

- [x] **Step 1: Write the project-wide `AGENTS.md`** with a pointer to the general brief and workflow, a requirement to check Git status before edits, the owner-boundary rule, and the no-secrets/no-fake-live-evidence rules.
- [x] **Step 2: Write `CLAUDE.md`** as the Claude Code entry point, explicitly directing it to follow `AGENTS.md` and the canonical workflow instead of duplicating project rules.
- [x] **Step 3: Write `CONTRIBUTING.md`** as a short human guide to setup, Linear task flow, branches, PRs, review, and verification, linking to the detailed workflow.
- [x] **Step 4: Write `docs/DEVELOPMENT_WORKFLOW.md`** with Linear as task source of truth, required issue fields, one issue/owner/branch/PR, branch naming from the actual Linear ID, Conventional Commit prefixes, small PR and reviewer requirements, shared-file ownership, contract changes, migration coordination, and per-PR completion evidence.
- [x] **Step 5: Add reusable templates**: the Linear template asks for outcome, acceptance criteria, owner, affected files/domain, dependencies, and verification; the PR template asks for the Linear ID, summary, files/domains, exact checks/results, integration mode, and unresolved risks.
- [x] **Step 6: Extend `.gitignore`** for Node/Next.js outputs, test reports, and local env files while explicitly allowing `.env.example`.
- [x] **Step 7: Add `.editorconfig` and `.gitattributes`** with UTF-8, final newline, LF normalization, and editor-neutral indentation settings suitable for the TypeScript/JSON/Markdown project.
- [x] **Step 8: Review the documents against the five Review Focus items**, validate all relative links to the brief, then run `git diff --check`.
- [x] **Step 9: Commit the repository guidance** with focused `docs:` commits (`285f2e3`, `1aa9c0b`).

### Task 2: Set up the Linear project and initial issue

**Files:**
- External: workspace `Tratunex` and team `Tratunex` (key `TRA`), already created by the user and verified.
- External: Linear project `Tratunex MVP` associated with the GitHub repository.
- External: one issue `TRA-5` for this harness, assigned to Tomi, in In Progress.
- External: domain labels for business/discovery, voice, commerce, and CRM.

**Interfaces:**
- Consumes: `docs/templates/linear-issue.md` and `docs/DEVELOPMENT_WORKFLOW.md`.
- Produces: verified workspace/team/project identifiers and URLs, a real issue key for the implementation PR, and the minimum useful domain labels. Do not create cycles or invite users whose Linear identities are unknown.

- [x] **Step 1: Verify the `Tratunex` workspace and team**. The user created the workspace; the team exists with key `TRA`.
- [x] **Step 2: Create a single `Tratunex MVP` project** in the team and link the GitHub repository.
- [x] **Step 3: Create domain labels** for business/discovery, voice, commerce, and CRM; keep the existing states and do not add a cycle.
- [x] **Step 4: Create the harness issue `TRA-5`**, assign it to Tomi, set it In Progress, and use it for the branch and PR.
- [x] **Step 5: Check workspace membership**; only Tomi is currently listed. Do not invite GitHub usernames as if they were confirmed Linear accounts.

### Task 3: Align GitHub integration defaults

**Files:**
- External: GitHub repository settings for `tomasgastaldi9-bit/Tratunex`.

**Interfaces:**
- Consumes: PR-first workflow in `docs/DEVELOPMENT_WORKFLOW.md`.
- Produces: squash merge enabled as the single merge method and automatic deletion of merged branches; repository remains private and `main` remains the default branch.

- [x] **Step 1: Re-read current repository settings** immediately before editing; confirm owner, name, privacy, default branch, and merge options.
- [x] **Step 2: Configure squash-only merge and delete-branch-on-merge** using the GitHub API, without changing visibility or default branch.
- [x] **Step 3: Read the settings back** and confirm all requested values. Do not attempt branch protection again; the recorded plan limitation still applies.

### Task 4: Integrate the harness change through the new workflow

**Files:**
- The repository guidance and templates from Task 1.
- Linear harness issue from Task 2.

**Interfaces:**
- Consumes: verified Linear issue ID and the current `origin/main`.
- Produces: focused feature branch and GitHub pull request linked to the Linear issue.

- [x] **Step 1: Create a branch from current `origin/main`** using `docs/TRA-5-development-harness`.
- [x] **Step 2: Apply and inspect only the Task 1 changes**; leave the approved brief and product code untouched.
- [x] **Step 3: Validate** relative Markdown links, secret-ignore exceptions, owner rules, and `git diff --check`; report exact results rather than claiming application tests.
- [x] **Step 4: Commit, push the feature branch, and open PR #1** using `.github/pull_request_template.md`, with Linear issue `TRA-5` linked.
- [x] **Step 5: Leave PR #1 ready for a teammate's review**; the author must not self-approve. The PR is open and not a draft; merge remains pending independent review.

### Deferred: application CI

After the Next.js scaffold lands and stable package scripts exist, add GitHub Actions checks for clean install, lint, typecheck, Vitest, and build. Add Playwright and database integration only when they can run reproducibly with safe test credentials. Do not mark nonexistent checks as required.

## Execution Order

Tasks 1–4 are complete for the planned deliverable: Linear has the verified workspace/team/project/labels and issue `TRA-5`; GitHub settings are configured; the repository workflow is implemented on `docs/TRA-5-development-harness`; PR #1 is open and linked to `TRA-5`. Keep the issue In Progress until PR #1 is independently reviewed and merged. The Linear workspace currently has only Tomi as a member; the other three need confirmed Linear accounts before they can be invited.

## Self-Review

- **Spec coverage:** Includes agent, Claude Code, and human contributor entry points; Linear task source of truth and the selected workspace/team/project; Git/PR practices; review pairs; sole-editor rules; contract/migration coordination; secret and mock/live evidence handling; CI deferral; and the GitHub plan limitation.
- **Step scan:** Each task names its deliverable and verification. No application code or tests are included.
- **Type/interface consistency:** Branch name and PR link use the issue ID created in Task 2; Task 4 consumes Task 1 templates and Task 2's verified issue.
- **Review Focus:** Each risk is checked in Task 1 and rechecked during Task 4 validation.
- **Proportion:** The plan adds only the repository guidance, Linear setup, GitHub defaults, and a linked PR needed for the approved harness.
