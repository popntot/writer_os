# Parallel Stream Prompts — Iteration 1

Generated: 2026-05-18.

Operator: Will. Queen: Claude Code (Opus 4.7). Workers: Codex CLI (one per worktree).

## This iteration's milestone

Land the in-flight merge train (#37 / #34 / #35), then kick off the next ready-for-agent slice (#11 inbox foundation) in parallel via Codex.

## Streams

### Stream A — Merge train [claude-native] [completed]

Land three open PRs onto `main` and reach the next ready state. No codex dispatch — this is a sequence of HITL/operator decisions.

- PR #37 (ADR-0005/0006 docs): merged as `5a73f93`.
- PR #34 (#8 voice loop): merged as `84bec32`. HITL demo deferred per operator decision; backend-tests-only merge.
- PR #35 (#9 ConsolidationWorker): rebased onto post-#34 main, conflict resolved in `apps/api/src/routes/sessions.ts` (streaming SSE + turn-pair persistence merged; `/end` rewritten to enqueue consolidation; new `/consolidation` GET + retry endpoints retained), merged as `922bae9`.

68 backend tests + 7 iOS test suites green at merge.

### Stream B — Inbox foundation [codex-able] [merged]

Issue #11 / Tracer 8. Inbox flow end-to-end with stubbed triage LLM, text source type, pgvector setup.

- Worktree: `../writer_os-stream-b` (torn down post-merge)
- Branch: `stream-b-inbox-foundation` (deleted)
- Job ID: `task-mpbwh9jk-75g673`
- Effort: `high`
- Prompt: `docs/streams/stream-b-inbox-foundation.prompt.md`
- Worker handoff: `docs/handoffs/stream-b-inbox-foundation.md`
- PR #38 merged as `2587803`. 77 backend tests + 28 iOS XCTests green at merge.

## Coordination notes

- Stream A produced the new `main` (922bae9) that Stream B branched from. Stream B does not touch any of Stream A's surface (no `sessions.ts`, no `consolidation/`, no TTS/voice code).
- Stream B is fenced to issue #11's tracer slice — does NOT advance the real LLM triage logic (#12), nor any non-text source types (#13/#14/#15).

## Next iteration candidates (post Stream B merge)

These were classified as codex-able but deferred this session to keep WIP bounded:

- **Stream C — TestFlight readiness** (#22). Privacy strings, Info.plist, ci script. Touches `apps/ios/*` only. Low coupling.
- **Stream D — Settings** (#18). Audio defaults, retention, location tag. Small API + iOS Settings view.

Post Stream B, also outstanding:
- **#10 — Real-walk smoke test (HITL GO/NO-GO).** Will only. Cannot be delegated. Gates Phase B → Phase C readiness.
- **#34 voice loop HITL demo.** Deferred this session — should be done before #10 since the smoke test relies on the voice path.
