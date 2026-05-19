ROLE: Implementer for Stream D — Settings (issue #18 / Tracer 15).
WORKTREE: /Users/williamgreen/Code/writer_os-stream-d
BRANCH: stream-d-settings (already checked out)
BASE: main (commit 2587803)

DELIVERABLE (one sentence):
Single-tenant settings store landing end-to-end: Drizzle schema + migration, `/settings` REST endpoints with auth, iOS Settings screen with toggles, and `VoiceSessionController` reading the audio-capture default on session start — no audio-storage logic, no retention enforcement (those land in #21 which reads from this doc).

READ FIRST (in order, in this worktree):
- The issue body for #18 (`gh issue view 18`) — the AC list is the contract.
- packages/db/src/schema.ts                                 (existing Drizzle patterns — match style)
- packages/db/src/trueline-store.ts                         (closest existing store — factory + retry shape if you need similar idempotency, though for single-row settings you can be simpler)
- packages/db/src/migrations/0005_inbox_foundation.sql      (most recent migration — observe naming + style)
- apps/api/src/routes/projects.ts                           (route style — validation, error shape, isRecord helper)
- apps/api/src/routes/sessions.ts                           (only to understand auth wiring + how the SSE/turn routes look; do NOT modify)
- apps/api/src/index.ts                                     (where to mount the new router + middleware)
- apps/api/src/middleware/auth.ts                           (auth pattern — apply identically)
- apps/ios/WriterOS/APIClient.swift                         (async/await + decoding pattern; add new methods here)
- apps/ios/WriterOS/RootView.swift                          (navigation entry — where to mount a Settings tab/screen)
- apps/ios/WriterOS/VoiceSessionController.swift            (where the audio-capture default needs to be honored on session start)
- apps/ios/WriterOSTests/APIClientSessionsTests.swift       (XCTest URLProtocolStub pattern — mirror it)
- AGENTS.md                                                 (commit conventions, conventional-commits format)
- docs/agents/harness.md                                    (review/dispatch conventions)
- docs/interfaces/                                          (skim — there is no settings interface doc; the issue AC is the contract)

WORK ITEMS:

1. **Schema + migration (`packages/db`)**
   - Add a single-row settings doc. Recommended shape: a `settings` table with a fixed PK (e.g. `id` text PK with a CHECK constraint that `id = 'singleton'`), one row only. Columns:
     - `id` text PK (always `'singleton'`).
     - `audio_capture_default` boolean NOT NULL DEFAULT false. (False until #20 lands AirPods PTT; flipping to true requires a runtime audio path, so default OFF is safe.)
     - `audio_retention_hot_days` integer NOT NULL DEFAULT 30.
     - `audio_retention_cold_days` integer NOT NULL DEFAULT 365.
     - `location_tag_default` boolean NOT NULL DEFAULT false. (Off by default per AC.)
     - `updated_at` timestamptz NOT NULL DEFAULT now().
   - Generate migration via `pnpm db:generate` (or hand-write following `0005_inbox_foundation.sql` style). Name follows `<idx>_<word>_<word>.sql` pattern. The migration should also `INSERT INTO settings (id, ...) VALUES ('singleton', ...) ON CONFLICT (id) DO NOTHING;` so the singleton always exists.
   - Drizzle schema entry in `packages/db/src/schema.ts`. Export the row type as `Settings` (and an `Insert` variant if Drizzle generates one for you) from `packages/db/src/index.ts`.

2. **Settings store helper (`packages/db`)**
   - Add `packages/db/src/settings-store.ts` exporting `createSettingsStore(db)` with two methods:
     - `read(): Promise<Settings>` — reads the singleton row. If it's somehow missing (shouldn't be, but defensive), inserts the defaults and returns them.
     - `update(patch: Partial<Settings>): Promise<Settings>` — accepts a partial of the user-editable fields (audio_capture_default, audio_retention_hot_days, audio_retention_cold_days, location_tag_default), updates the singleton row, bumps updated_at, returns the new state.
   - Re-export from `packages/db/src/index.ts`.
   - Add `packages/db/test/settings-store.test.ts` with vitest + PGlite. At least 3 tests: read returns defaults on fresh DB, update mutates only the patched fields, update is idempotent.

3. **API routes (`apps/api`)**
   - Create `apps/api/src/routes/settings.ts` exporting `createSettingsRouter(db)`. Mount at `/settings` under auth in `apps/api/src/index.ts`.
   - Endpoints:
     - `GET /settings`   → `Settings` JSON, 200.
     - `PATCH /settings` body: `{ audioCaptureDefault?: boolean, audioRetentionHotDays?: number, audioRetentionColdDays?: number, locationTagDefault?: boolean }` → updated `Settings`, 200. Validate: hot/cold day integers ≥ 0, hot ≤ cold (or hot ≤ 365). Use the same isRecord/error shape as `apps/api/src/routes/projects.ts`. 400 on invalid body, 400 on hot > cold.
   - Wire `app.use("/settings", authMiddleware); app.use("/settings/*", authMiddleware);` in `createApp` (mirror existing pattern).
   - Field naming: API uses camelCase (`audioCaptureDefault`); DB column is snake_case (`audio_capture_default`). Map at the route boundary or in the store — pick one boundary and be consistent.

4. **Integration tests (`apps/api/test/settings.test.ts`)**
   - Mirror `apps/api/test/inbox.test.ts` shape: PGlite handle, applyMigrations, fresh app per test.
   - Required cases (one test each):
     - `GET /settings` returns defaults on fresh DB.
     - `GET /settings` requires auth (401 without authMiddleware bypass).
     - `PATCH /settings` with `{ audioCaptureDefault: true }` updates only that field, returns updated row.
     - `PATCH /settings` with invalid body shape returns 400.
     - `PATCH /settings` with `audioRetentionHotDays > audioRetentionColdDays` returns 400.
     - `PATCH /settings` is idempotent (PATCHing the same value twice returns the same row both times).
     - GET after PATCH returns the patched state.

5. **iOS Settings screen + APIClient wiring (`apps/ios`)**
   - Add `apps/ios/WriterOS/Settings.swift` with a `Settings` struct matching the API JSON (camelCase, Codable).
   - Add `apps/ios/WriterOS/SettingsView.swift`: SwiftUI Form with:
     - Toggle: "Audio capture default" (bound to `audioCaptureDefault`).
     - Stepper or text field: "Audio retention — hot (days)" (default 30).
     - Stepper or text field: "Audio retention — cold (days)" (default 365).
     - Toggle: "Location tagging default" (bound to `locationTagDefault`).
   - On any change: PATCH to `/settings` with the new partial, update local @State on success. Show a small "Saving…" / "Saved" indicator. On failure: revert + show error.
   - Wire into navigation: add a Settings entry. The current root nav is in `RootView.swift` — either add a fourth tab (if there's a TabView) or add a toolbar gear button. Match the existing app's nav style; do not redesign.
   - Extend `apps/ios/WriterOS/APIClient.swift` with `getSettings()` and `updateSettings(patch:)`. Follow the existing async/await + decoding pattern.

6. **VoiceSessionController integration**
   - In `apps/ios/WriterOS/VoiceSessionController.swift`, before starting a session, fetch settings (via APIClient or cached) and respect `audioCaptureDefault`:
     - If `audioCaptureDefault == false`: do not begin audio capture at session start. (The user can still tap PTT to capture per-turn — the default applies only to the auto-on-start behavior.)
     - If `audioCaptureDefault == true`: behavior is unchanged from current.
   - Caching strategy: fetch settings once at app launch (in `WriterOSApp.swift` or `RootView.swift` `.task`), store in a small ObservableObject `SettingsStore` injected via `.environmentObject`. `VoiceSessionController` reads from this store. PATCHing from `SettingsView` updates the store optimistically.
   - If you cannot trace the exact "session start" call site cleanly, document the seam in your handoff and leave a `TODO(#18)` with a one-line description rather than guessing.

7. **iOS tests (`apps/ios/WriterOSTests`)**
   - Add `APIClientSettingsTests.swift` mirroring `APIClientSessionsTests.swift`. At least 3 tests: getSettings decodes correctly, updateSettings sends correct PATCH body, error response surfaces as a Swift error.
   - If `URLProtocolStub` exists in WriterOSTests, reuse it; otherwise mirror it from the inbox/sessions tests.

DEFINITION OF DONE:
- `pnpm install` from worktree root succeeds.
- `pnpm typecheck` is green across all workspace tasks.
- `pnpm test` is green across all workspace tasks. New tests: ≥3 db settings-store tests, ≥7 api settings integration tests.
- iOS: `pnpm ios:test` (or `xcodebuild test -project apps/ios/WriterOS.xcodeproj -scheme WriterOS -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest'`) succeeds with the new tests passing. (If simulator isn't available in the sandbox, document the failure mode in handoff; reviewer will run it.)
- AC items 1–6 from issue #18 are demonstrably addressed:
  - settings table (✓ Work Item 1)
  - GET/PATCH /settings (✓ Work Item 3)
  - audio capture default, retention defaults, location tag default fields (✓ Work Item 1)
  - iOS Settings screen with toggles (✓ Work Item 5)
  - VoiceSessionController respects audio-capture default on session start (✓ Work Item 6)
  - AudioStore note: AudioStore doesn't exist yet (#21 is unimplemented); your job is to make the `audio_retention_*` columns READABLE so #21 can consume them. No AudioStore code in this slice.
- One commit per logical pass: (a) schema + migration + store + db tests, (b) api routes + integration tests, (c) iOS APIClient + Settings model + SettingsStore env object, (d) iOS SettingsView + nav wiring + XCTests, (e) VoiceSessionController integration. Conventional Commits format, each referencing issue #18.

OUT OF SCOPE (do not touch):
- Any TestFlight / build infra: Info.plist privacy strings, app icons, launch screen, `scripts/ios-build.sh`, root `package.json` `ios:build` — those are Stream C's scope. Do NOT modify `apps/ios/project.yml` unless absolutely required for Settings (it almost certainly isn't — xcodegen picks up new Swift files under `apps/ios/WriterOS/` automatically). If you must modify `project.yml`, isolate the change to its own commit so it's easy to rebase.
- Audio storage tiering enforcement (#21). Just persist the values.
- AirPods PTT (#20). The audio-capture default toggle is purely declarative until #20 lands.
- OutOfSyncDetector (#19), source types (#13/#14/#15), real LLM triage (#12).
- `apps/api/src/routes/sessions.ts` (voice/SSE). VoiceSessionController integration is iOS-side only.
- `packages/consolidation`, `packages/inbox` — unrelated.
- Any change to existing migrations (only add a new one).

COORDINATION:
- Produces:
  - `settings` table + Drizzle schema entry + migration.
  - `createSettingsStore` in `packages/db`.
  - `/settings` REST endpoints (GET, PATCH) with auth.
  - iOS `Settings.swift` model, `SettingsView.swift`, `SettingsStore` ObservableObject, APIClient methods.
  - `VoiceSessionController` respects `audioCaptureDefault`.
- Consumes (already on main): `packages/db` Drizzle infra, `apps/api` auth/router patterns, iOS `APIClient` + nav.
- Cross-stream conflict surface with Stream C (TestFlight):
  - `apps/ios/project.yml` — Stream C edits this for privacy/version keys. You likely don't need to edit it; if you do (e.g. adding a Settings-related INFOPLIST_KEY), keep the edit in a separate commit so it's easy to rebase atop Stream C if Stream C merges first.
  - `apps/ios/README.md` — Stream C extends with TestFlight section; if you add a Settings README note, append at the end to avoid conflicts.
  - `apps/ios/WriterOS/*.swift` — Stream C does NOT modify Swift; you do. No conflict.
  - The Xcode pbxproj is gitignored.

CLOSEOUT (mandatory, do this last):
1. Run the DoD checks. If any fail and you can fix-forward in one pass, do so. If you can't, document the failure in the handoff and leave the work in place.
2. Commit your work with messages that name the work item (e.g. `feat(#18): settings table + singleton seed (Pass A)`).
3. Write `docs/handoffs/stream-d-settings.md` (overwrite if exists). First-person, functional tone, readable cold by a fresh agent. Cover:
   - What this stream tackled (one paragraph).
   - What landed: commits with SHAs, files with paths, test counts before/after.
   - What's still owed and why (in particular: any seam in VoiceSessionController where you left a TODO; whether iOS XCTests ran in the sandbox).
   - Non-obvious decisions: e.g. the singleton-row PK strategy, the camelCase/snake_case boundary choice, the SettingsStore cache lifecycle.
   - Open questions for the Queen (Claude Code reviewer).
   - Cross-stream artifacts produced (paths + intended consumer — e.g. that #21 will read `audio_retention_*` from the settings doc).
4. Exit. Do not open a PR yourself — the reviewer (Claude Code) opens the PR after running the review checklist against your handoff.
