# Claude-Native / Operator-Native TODOs

Streams the operator (Will) handles directly — not dispatched to Codex workers because they require on-device action, taste-driven judgment, or HITL go/no-go gates.

## Iteration 2 — 2026-05-18

- [ ] **Stream A — Issue #34 iPhone HITL demo** (deferred from session 7). Tap PTT on a real iPhone, speak, hear Claude's reply via ElevenLabs TTS. Verifies the full SSE-streaming `/turn` + `AudioPlaybackEngine` + `SSEStreamConsumer` + `VoiceSessionController` path that was only mocked at session-7 merge time. If broken: fix-forward; if green: mark the AC in #34. **Should be done before Stream B (#10 smoke test) since the smoke test relies on this path.**
- [ ] **Stream B — Issue #10 Real-walk smoke test** (Phase B → Phase C GO/NO-GO gate). Will-only. Walk with AirPods, capture a thinking-out-loud session end-to-end (PTT → SSE turn → TTS playback → session end → consolidation → next session sees the delta). Outcome: GO unlocks Phase C work; NO-GO surfaces what to fix before Phase C. Gated behind Stream A passing.

## Closed (prior iterations)

### Iteration 1 — 2026-05-18 (session 7)
- [x] Merge train: PR #37, #34, #35 → main.
- [x] Stream B inbox foundation (#11) review + merge as PR #38.
