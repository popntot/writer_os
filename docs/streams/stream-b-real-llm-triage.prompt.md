ROLE: Implementer for Stream B — real LLM triage (two-tier confidence) + sweeps cron.
WORKTREE: /Users/williamgreen/witer-os-git/writer_os-stream-b
BRANCH: stream-b-real-llm-triage (already checked out)
BASE: main (commit 293ece9)
ISSUE: popntot/writer_os#12

DELIVERABLE (one sentence):
Replace the stub triage in `@writer-os/inbox` with a real Anthropic-powered two-tier (auto-file / propose / no-match) classification that retrieves candidate projects via embedding similarity over `embeddings`, wire env-var-tunable thresholds, and add an hourly Cloudflare Workers cron that runs both `runAuditWindowSweep` + `runStaleSweep`.

READ FIRST (in order):
- docs/interfaces/inbox-triage-engine.md          (locked interface — DO NOT change shape; particularly the TriageDecision union, the InboxItemStatus enum, and invariants 2/3/4/8)
- docs/interfaces/llm-client.md                   (the LLMClient seam — `@writer-os/llm`. The factory `createInboxTriageEngine` already accepts `llm?: unknown` — change to typed LLMClient and use it.)
- docs/interfaces/source-ingestion-pipeline.md    (how Sources get created on auto-file; you call the pipeline, you don't duplicate ingestion logic)
- packages/inbox/src/index.ts                     (current implementation; replace `createDefaultTriageStub` body; do NOT remove the `triageStub?` injection — tests rely on it)
- packages/db/src/schema.ts                       (sources, embeddings, projects, inbox_items tables; vector(1536) column with HNSW cosine index — fallback `text` column when pgvector unavailable in PGlite)
- apps/api/src/index.ts                           (where the engine is constructed; you'll need to plumb the real LLM through)
- apps/api/wrangler.toml                          (currently has NO [triggers] block; you'll add `crons = ["0 * * * *"]` and a `scheduled()` handler)
- apps/api/test/inbox.test.ts                     (existing 9 inbox integration tests; you'll add ~6–8 more for two-tier dispatch + sweep behavior)
- apps/api/src/llm.ts                             (createLLMForWorker factory; confirms how the LLM is built per request)
- docs/handoffs/stream-b-inbox-foundation.md      (prior iteration's notes — pgvector fallback, contentPreview decisions)

WORK ITEMS:
1. In `packages/inbox/src/index.ts`:
   - Tighten `InboxTriageEngineDeps.llm` from `unknown` to the typed `LLMClient` from `@writer-os/llm`. Re-export the type if useful.
   - Add two new env-driven thresholds with defaults: `WRITER_OS_TRIAGE_HIGH_CONFIDENCE` (default 0.80) and `WRITER_OS_TRIAGE_LOW_CONFIDENCE` (default 0.50). The engine factory takes them as numbers via deps (caller in `apps/api` reads env vars). Document defaults at the top of `index.ts` and again in the PR body.
   - Implement `createRealTriage(deps)` producing a `TriageStub`-shaped function that:
     a. Generates an embedding for the inbox item's textual content (use `LLMClient.embed` if present; else a clearly-named TODO + fall back to a text-based retrieval). For non-text RawContent types, use `cached_content_ref` / `suppliedTitle` / filename — anything text-like already produced by SourceIngestionPipeline.
     b. Queries the `embeddings` table for top-K (K=5) nearest neighbors via cosine similarity over `embedding` column, joined back through `sources` → `projects` so we land on candidate project ids. Use Drizzle raw SQL for the `<->` operator if needed; gate behind a runtime detection of pgvector vs text fallback (PGlite path). If pgvector is unavailable (text column), skip embedding retrieval and fall back to "most recently touched project" (current stub heuristic) — but still call the LLM for classification + reasoning. Document this branch.
     c. Calls Claude (via `LLMClient`) with a structured prompt containing: candidate project headlines (project name + TrueLine excerpt + last source title), the inbox item's content/excerpt, and asks for `{ project_id, confidence (0–1), reasoning }` JSON. Use the existing chat / completion API from `@writer-os/llm`; do NOT add a new SDK dep.
     d. Maps the confidence to a `TriageDecision`:
        - `confidence ≥ high` → `{ kind: "auto-filed", projectId, sourceId, confidence, reasoning }`. The `sourceId` comes from running `ingestionPipeline.ingest(...)` (existing path used today by the stub's auto-file branch).
        - `low ≤ confidence < high` → `{ kind: "proposed", projectId, confidence, reasoning }`.
        - `confidence < low` → `{ kind: "no-match", reasoning }`.
     e. Persists `agentReasoning` on every decision (already wired in the engine's `triageItem`; just make sure your decision shapes carry `reasoning`).
   - Wire `createRealTriage` as the new default when `deps.triageStub` is not provided AND `deps.llm` is present. If `deps.llm` is missing, keep the existing stub-fallback (tests need this).
   - Add `--retry` semantics: if the LLM call throws, the engine's existing `triage-failed` branch already handles exhaustion. Don't re-invent retry; just let exceptions propagate up to `triageItem`'s existing catch.

2. In `apps/api/src/index.ts`:
   - Pass the real LLM into `createInboxTriageEngine({ db, llm, ingestionPipeline, highConfidence, lowConfidence })`, reading the two threshold env vars off `Env`.
   - Export a `scheduled` handler from the default export shape Cloudflare Workers expects: `{ async fetch(...), async scheduled(event, env, ctx) { ... } }`. The `scheduled` handler builds the DB + engine the same way `fetch` does, then runs both `runAuditWindowSweep(new Date())` and `runStaleSweep(new Date())` inside `ctx.waitUntil`, logging the counts returned. Schedule cleanup of postgres-js sockets via `ctx.waitUntil(handle.close())`.

3. In `apps/api/src/env.ts`:
   - Add `WRITER_OS_TRIAGE_HIGH_CONFIDENCE?: string` and `WRITER_OS_TRIAGE_LOW_CONFIDENCE?: string` (Workers envs are strings; parse at engine-construction).
   - Document defaults inline.

4. In `apps/api/wrangler.toml`:
   - Add a `[triggers]` block with `crons = ["0 * * * *"]` (hourly, at minute 0). Add a comment noting this drives both sweeps.

5. In `apps/api/.dev.vars.example`:
   - Add the two new env vars with their defaults commented out so devs know they exist.

6. In `apps/api/test/inbox.test.ts`:
   - Add tests (each seeded with projects + sources + embeddings where pgvector is available, else the PGlite text-fallback path):
     - High-confidence → auto-file: status `triaged-auto`, decision.kind === "auto-filed", sourceId non-null, `agentReasoning` populated.
     - Low-confidence → proposed: status `triaged-pending`, decision.kind === "proposed", `proposedProjectId` set, NO source created.
     - Below low → no-match: status `triaged-pending`, decision.kind === "no-match", `proposedProjectId` null.
     - Idempotent re-triage: calling `triageItem` twice on a triaged item returns the same decision without re-invoking the LLM (use a spy/counter on the injected LLM).
     - Audit sweep at deposit+7d boundary: `triaged-auto` items pre-boundary stay; post-boundary become `filed`. (Inject `now`.)
     - Stale sweep at lastActionAt+30d boundary: `triaged-pending` items pre-boundary stay; post-boundary become `stale`. (Inject `now`.)
     - LLM failure surfaces as `triage-failed` after retry exhaustion (use a stub LLM that always throws).
   - Use the existing test harness — inject a fake LLM (the `triageStub` seam already exists; you can either inject a `triageStub` for unit-style tests OR inject a fake `LLMClient` to test the real `createRealTriage` path end-to-end. Prefer the latter for the high/low/no-match coverage so the real code path is exercised.)
   - Run with `pnpm --filter @writer-os/api test`.

DEFINITION OF DONE:
- `pnpm typecheck` passes from repo root.
- `pnpm test` passes from repo root (turbo). Counts: previous inbox suite (9) + new dispatch + sweep + idempotency + failure tests (~7) → 16+ inbox tests. Total api test count grows by ~7.
- `apps/api/wrangler.toml` has a `[triggers]` block with `crons = ["0 * * * *"]`.
- `apps/api/src/index.ts` default export exposes both `fetch` AND `scheduled`. `scheduled` runs both sweeps and logs counts.
- `apps/api/.dev.vars.example` documents the two new env vars.
- High-confidence path creates a Source (calls SourceIngestionPipeline). Low-confidence path does NOT create a Source. No-match path does NOT create a Source.
- `agentReasoning` is non-null on every state ≥ `triaged-auto` (invariant 8 from the locked interface).
- Re-running `triageItem` on an already-triaged item is idempotent and does NOT re-invoke the LLM (assert with a call-counter in the test).
- Logical commits, each compiling individually:
  1. `feat(#12): typed LLMClient on InboxTriageEngine + threshold deps`
  2. `feat(#12): real Claude-driven triage with embedding-based candidate retrieval`
  3. `feat(#12): hourly cron trigger runs audit + stale sweeps`
  4. `test(#12): integration tests for two-tier dispatch + sweep boundaries + idempotency`

OUT OF SCOPE (do not touch):
- The `InboxTriageEngine` interface shape in `docs/interfaces/inbox-triage-engine.md` — it's locked. Do not rename methods, do not change the `TriageDecision` union, do not change `InboxItemStatus` values.
- The `sources` / `embeddings` / `inbox_items` schema in `packages/db/src/schema.ts`. They were set in #11 and are sufficient.
- Any iOS code (`apps/ios/**`). The iOS pending list already surfaces `agentReasoning` per the issue's AC — verify it does, and if it doesn't, write a note in your handoff but do NOT modify iOS this iteration (Stream A owns iOS reskins; touching iOS here would cause merge conflicts).
- `packages/consolidation`, `packages/db/src/trueline-store.ts`, voice loop, settings — unrelated.
- The `apps/ios/project.yml` uncommitted include — leave alone.

COORDINATION:
- Produces (consumed by future API consumers + DS-3/4/5):
  - Real `agentReasoning` strings now flow on every decision — the iOS Pending view (touched by DS-5 / #46) will benefit but no shape change is required.
  - The cron-driven sweep is the first scheduled trigger this Worker has — note in the handoff so future scheduled work (audit digests, stale notifications) can compose into the same handler.
- Consumes (no cross-stream inputs this iteration):
  - `@writer-os/llm` (already on main).
  - `@writer-os/inbox` (current package — you ARE this package's owner for this stream).

ENVIRONMENT NOTES:
- The codex netless sandbox cannot reach `registry.npmjs.org`. `pnpm install` will fail; the repo ships with `node_modules/` populated on this machine. If install IS required (new dep added), justify and document in your handoff.
- Cloudflare Workers' `scheduled` handler signature: `async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext)`. Pattern after the existing `fetch` for DB construction + cleanup. See https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ if uncertain (but you should not need to — pattern it on `fetch`).
- Anthropic SDK is at `^0.91.1`, pinned. Don't bump.
- PGlite does not support pgvector. Stream B handoff notes (handoffs/stream-b-inbox-foundation.md) describe the dual-shape migration (`vector(1536)` in prod, `text` fallback in PGlite). Your retrieval branch must respect this — detect at runtime or branch on a known capability flag. The text-fallback path can skip embedding retrieval entirely and use "most-recently-touched project" as the single candidate.
- Prior workers hit `fatal: Unable to create '.../.git/worktrees/.../index.lock': Operation not permitted` when committing. If it recurs, write patch files at the worktree root and document in handoff — Queen will `git am` them.

CLOSEOUT (mandatory, do this last):
1. Run `pnpm typecheck` and `pnpm test` from repo root. Fix or document failures.
2. Commit your work in the 4 logical passes named above. If commits are blocked, write patch files.
3. Overwrite `docs/handoffs/stream-b-real-llm-triage.md` (overwrite if it exists — the prior `stream-b-inbox-foundation.md` is a different stream; this one gets a new filename) with:
   - What this stream tackled (one paragraph).
   - What landed (commits with SHAs; files + paths; test counts before/after).
   - What's still owed and why.
   - Non-obvious decisions (how you handled the PGlite/pgvector branch; how you structured the LLM prompt; what model you used; how you parsed/validated the JSON response; whether you used JSON mode / tool calls / regex; how you tested the LLM failure → triage-failed path).
   - Open questions for the Queen.
   - Cross-stream artifacts produced (paths + intended consumers).
4. Exit.
