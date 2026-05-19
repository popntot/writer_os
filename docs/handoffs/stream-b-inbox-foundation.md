# Stream B Inbox Foundation Handoff

I tackled issue #11 / Tracer 8: the inbox foundation for text deposits, a
stubbed triage path, source-ingestion plumbing, API endpoints, and the iOS Dump
entry point. The slice keeps real LLM triage, non-text ingestion, and embedding
generation out of the critical path while proving the state machine against the
locked InboxTriageEngine interface.

## What Landed

Commits: none landed. I attempted the requested logical commits, starting with
`feat(#11): add inbox source embedding schema`, but the sandbox cannot write the
worktree git metadata:

`fatal: Unable to create '/Users/williamgreen/Code/writer_os/.git/worktrees/writer_os-stream-b/index.lock': Operation not permitted`

Files changed:

- `packages/db/src/schema.ts`, `packages/db/src/index.ts`
- `packages/db/src/migrations/0005_inbox_foundation.sql`
- `packages/db/src/migrations/meta/_journal.json`
- `packages/inbox/package.json`, `packages/inbox/tsconfig.json`,
  `packages/inbox/vitest.config.ts`
- `packages/inbox/src/index.ts`, `packages/inbox/src/source-ingestion.ts`
- `apps/api/package.json`, `pnpm-lock.yaml`
- `apps/api/src/index.ts`, `apps/api/src/routes/inbox.ts`
- `apps/api/test/inbox.test.ts`
- `apps/ios/WriterOS/APIClient.swift`, `apps/ios/WriterOS/RootView.swift`
- `apps/ios/WriterOS/InboxItem.swift`, `apps/ios/WriterOS/DumpView.swift`,
  `apps/ios/WriterOS/InboxView.swift`
- `apps/ios/WriterOSTests/APIClientInboxTests.swift`

Test counts:

- API tests before/after by source count: 38 -> 47 `test(...)` cases, with 9 new
  inbox integration tests in `apps/api/test/inbox.test.ts`.
- iOS XCTest run after: 28 tests passed, including 3 new inbox APIClient tests.
  That implies 25 existing tests plus the 3 new inbox tests.

## Verification

Succeeded:

- `xcodegen generate` from `apps/ios/`
- `xcodebuild test -project WriterOS.xcodeproj -scheme WriterOS -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5'`
  passed: 28 tests, 0 failures.

Blocked:

- `pnpm install` failed because this sandbox cannot resolve `registry.npmjs.org`
  (`ENOTFOUND` fetching packages such as `turbo-2.9.9.tgz`).
- `pnpm typecheck` failed because `node_modules` is missing and `turbo` is not
  installed locally.
- `pnpm test` failed for the same `turbo: command not found` reason.
- The exact requested iOS destination,
  `platform=iOS Simulator,name=iPhone 16 Pro,OS=18.0`, is not installed on this
  machine. Xcode listed only iOS 26.5 simulator devices.

## Non-Obvious Decisions

- The production migration creates `embeddings.embedding` as `vector(1536)` and
  adds an HNSW cosine index when pgvector is available. Inside PGlite or any
  database without the extension, the same migration falls back to a `text`
  embedding column so the current migration runner can still apply all SQL.
- The Drizzle schema keeps the embedding column as a `vector(1536)` custom type;
  the runtime fallback exists only in migration SQL because tests do not exercise
  vector operations.
- Text raw content is stored in `inbox_items.raw_content_ref` as an
  `inline-json:` ref. That preserves the deposited body across process restarts
  until real blob storage exists.
- Text source ingestion uses `cached_content_ref = inline:<sourceId>`, derives
  the title from `suppliedTitle` or the first non-empty line capped at 60 chars,
  and leaves `embedding_doc_ref` null.
- The default triage stub returns the most recently touched project by
  `coalesce(next_session_starter_updated_at, created_at)`, with confidence `0.5`
  and reasoning `"stub"`. With no projects, it returns `no-match`.
- `triageItem` does not create a `sources` row for proposed/no-match decisions.
  It persists the low-confidence decision, then `confirmDestination` runs the
  text ingestion path and files the resulting source. Auto-file decisions do run
  ingestion during triage because the locked decision shape requires a source id.
- API `InboxItem` responses include an additive `contentPreview` field so the
  iOS Pending view can render the required 80-character preview without
  decoding the raw-content ref.

## Still Owed

- Re-run `pnpm install`, `pnpm typecheck`, and `pnpm test` once npm registry
  access or a populated pnpm store is available.
- Commit the work in the requested logical passes from a context that can write
  the parent worktree git metadata.
- Optionally regenerate Drizzle snapshots with `pnpm db:generate` once
  dependencies are installed. I hand-authored the SQL migration because the
  package toolchain was unavailable.

## Open Questions For The Queen

- Should proposed/no-match triage create the `sources` row during `triageItem`
  to hew more closely to the SourceIngestionPipeline lock, or is the current
  confirm-time creation preferable for this stubbed slice and the required
  “confirm creates source” assertion?
- Is the conditional pgvector migration acceptable, or should the project split
  production pgvector DDL from PGlite test DDL more explicitly?
- Should `contentPreview` become part of an API projection contract, or stay an
  additive route-level convenience until shared API DTOs exist?

## Cross-Stream Artifacts

- `packages/db/src/schema.ts`: `inbox_items`, `sources`, and `embeddings` schema
  exports for downstream inbox, ingestion, and retrieval slices.
- `packages/db/src/migrations/0005_inbox_foundation.sql`: database migration with
  pgvector production shape and PGlite fallback.
- `packages/inbox/src/index.ts`: `createInboxTriageEngine` factory and locked
  interface implementation.
- `packages/inbox/src/source-ingestion.ts`: `createSourceIngestionPipeline`
  text-only implementation; unsupported content types throw
  `Error("content type not yet supported")`.
- `apps/api/src/routes/inbox.ts`: `/inbox` REST endpoints behind auth.
- `apps/ios/WriterOS/InboxView.swift` and `DumpView.swift`: simple iOS Dump and
  Pending flow for manual validation.
