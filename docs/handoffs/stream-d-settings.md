# Stream D Settings Handoff

I implemented issue #18 / Tracer 15: a single-tenant settings document across
the Drizzle schema, store helper, authenticated REST API, iOS settings UI/cache,
and the iOS voice session start path. This slice only persists and reads the
audio/location/retention settings; it does not implement AudioStore, retention
enforcement, storage tiering, or AirPods PTT.

## What landed

Commits: none. I attempted the first requested logical commit with:

```sh
git add packages/db/src/schema.ts packages/db/src/index.ts packages/db/src/settings-store.ts packages/db/src/migrations/0006_settings_singleton.sql packages/db/test/settings-store.test.ts && git commit -m "feat(#18): add settings singleton store"
```

The sandbox blocked Git from creating
`/Users/williamgreen/Code/writer_os/.git/worktrees/writer_os-stream-d/index.lock`
because that parent repo is outside the writable roots. The working tree changes
are all left in place and uncommitted.

Files changed or added:

- `packages/db/src/schema.ts`
- `packages/db/src/migrations/0006_settings_singleton.sql`
- `packages/db/src/settings-store.ts`
- `packages/db/src/index.ts`
- `packages/db/test/settings-store.test.ts`
- `apps/api/src/routes/settings.ts`
- `apps/api/src/index.ts`
- `apps/api/test/settings.test.ts`
- `apps/ios/WriterOS/Settings.swift`
- `apps/ios/WriterOS/SettingsStore.swift`
- `apps/ios/WriterOS/APIClient.swift`
- `apps/ios/WriterOS/SettingsView.swift`
- `apps/ios/WriterOS/RootView.swift`
- `apps/ios/WriterOS/WriterOSApp.swift`
- `apps/ios/WriterOS/ChatView.swift`
- `apps/ios/WriterOS/VoiceSessionController.swift`
- `apps/ios/WriterOSTests/APIClientSettingsTests.swift`
- `apps/ios/WriterOSTests/VoiceSessionControllerTests.swift`

Test counts added:

- DB settings store: 4 tests added in `packages/db/test/settings-store.test.ts`
  (defaults, missing singleton recreation, partial update, idempotent update).
- API settings integration: 7 tests added in `apps/api/test/settings.test.ts`.
- iOS API client settings: 3 tests added in
  `apps/ios/WriterOSTests/APIClientSettingsTests.swift`.
- iOS voice controller: 2 tests added for session-start audio default behavior.

## Verification

What passed:

- `git diff --check`
- `pnpm ios:generate`
- `xcodebuild -project WriterOS.xcodeproj -scheme WriterOS -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/writeros-derived-data build-for-testing`

What did not run or failed due environment:

- `gh issue view 18 --comments` failed because the sandbox could not reach
  `api.github.com`.
- `pnpm install` failed on npm registry DNS:
  `getaddrinfo ENOTFOUND registry.npmjs.org`.
- `pnpm typecheck` failed because install did not complete and `turbo` was not
  present.
- `pnpm test` failed for the same `turbo: command not found` reason.
- `pnpm ios:test` failed after project generation because CoreSimulator is not
  reachable in the sandbox and no `iPhone 17` simulator destination is
  available. The generic simulator `build-for-testing` did compile.

## Non-obvious decisions

The `settings` table is a singleton row keyed by `id = 'singleton'` with a DB
check constraint. The migration seeds that row with audio capture off, hot/cold
retention at 30/365 days, and location tagging off.

The Drizzle schema and store use camelCase TypeScript properties backed by
snake_case columns. The REST route is the API boundary: it accepts and returns
camelCase JSON and delegates persistence to `createSettingsStore`.

`SettingsStore.update` is idempotent: if a patch repeats the current values, it
returns the current row without bumping `updatedAt`. Real changes update only
the editable fields and bump `updatedAt`.

The iOS settings cache is a `SettingsStore` `ObservableObject` injected at app
root. `RootView` loads settings once config is present, `SettingsView` patches
optimistically and reverts on failure, and `ChatView` reads the cached
`audioCaptureDefault` when the backend session is created.

I found the session start call site in `ChatView`; no `TODO(#18)` seam was left.
`VoiceSessionController.startSession(audioCaptureDefault:)` does nothing when
the default is false and starts the existing recognition path when true.

## Still owed

The reviewer needs to commit the changes from outside this sandbox or with a
writable Git dir. Suggested logical commits:

1. `feat(#18): add settings singleton store`
2. `feat(#18): add settings API`
3. `feat(#18): add iOS settings cache and client`
4. `feat(#18): add iOS settings screen`
5. `feat(#18): honor audio capture default on session start`

The reviewer also needs to rerun `pnpm install`, `pnpm typecheck`, `pnpm test`,
and the actual simulator `pnpm ios:test` on a machine/session with network,
workspace dependencies installed, and an available iPhone simulator.

## Open questions for the Queen

- Confirm that `audioCaptureDefault == true` should auto-start the existing
  speech-recognition path at session start. This matches the AC wording, but the
  issue also says the toggle remains declarative until AirPods PTT (#20).
- Confirm whether PATCH should reject unknown JSON keys. This implementation
  ignores unknown fields and validates only the supported settings fields.

## Cross-stream artifacts

Issue #21 / AudioStore should consume `settings.audio_retention_hot_days` and
`settings.audio_retention_cold_days` from the `settings` table or the
`GET /settings` API. This slice deliberately does not enforce retention.
