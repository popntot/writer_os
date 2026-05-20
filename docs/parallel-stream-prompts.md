# Parallel Stream Prompts — Writer OS

Human-readable index of the active parallel-streams-v2 iteration. The canonical prompts live alongside in `docs/streams/`; dispatches and job IDs are tracked in `docs/streams/_dispatch-log.md`; worker handoffs land in `docs/handoffs/`.

**Operator**: Will (popntot) · **Queen**: Claude Code · **Workers**: Codex CLI

---

## Iteration 3 — design-system rollout (2026-05-20)

Goal: lock the design system as a code-mappable contract (DS-1) and stand up the web visual reference oracle (DS-2). The three reskin streams (DS-3/4/5) wait until DS-1 lands so they can import the iOS primitive module DS-1 ships.

| Stream | Issue | Name | Class | Worktree | Job ID | PR |
|---|---|---|---|---|---|---|
| **A** | [#42](https://github.com/popntot/writer_os/issues/42) | DS-1: design system foundation (tokens, primitives, interface doc) | `[codex-able]` | _(main workspace — hybrid)_ | `task-mpee77eo-kja181` | [#48](https://github.com/popntot/writer_os/pull/48) (Queen-on-behalf, ready-for-human) |
| **B** | [#43](https://github.com/popntot/writer_os/issues/43) | DS-2: web visual reference playground (port HTML prototype to apps/web) | `[codex-able]` | `../writer_os-stream-b` | `task-mpeelomt-754egt` | [#49](https://github.com/popntot/writer_os/pull/49) (Queen-on-behalf, ready-for-human) |

**Coordination**
- Stream A merges first (PR #48).
- Stream B's PR (#49) holds at the merge gate until A is on `main`; at merge time, B's token names get a grep-diff against A's `docs/interfaces/design-system.md` (per #43 AC).
- DS-3 (#44), DS-4 (#45), DS-5 (#46) deferred to **Iteration 4** — they reskin existing iOS views using A's primitive module, so they cannot start until A is merged.

**Iteration 3 finalization notes**
Both Codex workers hit Codex-sandbox limitations on closeout — Stream A's branch creation (`.git/refs/heads/tracer/*` writes denied) and Stream B's commit (worktree `.git` metadata outside writable roots). Worker file output was complete and verified in each case; Queen executed the branch + commit + push + PR open from outside the sandbox using each worker's co-author attribution. See `_dispatch-log.md` "Iteration 3 outcomes" and "Lessons for next iteration" for the full characterization.

---

## Prior iterations

- **Iteration 2** (session 7, 2026-05-19): Stream B Inbox foundation (#11), Stream C TestFlight readiness (#22), Stream D Settings (#18). All landed. See `docs/handoffs/stream-{b,c,d}-*.md` for first-person worker reports.
- **Iteration 1** (session 7 first pass): documented in PR #39 (`docs/session-7-parallel-streams-v2`).
