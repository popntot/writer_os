# Session Log

Reverse-chronological log of work shipped across sessions. Each entry: what got done, what's next, open threads.

---

## 2026-05-06 (session 3, end) — Issue #5 in flight (PR #25); session paused

**Shipped today (sessions 3 + 3 continued):**

- ADRs 0001–0004 written
- `docs/interfaces/` locked for the four high-priority modules (TrueLineStore, ConsolidationWorker, InboxTriageEngine, SourceIngestionPipeline)
- PRD published as issue #1
- Sliced PRD into 22 tracer-bullet issues (#2–#23) with phased cost model
- AGENTS.md + `docs/agents/harness.md` documenting the local Claude Code + Codex CLI parallel-planner-with-review pattern (closed #3)
- Backend skeleton merged: Turborepo + Worker + Hono + Drizzle + projects CRUD + bearer auth + 7 vitest tests (closed #4 via PR #24)
- iOS skeleton + APIClient + project list/create open as PR #25; HITL verification pending

**In flight at session end — PR #25 (issue/5-ios-skeleton):**

- AFK portion done: simulator build green, 3/3 XCTest pass, `pnpm ios:generate / open / test` scripts wired, comprehensive `apps/ios/README.md`
- HITL portion pending Will:
  - **AC #3** (first dev-provisioned install on iPhone) — not yet done. Requires: `pnpm ios:open`, set Team in Signing, plug iPhone, ⌘R. Steps in PR #25 description.
  - **AC #4** (end-to-end round-trip) — blocked on Supabase connection URL not yet in `apps/api/.dev.vars`. Will created a Supabase project (ref: `ktmkwljfmyynjnlyvqhd`); the Transaction pooler URI step in the Connect modal was where we paused for the night.

**Pickup tomorrow, in order:**

1. **Finish PR #25 HITL verification:**
   - Copy the Transaction pooler URI from Supabase dashboard (Connect → Direct → Transaction pooler → URI). Replace `[YOUR-PASSWORD]` with the actual DB password.
   - Edit `apps/api/.dev.vars` (gitignored): set `DATABASE_URL` and `WRITER_OS_API_SECRET`.
   - Run `DATABASE_URL="$(grep DATABASE_URL apps/api/.dev.vars | cut -d'"' -f2)" pnpm db:migrate` — applies the projects table to Supabase.
   - Run `pnpm api:dev` (Worker on http://localhost:8787).
   - In another terminal: `pnpm ios:generate && pnpm ios:open`. Set Team in Signing → ⌘R to install on iPhone. Trust dev cert in iPhone Settings.
   - In iOS app's setup screen: enter `http://<Mac's local IP>:8787` (find via `ipconfig getifaddr en0`) + `dev-secret-change-me`.
   - Tap +, create a project, watch it appear. Tick AC checkboxes. Merge PR #25.
2. **#6 — LLMClient + text-turn** (AFK, unblocks after PR #25 merges). **First Anthropic API blocker** — prepay $30–50 with auto-refill OFF at https://console.anthropic.com/ before #6 starts.

**Open threads / things to remember:**

- Supabase project ref `ktmkwljfmyynjnlyvqhd` is Will's dev DB. Free tier, no card on file.
- The pooler URI contains the DB password — never paste in chat, only into `apps/api/.dev.vars` (gitignored).
- The Worker requires `DATABASE_URL` reachable for `/projects` endpoints to work. `/health` works regardless.
- Branch `issue/5-ios-skeleton` is checked out locally; PR #25 open.
- All open threads from earlier sessions still apply.

---

## 2026-05-06 (session 3, continued) — Issue #4 shipped: backend skeleton (PR #24 merged)

**Shipped:**

- PR #24 merged as `1c6dc05` (squash-merge, branch deleted). Issue #4 closed.
- Apple Developer Program enrollment started by Will in parallel ($99/yr, 24–48h Apple processing). Slice #5 (iOS skeleton + first dev install) is unblocked once Apple approval email arrives.

**What landed in the PR:**

- Turborepo + pnpm monorepo skeleton: `apps/api` + `packages/shared-types` + `packages/db`.
- `apps/api`: Cloudflare Worker on Hono. `GET /health` (public), `GET /projects` and `POST /projects` (bearer-secret auth). Constant-time auth comparison. Cached app instance per Worker.
- `packages/shared-types`: TypeScript declarations lifted from all 4 locked interface specs (TrueLineStore, ConsolidationWorker, InboxTriageEngine, SourceIngestionPipeline) + shared domain types.
- `packages/db`: Drizzle schema for `projects`; `createNodeClient` for production (postgres-js); `createPgliteClient` for tests (zero-dep PGlite); `AppDatabase` union type so prod and test share one router code path. Drizzle migration tooling pinned (`pnpm db:generate`, `pnpm db:migrate`).
- 7 vitest integration tests pass (auth, list, create, validation). `pnpm typecheck` green across all 5 tasks. `pnpm test` green.

**Decisions pinned in slice 2a (PRD glosses now locked):**

- **Auth: shared-secret bearer token.** Header `Authorization: Bearer <WRITER_OS_API_SECRET>`. Magic-link deferred to Phase 1.5 web.
- **Migrations: Drizzle (drizzle-kit generate + drizzle-orm/migrator runtime).**
- **Test database: PGlite (Postgres-in-WASM).** Zero external deps; no `supabase` CLI install needed for tests. Production stays on Supabase via `createNodeClient`.

**Harness validation note:**

Codex's first pass produced green tests but with hand-rolled type stubs (`ProjectsTable = object`), dynamic imports of the workspace package, and per-request app construction. Reviewer (Claude Code) rewrote `db.ts`, `routes/projects.ts`, `index.ts`, and `test/projects.test.ts` to use static workspace imports, proper Drizzle types, and a cached app — preserving the 7 passing tests. This is the harness loop working as designed: Codex implements, Claude Code reviews and fixes forward in the same branch (per AGENTS.md). Worth noting for future cycles: budget review-and-rewrite time, especially on the first slice where Codex hasn't internalized the codebase conventions yet.

**Next session pickup, in order:**

1. **Will reviews and merges PR #24.** Once merged, slice #4 closes.
2. **#5 — Foundations 2b: iOS skeleton + first dev install on Will's iPhone** (AFK, blocked by #4 merge). **First Apple Developer Program enrollment blocker** ($99/yr fixed cost). Apple takes 24–48 hours to approve enrollment — Will should start the enrollment process during PR #24 review so the approval lands in time.
3. **#6 — LLMClient + text-turn** (AFK, blocked by #5). **First Anthropic API blocker** — prepay $30–50, auto-refill OFF.
4. #7, #8, #9 — chain to the smoke-test gate.

**Open threads / things to remember:**

- `apps/api` is wired to Supabase but not deployed. Once Will provisions a Supabase project (part of #2 1a), set `DATABASE_URL` via `wrangler secret put` and the Worker connects.
- All open threads from earlier sessions still apply.

---

## 2026-05-06 (session 3, continued) — Issue #3 shipped (local harness wired); cost model phased

**Shipped:**

- Closed issue #3 (Foundations 1b: harness + AGENTS expansion). Local Claude Code + Codex CLI parallel-planner-with-review harness is live. Codex CLI verified ready (`codex-cli 0.125.0`, ChatGPT auth active).
- AGENTS.md expanded with: read-before-working ordered list, build harness section, ADR + `docs/interfaces/` references, PR conventions, UI/branding standing instruction, deep-modules rule strengthened (lock-interface-first for un-locked modules), **AFK escalation rules**, **paid-key blockers** policy.
- New `docs/agents/harness.md` documents the local pattern: roles, pre-flight, normal cycle, escalation triggers, cost model, what the harness does NOT do at MVP.
- Cost model reframed into 3 phases (constraint: Will runs sub-funded by default, prepays one-time API credits when needed, defers cloud AFK to Phase C):
  - **Phase A (now, ~$0)**: subs + free tiers. Buildable: #4, #5, #7. No paid keys needed.
  - **Phase B (when first ~$50 prepay arrives)**: Anthropic API prepay unlocks #6 onward; ElevenLabs prepay unlocks #8. v0.1 walk-test reachable here.
  - **Phase C (post-#10 GO, ~$50–200/mo)**: cloud Sandcastle for true 24/7 AFK. Deferred until smoke test validates the product.
- Slice #3's original cloud-Sandcastle AC was rescoped to the local harness equivalent. Deferred deliverables (`.sandcastle/` Dockerfile + prompt.md + main.ts, deployment template) deferred to a new Phase C issue when greenlit.

**Paid-key blocker schedule (will be flagged in advance by Claude Code):**

| Trigger slice | What to provision | One-time prepay |
|---|---|---|
| #5 (iOS dev install) | Apple Developer enrollment | $99/yr fixed |
| **#6 (LLMClient)** | Anthropic API key + prepay credits | **$30–50** |
| #8 (voice loop) | ElevenLabs API + prepay | $20–30 |
| Mid-build (TBD) | Cloudflare Workers paid ($5/mo) — only if free tier exhausts | $5/mo |
| Mid-build (TBD) | Supabase Pro ($25/mo) — likely needed at #11 (pgvector at scale) | $25/mo |

**Next session pickup, in order:**

1. **#4 — Foundations 2a: backend skeleton** (AFK, sub-funded). First Codex-implemented slice. Critical-path dependency for everything else. No paid keys needed.
2. **#5 — Foundations 2b: iOS skeleton + first dev install** (AFK, blocked by #4). First paid dependency: Apple Developer enrollment ($99/yr). Lead time 24–48h for Apple to approve, so Will should start the enrollment process around the time #4 lands.
3. **#6 — LLMClient + text-turn** (AFK, blocked by #5). **First Anthropic API blocker** — Will needs to prepay $30–50 in Anthropic credits before this slice claims the key.
4. **#7 — TrueLineStore + hardcoded delta** (AFK, blocked by #6). Spine plumbing; no LLM call.
5. **#8 — voice loop** (AFK, blocked by #7). **First ElevenLabs blocker** — prepay $20–30 before this slice claims.
6. **#9 — ConsolidationWorker** (AFK, blocked by #7).
7. **#10 — Real-walk smoke test (HITL GO/NO-GO)**. After this, Phase C cloud-AFK becomes a justifiable decision.

**Open threads / things to remember:**

- Will's operating model: leverage subs where possible, provision paid keys only when they become hard blockers, Claude Code surfaces upcoming blockers with lead time. Saved as project memory.
- The local harness requires Will at the keyboard. Truly hands-off overnight runs require Phase C cloud Sandcastle.
- All open threads from sessions 1 + 2 still apply.

---

## 2026-05-06 (session 3, continued) — `/to-issues`: 22 vertical slices opened

**Shipped:**

- Sliced issue #1 (the PRD) into **22 tracer-bullet issues** (#2–#23) on `popntot/writer_os`. Dependency-ordered, labeled `ready-for-agent` (19) or `ready-for-human` (3).
- Critical path to v0.1 walk-loop validation: **#2 + #3 → #4 → #5 → #6 → #7 → #8 + #9 → #10**. Everything after #10 (the real-walk smoke test gate) is accretion gated on a GO call.
- Three HITL gates: **#2** (account/key provisioning — must happen before anything that needs keys), **#10** (real-walk smoke test — GO/NO-GO before pouring effort into accretion), **#23** (Apple Dev enrollment + first ITC submission).
- Notable structural calls baked into the slicing:
  - **Slice 4 (#7) writes a hardcoded TrueLine delta**, then slice 6 (#9) replaces it with real LLM consolidation. Separates spine plumbing from LLM consolidation; lets either fail in isolation.
  - **Slice 5 (voice loop, #8) lands BEFORE slice 6 (real consolidation, #9)**. Voice tested against a stable hardcoded spine; LLM consolidation tested against a stable voice loop. Highest-uncertainty surface (Apple Speech outdoors) flushed out first.
  - **Slice 8 (#11) ships Inbox with stubbed triage**, then slice 9 (#12) swaps in real LLM. Inbox state machine + ingestion plumbing land deterministically before LLM dependency.
  - **Slice 10 (#10) is a GO/NO-GO gate** — Will does one real walk, posts notes; if NO-GO, fix the failing slice before any accretion. Prevents pouring effort into inbox/sources on top of a broken core loop.
  - **Ingestion ordered PDF → voice-memo → URL** (slices 10 → 11 → 12 = #13 → #14 → #15) — easiest to messiest, parallelizable since they only share blocker #12.
  - **Slice 14 (#17, ArtifactGenerator)** triggers a module-interface depth review for ArtifactGenerator before implementation, parallel to the four high-priority locks shipped in the previous commit.
- Auth + migrations pinned in slice 2a (#4): shared-secret bearer token at MVP (magic-link deferred to Phase 1.5 web), Drizzle ORM as the migration tool. PRD glossed both — locked in slicing instead.

**Next session pickup, in order:**

1. **#2 (account/key provisioning) — Will.** Hard gate: nothing AFK can run without these.
2. **#3 (Sandcastle harness + AGENTS.md expansion) — bootstrappable in parallel with #2.** Once #3 lands, all other AFK slices route through the harness.
3. After #2 + #3 land: **#4 → #5 → #6 → #7 → #8 + #9** runs as a serial AFK chain to the smoke-test gate.
4. Then **#10 (smoke test) — Will.** Real walk, real device, GO/NO-GO documented in the issue.
5. After GO: parallel AFK fan-out across the accretion slices.

**Open threads / things to remember:**

- 22 issues opened means 22 PR cycles to land v0.1. Prioritize PR review velocity — bottleneck on Claude-reviewing-Codex output is more likely than Codex throughput.
- ArtifactGenerator interface lock (#17) is the only remaining depth review needed; the other 13 medium/low-priority modules can be reviewed lazily at issue-claim time.
- All open threads from sessions 1 + 2 still apply.

---

## 2026-05-06 (session 3) — Module interface depth review (4 high-priority modules)

**Shipped:**

- Locked the public interfaces of the four high-priority backend modules per Ousterhout depth checks. Each module gets its own doc under [`docs/interfaces/`](interfaces/) with: domain types, the locked TypeScript-shaped surface, what's hidden, what's deliberately separated, why-each-call-and-not-others, invariants for testing, and deferred items.
  - [`docs/interfaces/trueline-store.md`](interfaces/trueline-store.md) — added `listVersions`, `contributionSummary` field on writes, explicit empty-state semantics (v0 with empty content). Whole-document replacement, no patches at MVP. Section parsing and citation indexing kept *out* of the store.
  - [`docs/interfaces/consolidation-worker.md`](interfaces/consolidation-worker.md) — `enqueue` + `getStatus` + `retry` + `processSession` (the last is the testable work fn). Status as tagged union with strict transitions. Race handling lives in ConversationOrchestrator, not here. Result returns refs, not content.
  - [`docs/interfaces/inbox-triage-engine.md`](interfaces/inbox-triage-engine.md) — `triage(itemId) → TriageProposal` renamed to `triageItem(itemId) → TriageDecision` (decision encompasses the action already taken in auto-file cases). Per-item `markStale` replaced with `runStaleSweep(now)` + sibling `runAuditWindowSweep(now)`. `confirmDestination` collapses three user actions (accept / override / reject-during-audit). Added `recoverFromStale`.
  - [`docs/interfaces/source-ingestion-pipeline.md`](interfaces/source-ingestion-pipeline.md) — minimal two-method surface (`ingest` + `getProcessedSource`); type-specific processing branches internally. Sources row created at ingest with `project_id = null`; InboxTriageEngine populates project at file/auto-file. No queue here — the inbox engine owns that.
- `RawContent` aligned across InboxTriageEngine and SourceIngestionPipeline (one shared union; book-reference type included so it routes through the single deposit pathway per PRD §"Inbox triage" line 215).
- New feedback memory saved at the per-project memory dir: **UI/branding deferred — functional core first**. Will explicitly directed: stand up a build that tests core functionality, then layer design later. Memory enforces "no styling/branding/look-and-feel proposals until the design phase is signaled."

**PRD schema delta surfaced (action item, not yet applied):**

- Add `triage-failed` to the `inbox_items.status` enum (PRD §"Schema sketch" line 331). Rationale: parallels ConsolidationWorker's failed state, gives OutOfSyncDetector a clean signal for triage-stuck items, avoids overloading `captured` with both "ingestion-in-flight" and "triage-attempts-exhausted" semantics. Apply in next housekeeping commit to `docs/prd.md`.

**Next session pickup, in order** (carries forward; item 2 from session 2 now done):

1. ~~Module interface depth review~~ ✅ done (this session, 4 docs in `docs/interfaces/`).
2. **PRD schema delta** — apply the `triage-failed` status addition to `docs/prd.md` schema sketch.
3. **`/to-issues`** — slice issue #1 into tracer-bullet vertical-slice issues, AFK-ready. Each issue can now reference a locked interface doc as the API contract.
4. **Sandcastle harness setup** — `.sandcastle/` config (Dockerfile, prompt.md, main.ts), AGENTS.md expansion with deep-module rules + AFK escalation rules + reference to all four ADRs. Reference `docs/interfaces/` as the locked-API source.
5. **Account/key provisioning** — Cloudflare, Supabase, Anthropic, ElevenLabs accounts; secrets storage (1Password CLI recommended). Install `op` then.
6. **First package scaffolding** — Turborepo + pnpm monorepo skeleton, `packages/shared-types` first (lift the locked interfaces in from `docs/interfaces/` as real `.ts`), then first vertical slice picked up by Sandcastle. `/tdd` discipline (red-green-refactor) applies inside Sandcastle per issue.

**Open threads / things to remember:**

- Will's standing instruction this session: keep UI light; no styling/branding/look-and-feel work until core functionality stands. Saved as feedback memory in the per-project memory dir.
- The locked interfaces are documentation, not code yet. They become `.ts` in `packages/shared-types` when the monorepo lands. Keep them in sync if either side moves first.
- The other 14 modules (Medium / Low priority per PRD §"Modules") are *not* yet depth-reviewed. They can be reviewed lazily — at issue-creation time per slice — rather than upfront.
- All open threads from sessions 1 + 2 still apply.

---

## 2026-05-06 (session 2) — Second-machine onboarding; PRD published to tracker

**Shipped:**

- Onboarded a second dev Mac (`/Users/williamgreen` user). Repo cloned to `~/Code/writer_os` per onboarding doc (NOT iCloud). `gh` auth verified on `popntot` account via SSH.
- Cross-machine dev tools surveyed: `git 2.50.1`, `gh 2.90.0`, `node 20.17.0`, `pnpm 10.33.2`, `swift 6.3.1`, `xcodebuild`, `rsync` all present. Deferred per plan: `wrangler`, `supabase` CLI, `turbo`, `op` (1Password CLI).
- Fixed broken `pnpm` resolution on the second machine: corepack-shipped shim at `/usr/local/bin/pnpm` was failing with `Cannot find matching keyid` (corepack 0.29.3 keyset out of date), and the standalone `pnpm` install at `~/Library/pnpm/pnpm` was being shadowed because the `.zshrc` `case` block skipped re-prepending `$PNPM_HOME` when it was already on PATH. Replaced with an unconditional prepend so the working pnpm wins lookup. Note for Will: if the **other** Mac has the same Node 20.17 + `~/Library/pnpm` setup and `pnpm --version` errors with that keyid message, apply the same `.zshrc` fix.
- Created the four canonical triage labels on the GitHub repo (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`) — `docs/agents/triage-labels.md` referenced them but they weren't yet provisioned.
- Published the PRD as **GitHub issue #1** with `needs-triage` label: https://github.com/popntot/writer_os/issues/1. Issue body mirrors `docs/prd.md` with a preamble noting the canonical doc is the source of truth and PR amendments are the way to update.

**Next session pickup, in order** (carries forward from session 1, items 1 and 3 now done):

1. ~~`/to-prd` — publish PRD to tracker~~ ✅ done (issue #1)
2. **Module interface depth review** — validate the PRD's 18 modules (especially the 4 high-priority: TrueLineStore, ConsolidationWorker, InboxTriageEngine, SourceIngestionPipeline) actually express deep modules per Ousterhout. Use `/design-an-interface` per module or a manual interface review. Lock concrete TypeScript signatures into `packages/shared-types` later.
3. **`/to-issues`** — slice issue #1 into tracer-bullet vertical-slice issues, AFK-ready (run AFTER interface review so each issue can reference a locked interface).
4. ~~ADRs~~ ✅ done (commits `05e3444`, `2ac0fe4`, `f7e5550`, `49d931f`):
   - ADR-0001 Mentor neutrality (craft, not ideology)
   - ADR-0002 Pipelined voice stack over realtime voice APIs
   - ADR-0003 Cloud-first hybrid storage with document-shaped agent layer
   - ADR-0004 One source of truth + interface projection
5. **Sandcastle harness setup** — `.sandcastle/` config (Dockerfile, prompt.md, main.ts), AGENTS.md expansion with deep-module rules + AFK escalation rules + reference to all four ADRs.
6. **Account/key provisioning** — Cloudflare, Supabase, Anthropic, ElevenLabs accounts; secrets storage (1Password CLI recommended). Install `op` then.
7. **First package scaffolding** — Turborepo + pnpm monorepo skeleton, then first vertical slice picked up by Sandcastle. `/tdd` discipline (red-green-refactor) applies inside Sandcastle per issue.

**Open threads / things to remember:**

- Corepack shim at `/usr/local/bin/pnpm` is still present but shadowed; harmless. To remove: `sudo rm /usr/local/bin/pnpm` from a real terminal.
- Memory pointer for Writer OS lives at the home-level memory dir on this Mac (`~/.claude/projects/-Users-williamgreen/memory/project_writer_os.md`) so it loads in any Claude Code session. Per-project memory will accumulate at `~/.claude/projects/-Users-williamgreen-Code-writer_os/memory/` once Claude Code is launched from inside the project dir.
- All other open threads from session 1 still apply (AGENTS.md expansion before Sandcastle, pre-commit hooks deferred, CI deferred, Apple Speech outdoor quality testing, Mentor ADR-0001).

---

## 2026-05-06 — Foundation: PRD, agent substrate, repo scaffolding

**Shipped:**

- Full product PRD via `/grill-me` + `/to-prd` ([`docs/prd.md`](prd.md)). 66 user stories, 18 modules, complete architecture decisions, scoped phases (v0.1 iOS, Phase 1.5 web, Phase 2 productization).
- Voice stack locked: Apple Speech → Claude Sonnet 4.6 → ElevenLabs (pipelined; realtime voice APIs explicitly rejected for sustained-reasoning quality reasons).
- Spine model locked: Project as the spine entity, five children (Articles, Sources, Sessions, TrueLine, OpenQuestions).
- Build approach locked: Sandcastle AFK harness (`parallel-planner-with-review` template, Codex implements + Claude Code reviews) on Cloudflare Workers + Supabase + Turborepo monorepo.
- Repo created at `popntot/writer_os` (private).
- Project relocated from iCloud (`~/Library/Mobile Documents/com~apple~CloudDocs/Writer_OS`) to `~/Code/writer_os` — git in iCloud is unsafe due to silent corruption from sync of `.git/` internals.
- `AGENTS.md` written as the cross-tool substrate; `docs/agents/{issue-tracker,triage-labels,domain}.md` configured via `/setup-matt-pocock-skills`.
- Memory system seeded with user profile, communication style, grilling methodology, SME-informed standing instruction, project pointer, and repo reference.
- Cross-machine prework: `.gitignore`, `.editorconfig`, `.gitattributes` (line-ending normalization), `README.md`, `docs/onboarding.md`, `docs/session-log.md`.
- Branch + commit conventions documented in [`AGENTS.md`](../AGENTS.md).
- Initial commit pushed to `origin/main`.

**Next session pickup, in order:**

1. **`/to-prd`** — publish [`docs/prd.md`](prd.md) to GitHub Issues with `needs-triage` label so it enters the tracker flow.
2. **`/to-issues`** — slice the published PRD into tracer-bullet vertical-slice issues, AFK-ready.
3. **ADRs** — write the four ADR candidates identified in the PRD's "Next deliverables":
   - `ADR-0001: Mentor neutrality (craft, not ideology)` — most nuanced reasoning, do first while still fresh
   - `ADR-0002: Pipelined voice stack over realtime voice APIs`
   - `ADR-0003: Cloud-first hybrid storage with document-shaped agent layer`
   - `ADR-0004: One source of truth + interface projection (not dual data architecture)`
4. **Sandcastle harness setup** — `.sandcastle/` config (Dockerfile, prompt.md, main.ts), AGENTS.md expansion with deep-module rules + AFK escalation rules.
5. **Account/key provisioning** — Cloudflare, Supabase, Anthropic, ElevenLabs accounts; secrets storage (1Password CLI recommended).
6. **First package scaffolding** — once ADRs and harness are in place: monorepo skeleton (Turborepo + pnpm), then the first vertical slice issue picked up by Sandcastle.

**Open threads / things to remember:**

- AGENTS.md will need expansion before Sandcastle runs — add deep-module rules (Ousterhout), test-as-success-criterion principle, AFK escalation rules ("when blocked, tag PR `ready-for-human`").
- Pre-commit hooks deferred until first package exists. Use `/setup-pre-commit` skill when ready.
- CI (GitHub Actions) deferred until first tests exist.
- Apple Speech transcription quality outdoors needs real-world testing — cloud Whisper as fallback if needed (Phase 2 escape valve).
- Mentor system (Phase 2) needs the curated craft-not-ideology principle — flagged as ADR-0001.
- The 1M-context Claude Opus model used for the grilling session is excellent for synthesis; switch to Sonnet 4.6 for routine work to manage cost.

**v0.1 success criterion**: user takes 4+ thinking walks per week on the app for 4 consecutive weeks without forcing themselves. If true → validate productization. If false → design is wrong before build is wrong.

**Session metrics (for self-calibration):**

- Length: ~6 hours of grilling + scaffolding
- Output: 1 PRD (~5,800 words), 1 AGENTS.md, 3 docs/agents config files, 6 memory files, README, .editorconfig, .gitattributes, .gitignore, onboarding doc, this session log
- Subjective quality: high — the methodical grilling pace produced sharp decisions; would recommend the same pace for future architecture sessions.
