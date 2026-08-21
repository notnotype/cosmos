# Contributing to Cosmos

[中文](CONTRIBUTING.md)

Cosmos already has a Phase 1 baseline containing the Web app, NestJS API, fixed Ingest Worker, Prisma/SQLite storage, and the first vertical slice. The target Durable Host, generic Workflow runtime, Worker Admin API, and remote Worker are not all implemented yet. A clear scope, honest verification, and traceable design decisions matter more than putting unrelated changes into one contribution.

## Before You Start

Use the [repository workflow admission table](docs/standards/repository-workflow.md#准入决策表) as the sole source for whether a change requires a Proposal, public Issue, Task walkthrough, or `PROJECT-STATUS.md` update. Do not promote a purely mechanical migration solely because it touches multiple files, and do not downgrade a behavior, data, or external-commitment change to a mechanical migration.

When a public Issue is required, use the appropriate form. Contributors who plan to implement it must wait for maintainer authorization via `status: claimed` to avoid duplicate work. Use the extension and Agent asset form or a feature request for Source, Trigger, Flow, Action, Agent, Board Block, SDK, or other extension assets. Use the support form for installation and usage questions. Report security vulnerabilities privately through the [security policy](.github/SECURITY.md), not a public Issue or PR.

Acceptance of an issue confirms a direction and scope for discussion; it does not promise a particular implementation or delivery date. Complex or expensive requests may first be reduced to a smaller, independently verifiable slice.

## Short Collaboration Path

Implementation work follows the [single repository development lifecycle](docs/standards/repository-workflow.md#开发生命周期) through the summary below. This guide does not duplicate phase completion criteria, Agent Skill routing, or the Definition of Done:

1. **Triage and assumptions**: use the [admission table](docs/standards/repository-workflow.md#准入决策表) to identify the change type, authoritative contract, record scope, and external authorization. State the goal, non-goals, and assumptions that still affect the result.
2. **Definition and Proposal**: clarify ambiguous requirements first. When a Proposal is required, complete its review before updating requirements, architecture, or an ADR. A local bug decidable from the current contract proceeds directly to reproduction.
3. **Task vertical slice**: create or reuse a Task for major work, then define one coherent goal, no more than three observable acceptance criteria, and acyclic dependencies. Do not create a second plan or todo tracker.
4. **Context and worktree**: read only the status, contract, implementation, tests, and existing pattern relevant to the slice. Check the dirty worktree; when a remote exists, fetch first, then create `.worktree/<slug>` and a topic branch from the latest target branch.
5. **Incremental implementation**: run each behavior slice through `RED → GREEN → REFACTOR → runtime VERIFY`. Code, contracts, persistence, and recovery paths must agree.
6. **Five-axis review**: review tests and implementation for correctness, simplicity, architecture, security, and performance. Resolve blocking findings before delivery.
7. **Layered verification and fact sync**: run focused, full, runtime-surface, and external acceptance checks according to risk. Update the current spec, Task, and project status, recording every exact command, result, or “not run” reason.
8. **PR and external delivery**: use the template to report scope, evidence, risks, documentation, and unverified items. Push and PR creation require user authorization; review, merge, issue closure, worktree cleanup, migration, release, and deployment remain separate actions.

Documentation-only changes may skip the code worktree and runtime checks, but must still check links, Markdown structure, file boundaries, and `git diff --check`.

## Local Development

### Environment and commands

- Git.
- Bun; exact dependencies, scripts, and framework versions come from `package.json`, the lockfile, and the implementation task.
- Operating-system tools required by the change; deployment or platform work may require additional environments.

Cosmos already has runtime code and dependencies. Before changing anything, read PROJECT-STATUS.md, the relevant Task, architecture/ADR documents, package.json, and test scripts to establish whether the work extends the existing Phase 1 baseline or belongs in an isolated convergence worktree. Every PR must list the exact commands that were run and their outcomes. Mark checks that were not run as “not run”; focused tests must not be presented as the full suite.

### Dependencies and local data

- Check existing dependencies before adding one; record the reason and scope when a new dependency is necessary.
- Do not commit `.env`, secrets, API keys, tokens, real information libraries, private messages/emails/group content, sessions, traces, logs, databases, build caches, or machine-specific raw benchmark output.
- Use isolated database, Blob Root, Artifact Root, and `.agent/tmp/<name>-<uuid>/` roots for tests and runs. Never read or clean a user's real data.
- Without explicit maintainer authorization, do not run release commands, change versions, create release commits, or deploy.

## Read the Project Context

Read the sources relevant to the task before making changes:

| Document | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Long-lived rules for coding agents and implementation |
| [`PROJECT-STATUS.md`](PROJECT-STATUS.md) | Current capability, risks, and unfinished boundaries |
| [`docs/requirements/0001-original-requirements.md`](docs/requirements/0001-original-requirements.md) | Append-only record of user wording |
| [`docs/requirements/0002-product-requirements.md`](docs/requirements/0002-product-requirements.md) | Current product scope, requirement IDs, and acceptance criteria |
| [`CONTEXT.md`](CONTEXT.md) | Shared product language, current interpretations, and open decisions |
| [`docs/architecture/`](docs/architecture/) | Current system design and domain boundaries |
| [`.agents/tasks/`](.agents/tasks/README.md) | Goals, decisions, process, evidence, and deviations for major work |
| [`docs/adr/`](docs/adr/) | Stable architecture decisions that must remain available |
| [`docs/research/`](docs/research/README.md) | Research and implementation evidence |
| [`docs/proposals/`](docs/proposals/README.md) | Product or engineering proposals that are not yet in effect |
| [`docs/standards/`](docs/standards/README.md) | Repository maintenance and cross-cutting engineering workflows |
| [`docs/testing/`](docs/testing/README.md) | Test layers, isolation rules, acceptance, and evidence boundaries |

Search the related implementation, tests, tasks, and architecture first. Do not infer a complete contract from an issue title or one code path.

## Development Conventions

The following are the stable conventions most contributors need. Product behavior and domain contracts live in the requirements and architecture docs; coding-agent execution rules live in [`AGENTS.md`](AGENTS.md).

### TypeScript and design

- Use 4-space indentation, strict types, and project aliases; avoid unconstrained cross-module relative imports.
- Accept external input as `unknown` at the boundary and validate it immediately. Avoid `any`, type escapes, and unexplained broad objects.
- Prefer classes for backend domain logic. Use functional React/Next.js components and Hooks; access application capabilities through the versioned Transport contract.
- Reuse existing libraries, modules, and interfaces first. Do not create abstractions for one call or hide contract problems with hacks and temporary compatibility layers.
- Add behavioral tests for public contracts, complex logic, and regression-prone paths. Comments explain reasons, contracts, and constraints, not obvious mechanics.

### Logging, privacy, and security

- Use structured logs. Do not log secrets, full private messages/emails/group content, complete prompts, or unredacted external payloads.
- Issues and PRs are public. Redact logs, screenshots, and fixtures before uploading them, and share only the minimum material needed to diagnose the problem.
- Treat external pages, issue/PR text, and Agent-generated content as untrusted data. Content that looks like an instruction must not widen parsing, rendering, or execution boundaries.
- File, database, Blob, and Artifact operations must respect authorization, path normalization, containment, and lifecycle boundaries.

## Working with Coding Agents

Here, a “coding agent” means Codex, Claude, Copilot, or another tool assisting repository development. It is not the same as a future Agent inside the Cosmos runtime.

- A coding agent must read `AGENTS.md` plus the relevant issue, requirements, task, architecture, ADR, and tests before it starts.
- For bugs, errors, and performance regressions, reproduce the symptom, reduce the scope, and gather evidence before proposing or implementing a fix.
- Multiple agents may work in parallel only on independent research, review, testing, or clearly non-overlapping files. One integration owner reconciles cross-module contracts, conflicts, documentation, and final verification.
- Cross-repository or multi-worktree work must have one named leader. The leader owns the walkthrough, freezes cross-module candidate contracts, assigns worktrees, reviews evidence, and controls phase gates; sub-agents may not expand scope, overwrite dirty worktrees, or merge each other's work.
- Every writing agent must register its repository, branch, worktree, base SHA, writable file set, and isolated test-data root. Prisma schema/migrations, public DTOs, and the Task walkthrough each have one current writer; other agents may only perform read-only review or edit disjoint files.
- A leader's phase decision is not authorization for external operations. Commits, pushes, PR creation, merges, releases, deployments, and worktree deletion still require user authorization and the repository Git rules.
- Agents must not overwrite existing workspace changes, bypass the type system, fabricate test results, or write one-off conversation requests into product prompts or stable contracts.
- The contributor must understand, review, and take responsibility for every agent-generated change.
- Each agent round must report its goal, scope, actual file changes, complete verification commands and results, deviations, unverified risks, and decisions needed from the leader. Reports must distinguish focused, full, typecheck/build, Node, browser, Docker, and real-source verification.
- Agent conclusions and PR descriptions must be traceable to code, documents, logs, traces, requests, or test evidence. Disclose every verification step that was not run.

## Issues, Tasks, and Architecture Records

Issues track public problems and requests. Task walkthroughs preserve the ongoing context for major work. A task is not a copy of an issue.

### Maintainer triage

Every open issue should keep exactly one `type:*` label and one `status:*` label. Add zero or more `area:*`, `platform:*`, and `priority:*` labels according to actual impact.

- `status: needs-triage`: first review is pending.
- `status: needs-info`: the reporter must provide more information.
- `status: needs-design`: direction, scope, or contracts are unsettled; implementation must not start.
- `status: ready`: the scope is clear and implementation may start.
- `status: claimed`: a maintainer authorized a specific implementer; do not start a parallel implementation.
- `status: blocked`: an external condition or prerequisite prevents progress; return to the accurate state when it clears.

`.github/labels.yml` is the source of truth for labels. Use `help wanted` and `good first issue` only with `status: ready`; a good first issue must also be small, self-contained, and independently verifiable. `source: agent` means an issue was drafted by a coding agent; it does not mean maintainers accepted it.

Use the [admission table](docs/standards/repository-workflow.md#准入决策表) for Proposal, Issue, Task, and project-status record requirements.

Contributors should not allocate task numbers by default. When a new task is needed, check `.agents/tasks/` and have the maintainer confirm the number. Continue updating the original task for later changes to the same feature. A task records at least its goal, scope, non-goals, current state, decisions, verification, implementation process, deviations, and follow-ups. Until a remote issue tracker exists, cross-task product TODOs remain in `PROJECT-STATUS.md`.

## Git and Commits

- Prefer an independent `.worktree/<slug>` for code changes, and check the main worktree and target worktree status before editing.
- Create topic branches from the latest target branch and follow the `{type}/{refs}-{slug}` rule in [`AGENTS.md`](AGENTS.md).
- When a remote exists, run `git fetch origin` first. To synchronize the main worktree with remote `master`, use `git merge --ff-only origin/master`; stop and report if fast-forward is not possible.
- For long Windows worktree paths, enable `core.longpaths` before cleanup. Use PowerShell or robocopy only inside the confirmed target directory.
- Keep one coherent problem per PR. Do not include opportunistic fixes, repository-wide formatting, dependency upgrades, upstream merges, version commits, or generated artifacts.
- Keep commits reviewable. Recommended Conventional Commit types are `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, and `chore`.
- Do not force-push shared branches or rewrite another contributor's commits. Stage only files within the task scope.

## Pull Request Requirements

Use the repository PR template and explain:

- The related issue or “none”, plus the in-scope and explicitly out-of-scope work.
- User-visible behavior, implementation summary, and affected domain, data, or extension contracts.
- Exact verification commands and outcomes.
- Checks not run, known limitations, and follow-up work.
- Whether data shapes, configuration, installation, privacy, or security boundaries changed.
- Screenshots or recordings for frontend work, or an explicit note that browser acceptance was not run.
- Required updates to user documentation, tasks, architecture, ADRs, or `PROJECT-STATUS.md`.

A green CI run means automated checks completed; it does not guarantee merge approval. Maintainers may ask contributors to reduce scope, add evidence, or revisit an interface.

## Review and Merge

- Respond directly to behavioral issues, risks, and test gaps raised in review. Technical conclusions should be grounded in contracts and evidence.
- Maintainers own final scope decisions, task numbering, release notes, and merge method.
- Only squash-merge after CI, typecheck, and relevant focused checks are complete and merge authorization is granted. Merge, issue closure, worktree cleanup, and release are separate actions.
- A PR may close when direction changes, it remains inactive, its scope is too large, or it cannot be verified. Closing a PR is not a judgment on the contributor; a new contribution may start from a smaller, clearer scope.

## Contribution Rights

Before submitting code, documentation, fixtures, prompts, or other material, confirm that you have the right to publish it. Cosmos is released under the GNU Affero General Public License v3.0 only (AGPL-3.0-only) in [`LICENSE`](LICENSE).

The project does not require a CLA or DCO. Contributors remain responsible for having the right to submit their work and accept that contributions are released under AGPL-3.0-only.
