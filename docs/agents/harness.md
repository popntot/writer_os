# Build Harness — Local Claude Code + Codex CLI

This repo runs a **local parallel-planner-with-review harness** at MVP. It is not a cloud AFK service. Will is at the keyboard to drive cycles. Cloud AFK is a Phase C decision deferred until after the real-walk smoke test gate (issue #10).

## Roles

| Role | Tool | Subscription | Responsibilities |
|---|---|---|---|
| Planner / Reviewer | Claude Code (Opus 4.7, high effort) | Claude Max | Reads issue, plans approach, drives the slice, reviews Codex output, opens / merges PRs, decides escalations. |
| Implementer | Codex CLI (GPT-5.4) | Codex Plus | Writes code per a tight scoped prompt; surfaces the diff. Codex's sandbox has no network, so the reviewer (Claude Code) handles `pnpm install` and test execution. |

Both run on Will's Mac. The harness is local. Production API keys (Anthropic, OpenAI, ElevenLabs) are **only** used by the deployed Worker at runtime — they are not used by the dev harness itself.

## Pre-flight (one-time per machine)

Verify Codex is ready:

```sh
node "$HOME/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs" setup --json
```

Expected: `"ready": true`, `"auth.loggedIn": true`. If not, run `codex login` once.

Optional: enable the stop-time review gate (recommended once a few cycles have run cleanly):

```
/codex:setup --enable-review-gate
```

This requires a fresh Codex review pass before the session ends, catching half-finished work.

## Normal cycle

For each issue:

1. **Will picks an issue from the `ready-for-agent` label list** — typically the lowest-numbered unblocked one.
2. **Claude Code plans:** reads the issue, the relevant locked interface(s) in `docs/interfaces/`, the relevant ADRs, the recent session log. Surfaces any concerns or paid-key blockers before delegation.
3. **Claude Code creates the issue branch:** `git checkout -b issue/<number>-<slug>`.
4. **Claude Code delegates to Codex via `codex:rescue`** with a tight prompt: the acceptance criteria, the locked interfaces involved, files to touch, and the test commands that must pass.
5. **Codex implements** — writes code and returns the diff. Codex's sandbox is netless: `pnpm install`, `xcodebuild`, and any test that needs network or installed dev-deps cannot run there. Codex may run static checks that work without install, but treat its run as a code-write only.
6. **Claude Code verifies and reviews** — runs `pnpm install` if dependencies changed, then `pnpm test` and `pnpm typecheck` (and `xcodebuild test` for iOS slices), and reads the diff against the acceptance criteria. If anything fails or any escalation trigger fires (see AGENTS.md §"AFK escalation"), Claude Code does NOT auto-merge — it labels the PR `ready-for-human` and stops, or fix-forwards in the same branch (see below).
7. **Claude Code commits** (Conventional Commits format), pushes the branch, opens a PR with `Closes #<n>` and the AC checklist mirrored from the issue.
8. **Will reviews and merges** the PR (or rejects with comments → back to step 4).
9. **Claude Code updates `docs/session-log.md`** with what shipped and the next pickup.

Steps 2–7 happen inside one Claude Code session. Cycles are sequential — one issue at a time per session — but Will can run multiple Claude Code sessions in different terminals to parallelize at the cost of his own attention bandwidth.

## When to invoke `codex:rescue`

`codex:rescue` is the primary delegation mechanism. Use it when:

- The slice's implementation is well-scoped and clear from the issue + interfaces.
- Tests exist or can be written deterministically.
- Claude Code can verify the result against acceptance criteria after the fact.

Do **not** invoke `codex:rescue` when:

- The slice requires a paid API key not yet provisioned. Escalate first.
- The slice involves architectural decisions not pinned in an ADR or interface lock. Plan first, escalate if the decision is non-trivial, then delegate.
- The slice is a HITL gate (e.g. #10 real-walk smoke test, #2 account provisioning, #23 ITC submission). Will does these.

## Escalation triggers

Per AGENTS.md §"AFK escalation," label the PR `ready-for-human` and stop instead of merging when any of these fire:

- Acceptance criteria are ambiguous or contradictory.
- Implementation requires a key not yet provisioned.
- A locked interface in `docs/interfaces/` looks wrong for implementation reality.
- A schema decision spills into modules not yet sliced.
- A slice's "demoable" criterion is impossible without Will (real-device verification, real-walk validation).

When Codex returns a result that fails review, Claude Code's first move is to **fix forward in the same branch** (re-prompt Codex, or take over directly), not to escalate. Escalation is for decisions that need Will, not for code-quality issues.

## Sandbox boundaries

Codex's sandbox has no network access. Concretely:

- `pnpm install` cannot run there → if the slice adds dependencies, Codex writes the `package.json` / `pnpm-lock.yaml` changes and the reviewer runs install.
- `xcodebuild test` cannot run there → iOS test verification is a reviewer task.
- Real-API integration tests cannot run there → mocked-SDK tests are the in-sandbox bound; live calls happen at reviewer time or in HITL.

When delegating with `codex:rescue`, give Codex the test commands the reviewer will run, but expect Codex to surface only the diff — not green test output.

## Workspace build dependencies (turbo vs pnpm filter)

When a slice adds a new workspace dependency (e.g. `apps/api` consumes a new `packages/*`), the dependency package must be built before the consuming package's tests can resolve it. `turbo.json`'s `dependsOn: ["^build"]` handles this for `pnpm test` (which goes through turbo), but **not** for `pnpm --filter @writer-os/api test`, which runs the consumer's test script directly without first running the dependency's build.

Practical rule: the first test run after adding a new workspace dep must be `pnpm test` (turbo). Subsequent filtered runs work because the dist artifacts are already on disk.

## Cost model

| Cost surface | Status |
|---|---|
| Dev harness (Claude Code planning + Codex implementing) | Sub-funded; ~$0/mo additional |
| Cloudflare Workers (`wrangler dev`) | Free tier through development |
| Supabase (`supabase start` local) | Free tier through development |
| Apple Developer | $99/yr fixed, required at slice #5 (first dev install) |
| Anthropic API (production Worker) | Pay-per-token; required at slice #6 (LLMClient). Recommended: prepay $50, auto-refill OFF. |
| ElevenLabs API (production TTS) | Pay-per-character; required at slice #8 (voice loop). Recommended: prepay $20, auto-refill OFF. |
| Cloud Sandcastle / true 24/7 AFK | Phase C only. ~$50–200/mo. Decided post-#10 GO. |

Claude Code surfaces upcoming paid-key blockers in the session log so Will has lead time to provision.

## What this harness does NOT do

- It does not run while Will is asleep / walking / away from keyboard.
- It does not pick up `ready-for-agent` issues automatically (no GitHub webhook / poller).
- It does not parallelize across issues without manual session multiplexing.
- It does not deploy code — `wrangler deploy` and TestFlight uploads are explicit Will actions.

These are all features of the deferred Phase C cloud harness. They are out of scope at MVP.
