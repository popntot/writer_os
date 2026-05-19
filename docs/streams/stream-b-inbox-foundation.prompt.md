ROLE: Implementer for Stream B — Inbox foundation (issue #11 / Tracer 8).
WORKTREE: /Users/williamgreen/Code/writer_os-stream-b
BRANCH: stream-b-inbox-foundation (already checked out)
BASE: main (commit 922bae9)

DELIVERABLE (one sentence):
Inbox flow standing up end-to-end with a stubbed triage LLM, the text source type, and pgvector setup — proving the state machine, deposit pathway, and source-ingestion plumbing all work without LLM dependency on the test's critical path.

READ FIRST (in order, in this worktree):
- docs/interfaces/inbox-triage-engine.md         (THE contract; do not deviate from method signatures or invariants)
- docs/interfaces/source-ingestion-pipeline.md   (the contract this slice implements for the `text` type only)
- packages/db/src/schema.ts                      (existing Drizzle schema patterns — match the style)
- packages/db/src/trueline-store.ts              (the closest existing store; mirror its factory + retry shape)
- packages/db/src/migrations/0004_flippant_blacklash.sql   (most recent migration; observe naming + style)
- packages/consolidation/src/index.ts            (most recent workspace package — mirror its layout)
- apps/api/src/routes/projects.ts                (the most recent route module; match its style)
- AGENTS.md                                      (commit conventions, conventional-commits format)
- docs/agents/harness.md                         (review/dispatch conventions)

WORK ITEMS:

1. **Schema + migrations (`packages/db`)**
   - Create `inbox_items` table per `inbox-triage-engine.md` `InboxItem` shape. Columns: id (uuid PK), raw_content_ref (text), content_type (enum: url|pdf|text|voice-memo|image|book-reference), capture_surface (enum), status (enum: captured|triage-failed|triaged-auto|triaged-pending|filed|stale), decision_kind (nullable enum), decision_project_id (nullable uuid FK projects), decision_source_id (nullable uuid FK sources), confidence (nullable real), agent_reasoning (nullable text), resolved_project_id (nullable uuid FK projects), source_id (nullable uuid FK sources), proposed_project_id (nullable uuid FK projects), deposited_at, triaged_at (nullable), filed_at (nullable), last_action_at. Add indexes on (status, last_action_at) and (status, deposited_at) for the sweep queries.
   - Create `sources` table per the issue AC: id (uuid PK), project_id (nullable uuid FK projects), type (text enum matching content_type), title (nullable text), original_uri (nullable text), cached_content_ref (nullable text), summary (nullable text), embedding_doc_ref (nullable text), first_seen_at, last_referenced_at.
   - Enable pgvector extension. Create `embeddings` table: id (uuid PK), source_chunk_id (text), project_id (nullable uuid FK projects), source_id (uuid FK sources), embedding (vector(1536)), content (text), created_at. Index the embedding column with ivfflat or hnsw — pick whichever your Drizzle pgvector helper supports cleanest.
   - Generate the migration via `pnpm db:generate` (or write the SQL by hand following the prior migrations' style). Name follows the existing `<idx>_<word>_<word>.sql` pattern.
   - Add Drizzle schema entries in `packages/db/src/schema.ts` for the new tables. Export from `packages/db/src/index.ts`.
   - PGlite test note: the existing test setup runs migrations via `runSql` in `applyMigrations()` (see `apps/api/test/sessions.test.ts`). pgvector may not load in PGlite — if it doesn't, the migration can `CREATE EXTENSION IF NOT EXISTS vector` and PGlite will skip it, but the `vector(1536)` column type may not work. **If PGlite chokes on the vector column, fall back to a plain `bytea` or `text` column for the embedding in the schema, document the deviation in your handoff, and keep the migration as the production shape.** The slice does not need real vector ops to pass.

2. **`packages/inbox` package — InboxTriageEngine**
   - New workspace package, mirroring `packages/consolidation` layout (package.json, tsconfig.json, vitest.config.ts, src/index.ts, test/).
   - Export `createInboxTriageEngine({ db, llm, ingestionPipeline })` returning the `InboxTriageEngine` interface from the locked contract.
   - The triage LLM call is STUBBED for this slice. The stub function (injected as `triageStub` or via a `triage` param on the factory) must return: `{ kind: "proposed", projectId: <id of most-recently-updated project>, confidence: 0.5, reasoning: "stub" }`. If no projects exist, return `{ kind: "no-match", reasoning: "no projects yet" }`.
   - Implement deposit, getItem, listPending, listAuditWindow, listStale, confirmDestination, recoverFromStale, triageItem, runAuditWindowSweep, runStaleSweep per the locked spec.
   - Idempotency: triageItem on a non-`captured` item returns the prior decision without LLM call. confirmDestination on already-filed-with-same-project is a no-op.
   - State transitions: ONLY the transitions listed in invariant 7 of the interface doc.

3. **`packages/inbox` — SourceIngestionPipeline (text content type only)**
   - Either as a separate file `packages/inbox/src/source-ingestion.ts` or inlined.
   - For text content: copy `body` into a `cached_content_ref` (use a deterministic blob ref scheme — e.g. `inline:<sourceId>` since we don't have Storage wired yet, OR a `cached_contents` table if cleaner). Set the source row's title from `suppliedTitle` if present, else derive a 60-char title from the first line. Embedding generation is OUT OF SCOPE for this slice — leave `embedding_doc_ref` null.
   - Other content types: stub-throw `Error("content type not yet supported")`. The interface should still accept them shape-wise.
   - Document the seam in your handoff.

4. **API routes (`apps/api`)**
   - Add `packages/inbox` as a workspace dependency in `apps/api/package.json`. Run `pnpm install` to wire it.
   - Wire `createInboxTriageEngine` and `createSourceIngestionPipeline` in `apps/api/src/index.ts` (similar to consolidationWorker wiring).
   - Create `apps/api/src/routes/inbox.ts` exporting `createInboxRouter(db, engine)`. Mount at `/inbox` under the auth middleware in `index.ts`.
   - Endpoints (all auth-protected):
     - `POST /inbox`             body: `{ rawContent: RawContent, captureSurface: CaptureSurface }` → `{ itemId, status }`, 201.
     - `GET /inbox/pending`      → `InboxItem[]` (status === "triaged-pending"). 200.
     - `POST /inbox/:id/confirm` body: `{ projectId: string }` → updated `InboxItem`, 200. 404 if item missing, 400 if projectId missing.
     - `GET /inbox/:id`          → `InboxItem`. 404 if missing.
   - Match the validation + error shape conventions from `apps/api/src/routes/projects.ts` and `apps/api/src/routes/sessions.ts` (isRecord helper, json error responses).
   - Auth uses the existing `authMiddleware` — wire `app.use("/inbox", authMiddleware); app.use("/inbox/*", authMiddleware);` in `createApp`.

5. **iOS in-app dump UI (`apps/ios`)**
   - Add a new tab or modal screen for "Dump". TextEditor + a submit button.
   - On submit: POST to `/inbox` with `{ rawContent: { type: "text", body: <textarea> }, captureSurface: "ios-app-dump" }` via the existing `APIClient` pattern.
   - Add a "Pending" list view that calls `GET /inbox/pending` and renders each item with: a short content preview (first 80 chars), the proposed project (resolved by ID lookup), a Confirm button. Tap Confirm → `POST /inbox/:id/confirm` with the proposed projectId. Refresh the list.
   - Extend `APIClient.swift` with `depositInbox(content:surface:)`, `listPendingInbox()`, `confirmInboxItem(_:projectId:)`. Follow the existing async/await + decoding pattern.
   - Add an `InboxView.swift` and `DumpView.swift`. Wire them into the existing navigation.
   - Add XCTests for the new APIClient methods at the same depth as `APIClientSessionsTests`. Use the existing URLProtocolStub pattern if it exists; otherwise mirror it from `APIClientSessionsTests`.

6. **Integration tests (`apps/api/test/inbox.test.ts`)**
   - Mirror the structure of `apps/api/test/sessions.test.ts`. Use PGlite handle, applyMigrations, build a fresh app per test.
   - Required test cases (one test each, named after the assertion):
     - deposit text returns 201 and itemId, item exists in `captured` status.
     - listPending returns empty until triage runs.
     - triageItem with stubbed LLM (most-recent project) transitions item to `triaged-pending` and writes a `decision` with confidence 0.5.
     - listPending returns the item after triage.
     - confirmDestination with the proposed projectId creates a `sources` row, sets status to `filed`, populates `resolvedProjectId` and `sourceId`.
     - confirmDestination with a different projectId overrides and files to the override.
     - triageItem is idempotent: second call returns the same decision without re-invoking the stub (verify via a counter on the stub).
     - runAuditWindowSweep transitions `triaged-auto` items past `depositedAt + 7d` to `filed` (use injected `now`).
     - runStaleSweep transitions `triaged-pending` items past `lastActionAt + 30d` to `stale`.
   - The deposit AC ("integration test: deposit text, drive triageItem directly with stubbed LLM, assert state machine + Source row creation per locked interface invariants") is satisfied by the above.

DEFINITION OF DONE:
- `pnpm install` from the worktree root succeeds.
- `pnpm typecheck` is green across all workspace tasks (the new `packages/inbox` and `apps/api` taskcache invalidates).
- `pnpm test` is green across all workspace tasks. New tests: ≥9 inbox integration tests in `apps/api/test/inbox.test.ts`. (Other suites must remain green; do not modify them except for adding the new package as a dependency.)
- iOS: `xcodebuild test -scheme WriterOS -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.0'` from `apps/ios/` succeeds with the new tests passing alongside the existing ones. (If the simulator isn't available on this machine, document the failure mode in your handoff but do not block on it — the reviewer will run it.)
- The locked InboxTriageEngine interface invariants 1–8 from `docs/interfaces/inbox-triage-engine.md` are demonstrably satisfied by the test suite.
- One commit per logical pass: (a) schema + migrations, (b) packages/inbox + SourceIngestionPipeline, (c) API routes + wiring, (d) integration tests, (e) iOS UI + XCTests. Conventional Commits format per AGENTS.md. Commit messages reference issue #11.

OUT OF SCOPE (do not touch):
- Real LLM triage (issue #12 / Tracer 9 — the two-tier confidence + audit/stale sweep logic stays stubbed here).
- PDF / URL / voice-memo / image / book-reference content types (issues #13, #15, #14 et al). Accept the union shape but throw on non-text in SourceIngestionPipeline.
- Embedding generation. `embedding_doc_ref` stays null. Pgvector table exists but is unused by tests.
- OutOfSyncDetector, Settings, audio retention, etc. — separate slices.
- Any consolidation worker changes. Don't touch `packages/consolidation/`.
- Any voice / TTS / SSE code. Don't touch `apps/api/src/routes/sessions.ts` or `apps/ios/WriterOS/Voice*` / `apps/ios/WriterOS/AudioPlaybackEngine.swift`.
- iOS share sheet (#15) / voice memo capture (#14). The "Dump" screen is the only iOS entry point in this slice.

COORDINATION:
- Produces (for downstream slices to consume):
  - `inbox_items`, `sources`, `embeddings` tables in `packages/db/src/schema.ts`.
  - `createInboxTriageEngine` factory in `packages/inbox/src/index.ts`.
  - `createSourceIngestionPipeline` factory (text-only impl) in `packages/inbox`.
  - `/inbox` REST endpoints.
- Consumes (already on main):
  - `packages/db` Drizzle infrastructure + migration tooling.
  - `apps/api` auth middleware + router pattern.
  - `packages/consolidation` is a sibling — DO NOT import from it; both share `packages/db`.

CLOSEOUT (mandatory, do this last):
1. Run the DoD checks. If any fail and you can fix-forward in one pass, do so. If you can't, document the failure in the handoff and leave the work in place.
2. Commit your work with messages that name the work item (e.g. `feat(#11): inbox_items + sources + embeddings schema (Pass A)`).
3. Write `docs/handoffs/stream-b-inbox-foundation.md` (overwrite if exists). First-person, functional tone, readable cold by a fresh agent. Cover:
   - What this stream tackled (one paragraph).
   - What landed: commits with SHAs, files with paths, test counts before/after.
   - What's still owed and why (if anything).
   - Non-obvious decisions: e.g. the PGlite/pgvector fallback, the "inline:" cached_content_ref scheme, the triage stub shape, anything where you exercised judgment.
   - Open questions for the Queen (Claude Code reviewer) — surface specifically anything where you'd want a second opinion.
   - Cross-stream artifacts produced (paths + intended consumer).
4. Exit. Do not open a PR yourself — the reviewer (Claude Code) opens the PR after running the review checklist against your handoff.
