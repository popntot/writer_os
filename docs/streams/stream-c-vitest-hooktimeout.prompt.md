ROLE: Implementer for Stream C — vitest hookTimeout fix for PGlite cold-parallel flake.
WORKTREE: /Users/williamgreen/witer-os-git/writer_os-stream-c
BRANCH: stream-c-vitest-hooktimeout (already checked out by Queen)
BASE: main (commit a42170c)
ISSUE: popntot/writer_os#52

DELIVERABLE (one sentence):
Bump vitest `hookTimeout` (and optionally `testTimeout`) in every vitest config that exercises PGlite migrations so that `pnpm turbo run test --force` (cold cache, parallel) is deterministically green over 5 consecutive runs.

READ FIRST:
- Issue body for #52 (the diagnosis is well-documented there — re-derive nothing).
- apps/api/vitest.config.ts
- packages/db/vitest.config.ts
- packages/inbox/vitest.config.ts
- packages/llm/vitest.config.ts
- packages/tts/vitest.config.ts
- packages/consolidation/vitest.config.ts

WORK ITEMS:
1. For each vitest config above, decide whether it exercises PGlite migrations. The api + db + inbox configs almost certainly do; llm/tts/consolidation may not. For configs that do, add:
   ```ts
   test: {
     hookTimeout: 30_000,   // PGlite cold-cache parallel migration setup; default 10s flakes
     testTimeout: 15_000,
     // …existing config preserved
   }
   ```
   For configs that don't touch PGlite, leave alone (don't blanket-edit).
2. If a less-blunt fix is obvious AND low-complexity (e.g. shared PGlite instance via a global setup file, on-disk migration cache), prefer it. Document your call in the PR body. The blunt timeout bump is the acceptable baseline — only swap to something subtler if the diff is small and the win is clear.
3. Run `pnpm turbo run test --force` 5 times consecutively from a cold cache. Capture pass/fail count for each run. All 5 must be green.

DEFINITION OF DONE:
- `pnpm turbo run test --force` green over 5 consecutive cold-cache runs (capture timestamps + pass counts in PR body).
- No assertion-level test logic changed; only timeout config (or, if you went the shared-setup route, a new test/setup file referenced from vitest config — but no production code touched).
- `pnpm typecheck` green.
- Single logical commit: `fix(#52): bump vitest hookTimeout for PGlite cold-parallel flake`.

SANDBOX LESSONS (apply verbatim):
- The Codex sandbox CANNOT write to `.git/worktrees/<name>/index.lock`. DO NOT `git commit` / `git push` / `gh pr create`. Leave a clean working tree AND emit one `git format-patch`-shaped patch to `./_dispatch/stream-c-1-hooktimeout.patch`. Queen applies + opens PR outside sandbox.
- Write your handoff to `docs/handoffs/stream-c-vitest-hooktimeout.md` — the 5-run pass log goes here.
