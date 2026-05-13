# Build Harness — Local Claude Code + Codex CLI

This repo runs a **local, subscription-funded parallel-planner-with-review harness**. Will is at the keyboard to drive cycles. Autonomous cloud execution is **rejected, not deferred** — see [ADR-0005](../adr/0005-subscription-funded-local-harness.md) for the reasoning.

## Roles

Three distinct activities, not two. "Review" was previously overloaded; pinning the distinction so cost and process are legible.

| Activity | Tool | When it fires |
|---|---|---|
| **Plan** | Claude Code (Opus 4.7, high effort) | Reads issue, locked interfaces, relevant ADRs, recent session log. Writes the `codex:rescue` prompt: ACs, files to touch, tests that must pass. Surfaces paid-key blockers. |
| **Implement (first pass)** | Codex CLI (GPT-5.4) | **Always** the first writer. Claude Code does not implement before Codex has returned at least one diff. Codex's sandbox is netless — it writes code, the reviewer runs install/tests. |
| **Review** | Claude Code | Reads the diff against ACs; runs `pnpm install` (if deps changed) + `pnpm test` + `pnpm typecheck` (+ `xcodebuild test` for iOS). Three outcomes — see "Review outcomes" below. |

Both run on Will's Mac. The harness is local. Production API keys (Anthropic, OpenAI, ElevenLabs) are **only** used by the deployed Worker at runtime — they are not used by the dev harness itself.

### Review outcomes

After running tests and reading the diff, Claude Code picks one of three outcomes. The threshold for each is rule-based, not vibes:

1. **Pass** — tests green, diff matches ACs. Commit + push + open PR with `Closes #<n>` and the AC checklist.
2. **Small fix-forward** — Claude Code edits the branch directly. **Cap: ≤1 file substantively changed, or ≤~20 lines of net change.** Typing nits, lint, single-file logic tightening, an `?? null` for `exactOptionalPropertyTypes` — that scale of fix. Beyond the cap → re-prompt instead.
3. **Re-prompt Codex** — new `codex:rescue` with the specific failure listed. **Budget: 3 Codex passes per slice.** Pass 4 means the delegation prompt is the bug, not Codex. After 3 passes, Claude Code either:
   - **Takes over the remaining surface explicitly** — recorded in the session log as a "Claude took over after N Codex passes" note. This is the harness self-calibration signal: if a third of slices end this way, the delegation pattern is wrong, not Codex.
   - **Escalates** `ready-for-human` per AGENTS.md §"AFK escalation" if the blocker is a decision, not code.

The "Claude took over" event is a first-class line in the session log. It's the cheapest measurement of "is Codex pulling its weight in this codebase right now?"

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

When Codex returns a result that fails review, Claude Code's first move is to **fix forward in the same branch** per the three-outcome rule above (small fix-forward direct, larger fix-forward via re-prompt), not to escalate. Escalation is for decisions that need Will, not for code-quality issues.

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

Autonomous cloud execution (cloud Sandcastle or equivalent) is **not** on the cost ramp — rejected per [ADR-0005](../adr/0005-subscription-funded-local-harness.md), revisit only if the triggers in that ADR fire.

Claude Code surfaces upcoming paid-key blockers in the session log so Will has lead time to provision.

## What this harness does NOT do

- It does not run while Will is asleep / walking / away from keyboard.
- It does not pick up `ready-for-agent` issues automatically (no GitHub webhook / poller).
- It does not parallelize across issues without manual session multiplexing.
- It does not deploy code — `wrangler deploy` and TestFlight uploads are explicit Will actions.

These are all features of an autonomous cloud harness. That mode is **rejected**, not deferred — see [ADR-0005](../adr/0005-subscription-funded-local-harness.md). The local harness's actual value isn't "Will is away from keyboard" — it's "Claude and Codex split the keystroke load while Will keeps decision authority in real time."
