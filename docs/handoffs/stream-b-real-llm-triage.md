# Stream B Real LLM Triage Handoff

This stream tackled issue #12: replacing the inbox package's default stub triage
with a real LLM-driven two-tier classifier, adding candidate retrieval over the
existing project/source/embedding tables with a PGlite fallback, wiring tunable
confidence thresholds through the API Worker, and adding the first hourly Worker
cron for inbox audit-window and stale sweeps. A fix-forward pass also landed the
`tryEmbed` type narrowing needed for strict TypeScript.

## What Landed

Commits: none. Per coordination, I did not attempt another commit after the
known worktree-lock failure. Patch files were regenerated at the worktree root:

- `0001-feat-12-typed-llm-threshold-deps.patch`
- `0002-feat-12-real-claude-triage.patch`
- `0003-feat-12-hourly-cron-sweeps.patch`
- `0004-test-12-triage-sweeps.patch`

Files changed:

- `packages/inbox/src/index.ts`
- `packages/inbox/package.json`
- `pnpm-lock.yaml`
- `apps/api/src/index.ts`
- `apps/api/src/env.ts`
- `apps/api/wrangler.toml`
- `apps/api/.dev.vars.example`
- `apps/api/test/inbox.test.ts`

Test counts: `apps/api/test/inbox.test.ts` now has 16 tests, up from 9. The full
API suite reports 61 passing tests. The root `pnpm test` run reports all 13
turbo tasks successful, with package test counts: API 61, DB 10, consolidation
7, LLM 8, TTS 9, shared-types no tests yet, inbox no package-local test files.

## Verification

Green:

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`

## Non-Obvious Decisions

- Thresholds default to `WRITER_OS_TRIAGE_HIGH_CONFIDENCE=0.80` and
  `WRITER_OS_TRIAGE_LOW_CONFIDENCE=0.50`. The API parses Worker env vars as
  strings, validates `0 <= low <= high <= 1`, and passes numbers into the inbox
  engine.
- `LLMClient` is typed on `InboxTriageEngineDeps`. `LLMClient` still has no
  locked `embed` method, so real triage checks for an optional runtime `embed`
  function. If absent, or if the `embeddings.embedding` column is the PGlite text
  fallback, retrieval deliberately falls back to the existing most-recently
  touched project heuristic while still calling the LLM for classification and
  reasoning.
- The fix-forward typecheck issue was in `tryEmbed`: after the array early
  return, TypeScript still retained the `number[]` union arm for object property
  access. The helper now uses an explicit `Exclude<typeof result, number[]>`
  object narrowing before reading `embedding`, `embeddings`, or `data`.
- pgvector detection uses `information_schema.columns` and treats `udt_name =
  'vector'` or `data_type = 'vector'` as vector-capable. The vector path queries
  top chunks with `<=>`, dedupes to up to 5 project candidates, and includes
  project name, latest TrueLine excerpt, latest source title, and similarity in
  the prompt.
- The LLM prompt uses plain `chat()` with JSON-only instructions. There is no
  JSON mode or tool call in the locked `@writer-os/llm` interface, so the parser
  extracts either a raw JSON object or a fenced JSON object, validates
  `project_id`, `confidence`, and `reasoning`, clamps confidence to `[0, 1]`, and
  rejects malformed responses so the existing `triage-failed` path handles them.
- High confidence returns an internal `auto-filed` decision with a placeholder
  `sourceId`; `triageItem` immediately runs `SourceIngestionPipeline.ingest(...)`
  and replaces it with the real source id before returning or persisting. Queen
  accepted this shape for the stream.
- The scheduled Worker handler builds DB + LLM + inbox engine the same way fetch
  does, runs `runAuditWindowSweep(new Date())` and `runStaleSweep(new Date())`,
  logs returned counts, and closes the postgres-js handle in `ctx.waitUntil`
  after sweeps settle. Queen accepted deferring scheduler-composition refactors.
- The LLM failure test injects a fake `LLMClient` whose `chat()` always throws.
  The engine marks the row `triage-failed`, stores the error message in
  `agentReasoning`, and rethrows. Actual retry exhaustion remains inside
  `@writer-os/llm`.

## Open Questions

None blocking this stream. The prior questions about a locked `LLMClient.embed`
contract, scheduled-job composition, and the internal pending-ingestion source
placeholder are explicitly deferred.

## Cross-Stream Artifacts

- `packages/inbox/src/index.ts`: typed LLM triage implementation, threshold
  defaults, pgvector/PGlite candidate retrieval, JSON parsing, confidence
  mapping, and strict-safe embed response parsing for future API/iOS consumers.
- `apps/api/src/index.ts`: first scheduled Worker handler; future scheduled work
  can compose into this handler.
- `apps/api/wrangler.toml`: `[triggers] crons = ["0 * * * *"]`, hourly at
  minute 0.
- `apps/api/.dev.vars.example` and `apps/api/src/env.ts`: documented threshold
  env vars for local and deployed Worker configuration.
- `apps/api/test/inbox.test.ts`: integration test shape for real-path fake LLM
  dispatch, boundary sweeps, idempotency, and failure bookkeeping.
