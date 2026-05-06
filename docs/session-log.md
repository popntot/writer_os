# Session Log

Reverse-chronological log of work shipped across sessions. Each entry: what got done, what's next, open threads.

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
