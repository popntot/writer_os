# Parallel Streams v2 — Dispatch Log

Append-only log of every Codex worker dispatch, grouped by iteration. Job IDs map to the codex-companion runtime; resolve via `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" status <id>`.

---

## Iteration 3 — 2026-05-20 (design-system rollout begins)

Goal: ship the design-system foundation (DS-1) and draft the web reference playground (DS-2) in parallel. DS-3/4/5 deferred until DS-1 merges and the iOS primitive module exists for reskins to import.

- **Stream A (DS-1 / #42 — design system foundation)**: job-id `task-mpee77eo-kja181`, branch `tracer/ds-1-design-system-foundation`, **no worktree (runs in main workspace)**, effort `unset`. Hybrid — dispatched via `codex:rescue` before the parallel-streams-v2 iteration was cut; accepted as-is rather than restarted. Foundation slice; merges first.
- **Stream B (DS-2 / #43 — web visual reference playground)**: job-id `task-mpeelomt-754egt` (re-dispatched after `task-mpeeis69-7psbpd` failed at 0s on stale broker state from May 18 — fixed by deleting `state/writer_os-stream-b-*/` and re-running), branch `stream-b-ds-2-web-playground`, worktree `../writer_os-stream-b`, effort `high`. Drafts in parallel against the source style guide; final merge holds until Stream A is on `main` so token names can be re-grepped against `docs/interfaces/design-system.md`.

**Known risk for Stream B**: the May 18 dispatch on this same worktree (`task-mpbwh9jk-75g673`) failed to commit because the worktree's git metadata at `/Users/williamgreen/Code/writer_os/.git/worktrees/writer_os-stream-b/index.lock` lives outside Codex's sandbox write scope for the stream-b workspace. If this re-dispatch hits the same wall, the worker will land file changes but be unable to commit — Queen will then either (a) commit on the worker's behalf from the main worktree, or (b) propose a sandbox config fix to Will.

Deferred to next iteration (blocked on Stream A merge):
- DS-3 #44 — Today + Walk reskin
- DS-4 #45 — Close + System reskin
- DS-5 #46 — Inbox as Captured sub-surface

Operator: Will (popntot). Queen: Claude Code (Opus 4.7, 1M context). Workers: Codex CLI 0.130.0.

### Iteration 3 outcomes

**Stream A (DS-1 / #42)** — Codex worker `task-mpee77eo-kja181` finished in 13m 22s. All 4 deliverables implemented; `pnpm typecheck` and `xcodebuild build-for-testing` green. Sandbox blocked: iOS simulator test (no `iPhone 17` in sandbox), branch creation, commit, push, PR open (`.git/refs/heads/tracer/*` writes denied). Queen completed gates outside sandbox: `pnpm ios:test` → **45/0 passed** on iPhone 17 simulator, then branch + commit (worker co-author) + push + PR. **→ PR #48 open, `ready-for-human`.**

**Stream B (DS-2 / #43)** — Codex worker `task-mpeelomt-754egt` finished in 12m 17s. All files (10 files, 1,608 lines) implemented under `apps/web/`; handoff written inside the worktree at `docs/handoffs/stream-b-ds-2-web-playground.md`. Sandbox blocked: `git add`/commit (worktree `.git` metadata outside writable roots — Layer 2 confirmed as predicted), PR creation (no network), `pnpm typecheck` (turbo unavailable), browser preview. Worker self-verified locally: HTML/JS parse, CSS brace balance, no `console.*`, no framework deps added, WCAG AA contrast 9.64–18.18:1 across both tones. Queen completed gates outside sandbox: committed in stream-b worktree on the existing branch (worker co-author), pushed, opened PR. **→ PR #49 open, `ready-for-human`.**

**Token-naming-convention divergence surfaced** (not blocking): CSS uses kebab-case (`--ink-2`, `--page-muted`) while DS-1's Swift Tokens.swift and `docs/interfaces/design-system.md` use compact form (`ink2`, `pageMuted`). Semantic match, idiom-driven case divergence. Flagged in PR #49 body for operator decision (accept divergence, or open a follow-up rename pass).

### Iteration 3 closeout state

- DS-1: PR #48 (Queen-on-behalf, ready-for-human).
- DS-2: PR #49 (Queen-on-behalf, ready-for-human).
- Worktree `../writer_os-stream-b` **left intact** — teardown happens only after PR #49 merges (per v2 step 9).
- Stale-broker-state risk persists for next iteration: if a future stream reuses the path `writer_os-stream-b`, the new broker state dir starts fresh because this iteration's was purged in the recovery (Layer 1 fix). The stream-c and stream-d dirs from session 7 are still stale and would need the same recovery.
- DS-3 / DS-4 / DS-5 deferred to **Iteration 4**, dispatched once #48 merges (DS-1's iOS primitive module on `main`).

### Lessons for next iteration (operator-facing)

1. **Codex sandbox limitations are now well-characterized.** Workers can write to their own worktree's working tree but NOT to `.git/refs/heads/<dir>/`, NOT to other worktrees' paths, and NOT to git's internal lock files when the metadata lives outside their writable root. Expect Queen to close branch/commit/PR gates for every worker.
2. **Prompt errors to avoid.** I told Stream B to write its handoff at `/Users/williamgreen/Code/writer_os/docs/handoffs/...` (main worktree path). Codex correctly refused and wrote to its own worktree path instead — the right move. Future prompts: phrase handoff target as `docs/handoffs/<file>.md` (relative, resolves inside worker's worktree).
3. **iOS sim tests need to be run by Queen** because the sandbox lacks simulators. Bake this into the dispatch checklist.
4. **Stale broker state from prior iterations needs purging** before re-dispatching on the same worktree path. One-line fix: `rm -rf $CODEX_STATE/state/writer_os-stream-<letter>-*` before `git worktree add`.
