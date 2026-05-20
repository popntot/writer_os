# Dispatch log — parallel-streams-v2

Append-only. Each iteration: ISO timestamp, base commit, streams + job IDs + worktree paths + effort.

## Iteration 1 — 2026-05-20

Base: `293ece9` (main)

- Stream A (ds1-foundation, issue #42): job `task-mpegjruc-x7jipy`, worktree `../writer_os-stream-a`, branch `stream-a-ds1-foundation`, effort `high`
  - Completed 24m 43s. Review: pass. Merged into main as `213ebb2` (5 commits via `git am` from worker patches + handoff commit). Worktree + branch torn down.
- Stream B (real-llm-triage, issue #12): job `task-mpegjwzm-0jxnhw`, worktree `../writer_os-stream-b`, branch `stream-b-real-llm-triage`, effort `high`
  - Completed 10m 4s; review surfaced 10 TS errors in `tryEmbed` union narrowing (handoff flagged it as unverified risk).
  - **Resume**: job `task-mpeibk7h-dsvlhu` — fix-forward for tryEmbed narrowing. Completed 2m 5s. Typecheck green, 61/61 api tests green (one cold-run flake on PGlite hooks, deterministic on re-run).
  - Merged into main as `e502193` (5 commits via `git apply` + manual commits + handoff commit). Worktree + branch torn down.

### Lessons learned (apply to iteration 2 prompts)

- **Worker commits will fail every iteration** due to a sandbox permission on `.git/worktrees/<name>/index.lock`. Both workers in iter 1 hit it. Patch-write-only is now the documented default — bake into the prompt template at `~/.claude/skills/parallel-streams-v2/codex-prompt-template.md`.
- **Patch format isn't stable across worker runs.** First-run patches were mbox-format (`git am` works); resume-run patches were plain `git diff` (need `git apply` + manual commit). Prompt should request mbox specifically (`git format-patch`-shaped) or accept both and let Queen handle.
- **PGlite cold-parallel hook timeout** affects `projects.test.ts`, `inbox.test.ts > deposit text returns 201`, `settings.test.ts > GET /settings returns defaults` on first run. Vitest `hookTimeout` should be bumped from default 10s to ~20s. Separate follow-up issue.
