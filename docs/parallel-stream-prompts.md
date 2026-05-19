# Parallel Stream Prompts — Iteration 2

Generated: 2026-05-18 (session 8 prep — iter 1 archived at the bottom of this file).

Operator: Will. Queen: Claude Code (Opus 4.7). Workers: Codex CLI (one per worktree).

## This iteration's milestone

Land TestFlight build readiness (#22) and Settings (#18) via parallel Codex workers, while Will clears the two HITL gates that unblock Phase C (#34 device demo, then #10 real-walk smoke test).

## Streams

### Stream A — Issue #34 iPhone HITL demo [claude-native] [pending operator]

Tap PTT on a real iPhone, speak, hear Claude's reply via ElevenLabs TTS. Verifies the full SSE-streaming `/turn` + `AudioPlaybackEngine` + `SSEStreamConsumer` + `VoiceSessionController` path. Tracked in `docs/streams/_claude-native-todos.md`.

### Stream B — Issue #10 Real-walk smoke test [claude-native] [pending operator]

Phase B → Phase C GO/NO-GO. Walk + AirPods + full loop. Gated behind Stream A. Tracked in `docs/streams/_claude-native-todos.md`.

### Stream C — TestFlight build readiness (#22) [codex-able] [merged]

Privacy strings, default app icons + launch screen, finalized bundle id + version scheme, `scripts/ios-build.sh`, `pnpm ios:build` wired in root package.json.

- Worktree: `../writer_os-stream-c` (torn down post-merge)
- Branch: `stream-c-testflight-readiness` (deleted)
- Job ID: `task-mpc3hiai-xlj5kt` (6m 59s)
- Effort: `high`
- Prompt: `docs/streams/stream-c-testflight-readiness.prompt.md`
- Worker handoff: `docs/handoffs/stream-c-testflight-readiness.md`
- PR #40 squash-merged as `87e4c5c`. 47 backend tests + typecheck green at merge.

### Stream D — Settings (#18) [codex-able] [merged]

Singleton `settings` row + Drizzle store, `GET/PATCH /settings` with auth, iOS Settings screen, VoiceSessionController honors `audioCaptureDefault` on session start.

- Worktree: `../writer_os-stream-d` (torn down post-merge)
- Branch: `stream-d-settings` (deleted)
- Job ID: `task-mpc3hmsj-s1sn1u` (12m 42s)
- Effort: `high`
- Prompt: `docs/streams/stream-d-settings.prompt.md`
- Worker handoff: `docs/handoffs/stream-d-settings.md`
- PR #41 squash-merged as `57d177b`. 54 backend tests (47 → +7 settings) + 4 new db settings-store tests + typecheck green at merge. iOS XCTests deferred to Will (real-simulator run).

## Coordination notes

- **iOS pbxproj is gitignored** (`apps/ios/*.xcodeproj/` is in `.gitignore`; project is xcodegen-generated from `apps/ios/project.yml`). Zero pbxproj merge risk between C and D.
- **Conflict surface C↔D**: `apps/ios/project.yml` (C edits for privacy/version keys; D should not need to touch) and `apps/ios/README.md` (C adds a TestFlight section; D appends a brief Settings note). Both are line-level resolvable.
- **Stream C does not modify Swift**; Stream D adds new Swift files only (no edits to existing files except `VoiceSessionController.swift` and `RootView.swift` for nav wiring and audio-capture-default integration). No file overlap.
- **Stream A is upstream of Stream B** — A's demo must pass (or fix-forward) before B's smoke test runs.
- **Stream A↔D contention**: D modifies `VoiceSessionController.swift`. If A surfaces an audio bug requiring a `VoiceSessionController` fix, land A's fix on main first; D rebases. (A small surface; the audio-default branch and the SSE/playback branch are different code paths.)
- Neither C nor D depends on A/B completing. C/D can merge regardless of A/B outcome.

## Next iteration candidates (post Streams C/D merge)

- **Stream E — OutOfSyncDetector (#19)**. Backend 5-rule eval + iOS project-card chip. Bounded, codex-able. Held back this round to keep WIP at two codex streams.
- **Real LLM triage (#12)** — replaces #11's stubbed triage. Decision-heavy (two-tier confidence design, prompt shape). Probably claude-native; revisit after #10 GO clarifies what triage quality is needed.
- **Source types — PDF (#13), voice-memo (#14), URL (#15)**. All sit on inbox internals. Small individually; could be bundled later as a single codex stream once #12 lands the real triage.
- **PR #36 (Cursor Cloud draft)** — closed 2026-05-18 as abandoned.

---

# Archive — Iteration 1 (2026-05-18, session 7)

## Milestone

Land the in-flight merge train (#37 / #34 / #35), then kick off the next ready-for-agent slice (#11 inbox foundation) in parallel via Codex.

## Streams

### Stream A — Merge train [claude-native] [completed]

Land three open PRs onto `main` and reach the next ready state.

- PR #37 merged as `5a73f93`.
- PR #34 merged as `84bec32`. HITL demo deferred.
- PR #35 rebased and merged as `922bae9`.
- 68 backend + 7 iOS test suites green at merge.

### Stream B — Inbox foundation [codex-able] [merged]

Issue #11 / Tracer 8. Inbox flow end-to-end with stubbed triage LLM, text source type, pgvector setup.

- Worktree `../writer_os-stream-b` (torn down post-merge).
- Branch `stream-b-inbox-foundation` (deleted).
- Job ID: `task-mpbwh9jk-75g673`.
- PR #38 merged as `2587803`. 77 backend tests + 28 iOS XCTests green at merge.
