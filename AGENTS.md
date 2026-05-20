# Writer OS — Agent Substrate

This file is the shared context that every AI coding agent (Claude Code, Codex, etc.) reads before working on this repo.

## Project

Writer OS — voice-first thinking partner for writers. See [`docs/prd.md`](docs/prd.md) for the full PRD.

## Read before working on this repo

Order matters. Skip later items only when irrelevant to your task.

1. [`docs/prd.md`](docs/prd.md) — product requirements; source of truth for product specs.
2. [`docs/adr/`](docs/adr/) — locked architectural decisions:
   - [ADR-0001 Mentor neutrality (craft, not ideology)](docs/adr/0001-mentor-neutrality.md)
   - [ADR-0002 Pipelined voice stack over realtime voice APIs](docs/adr/0002-pipelined-voice-stack.md)
   - [ADR-0003 Cloud-first hybrid storage](docs/adr/0003-cloud-first-hybrid-storage.md)
   - [ADR-0004 One source of truth + interface projection](docs/adr/0004-source-of-truth-and-projection.md)
   - [ADR-0005 Subscription-funded local harness, not autonomous cloud execution](docs/adr/0005-subscription-funded-local-harness.md)
   - [ADR-0006 Agent-internal artifact craft (Pocock-derived moves)](docs/adr/0006-agent-internal-craft-moves.md)
3. [`docs/interfaces/`](docs/interfaces/) — locked module interfaces. Treat these as the API contract; do not alter signatures without a paired update to the doc.
   - [TrueLineStore](docs/interfaces/trueline-store.md)
   - [ConsolidationWorker](docs/interfaces/consolidation-worker.md)
   - [InboxTriageEngine](docs/interfaces/inbox-triage-engine.md)
   - [SourceIngestionPipeline](docs/interfaces/source-ingestion-pipeline.md)
4. [`docs/session-log.md`](docs/session-log.md) — what shipped, what's next. Reverse-chronological.
5. The issue you're working — `gh issue view <n> --comments`.

## Build harness

This repo runs a **local, subscription-funded parallel-planner-with-review** harness. Autonomous cloud execution is explicitly rejected — see [ADR-0005](docs/adr/0005-subscription-funded-local-harness.md).

- **Claude Code (Opus, high effort)** plans, reviews, and orchestrates. Runs on Will's Max subscription.
- **Codex CLI (GPT-5.4)** implements. Runs on Will's Plus subscription via the `codex` plugin.
- Both run on Will's Mac. Will is at the keyboard for every cycle — picks the issue, watches the pass, reviews the PR, merges. This is the steady state, not a stepping stone.

See [`docs/agents/harness.md`](docs/agents/harness.md) for the day-to-day usage pattern, escalation rules, and when to invoke `codex:rescue`.

## Agent skills

### Issue tracker

GitHub Issues at `popntot/writer_os` via the `gh` CLI. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context. `CONTEXT.md` and `docs/adr/` at repo root, both created lazily. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Conventions

### Branches

- Issue branches: `issue/<number>-<short-slug>` (e.g., `issue/4-backend-skeleton`)
- Feature branches without an issue: `feat/<short-slug>`
- Fix branches: `fix/<short-slug>`
- Never force-push to `main`.

### Commits

- Conventional Commits format: `<type>(<scope>): <subject>`
  - `type` ∈ `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`
  - `scope` is the affected package or area (optional)
  - subject is imperative ("add X", not "added X")
- Examples:
  - `feat(api): add InboxTriageEngine deposit endpoint`
  - `docs(prd): clarify out-of-sync detection rules`
  - `chore: update .gitignore for harness artifacts`
- Multi-line commits welcome. First line is summary; body explains *why*.

### Pull requests

- One PR per issue. PR title mirrors the conventional-commit summary; PR body links the issue (`Closes #<n>`).
- The PR description must enumerate which acceptance criteria from the issue are met. If any are deferred, list them explicitly under a `## Deferred` section.
- The PR must be **reviewed by Claude Code (Opus)** before merge unless escalated to a human (see "Escalation" below).
- Squash-merge default. Preserve the issue link in the squash commit body.

### Versioning

- `v0.1` = initial iOS MVP (passes the 4-walks-per-week-for-4-weeks success criterion in `docs/prd.md`)
- `v0.2` = Phase 1.5 web app shipped
- `v1.0` = productization-ready (multi-tenant, billing, public)
- Tag major milestones with `git tag` + push tags. Otherwise lightweight; no per-release versioning until productization.

### Code style

- TypeScript: strict mode, explicit return types on public APIs.
- Swift: SwiftUI defaults, no metaprogramming, conventional Apple idioms (this codegen target is more conservative than the language allows).
- Markdown: hard-wrap at 100 chars in code; soft-wrap in prose.
- Line endings: LF only (enforced via `.gitattributes`). Cross-machine consistency.
- Indentation: 2 spaces (4 for Swift), tabs in Makefile only. Enforced via `.editorconfig`.

### UI / styling

Visual style is locked to [`docs/interfaces/design-system.md`](docs/interfaces/design-system.md). All screens compose primitives from `apps/ios/WriterOS/DesignSystem/` and pass the §13 acceptance checklist before merge. Do not introduce ad-hoc colors, fonts, or spacing — extend the design system doc + primitives instead, in a paired PR.

### Deep modules

Every new module aims for [Ousterhout's deep-module principle](https://web.stanford.edu/~ouster/cgi-bin/aposd.php): small public interface, lots of hidden complexity, change-resistant. The four high-priority modules already have locked interfaces in [`docs/interfaces/`](docs/interfaces/). When implementing them, do not change the public signatures — if you find a real reason the locked interface is wrong, escalate to a human (label PR `ready-for-human`) rather than silently divergence.

For modules **not yet** locked (medium- and low-priority modules per PRD §"Modules"), perform a depth review at issue-claim time before implementation: write the interface to `docs/interfaces/<module-name>.md` mirroring the format of the four existing locks, surface decisions for review, then implement once approved.

Test the public interface; don't test internals.

### Test-as-success-criterion

PRs ship when their issue's listed tests are green. Codex agents shouldn't claim "done" without green tests. Reviewers (Claude Code or human) verify the test list matches the issue's acceptance criteria, then verify it passes.

### Escalation

Per [ADR-0005](docs/adr/0005-subscription-funded-local-harness.md), Will is at the keyboard for every cycle. Escalation has two tiers; the in-session tier is the default.

**In-session escalation (default).** When Claude Code hits a decision that needs Will — ambiguous AC, paid-key blocker about to bite, a locked interface that looks wrong, a schema decision spilling into unsliced modules — Claude Code surfaces it in chat:

1. State the decision in one sentence.
2. List 2–3 options with trade-offs.
3. Give a recommended answer.
4. Wait for Will. Do not guess and proceed.

No PR label, no formal `## Escalation` block — Will is in the conversation. The point is to keep his judgment in the loop without ceremony.

**Async escalation (reserved).** Only when Will has explicitly signaled "I'm stepping away, run as far as you can without me" — or the slice has reached an impossible-without-Will checkpoint (real-device verification, real-walk validation, paid-key provisioning) and Will isn't reachable in the same session:

1. Reach a safe checkpoint (tests green, branch pushed, PR open with WIP work).
2. Label the PR `ready-for-human`.
3. Write a `## Escalation` section in the PR description with: the decision, the 2–3 options + trade-offs, the recommendation.
4. Stop. Do not merge a `ready-for-human` PR without Will's explicit comment-approval.

Common reasons to escalate (either tier):

- Acceptance criteria are ambiguous or contradictory.
- Implementation requires a paid API key not yet provisioned.
- A locked module interface in `docs/interfaces/` looks wrong for the implementation reality.
- A schema decision affects multiple unsliced future modules.
- The slice's "demoable" criterion is impossible to test without Will (e.g. real-walk verification).

### Paid-key blockers

The build is sub-funded by default (Claude Max + Codex Plus). When a slice requires paid API access (Anthropic, OpenAI, ElevenLabs) or paid infrastructure (Cloudflare paid plan, Supabase Pro, Apple Developer enrollment), the slice cannot proceed until Will provisions the key. Behavior:

- Claude Code (the planner/reviewer) flags upcoming paid-key blockers in the session log and in conversation **before** the slice claims the key as a dependency.
- Codex (the implementer) does **not** attempt to circumvent missing keys with mocks or stubs that change the slice's surface area. If a slice's acceptance criteria requires a key Codex doesn't have, escalate per "Escalation" rather than proceed.
- Stubs are acceptable only when a slice **explicitly** scopes a stub (e.g. issue #11 ships Inbox with a stubbed triage LLM by design — that's a sliced decision, not a workaround).
