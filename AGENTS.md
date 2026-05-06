# Writer OS — Agent Substrate

This file is the shared context that every AI coding agent (Claude Code, Codex, etc.) reads before working on this repo.

## Project

Writer OS — voice-first thinking partner for writers. See `docs/prd.md` for the full product requirements document.

## Agent skills

### Issue tracker

GitHub Issues at `popntot/writer_os` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. `CONTEXT.md` and `docs/adr/` at repo root, both created lazily. See `docs/agents/domain.md`.

## Conventions

### Branches

- Issue branches: `issue/<number>-<short-slug>` (e.g., `issue/42-inbox-triage-confidence`)
- Feature branches without an issue: `feat/<short-slug>`
- Fix branches: `fix/<short-slug>`
- Never force-push to `main`.

### Commits

- Conventional Commits format: `<type>(<scope>): <subject>`
  - `type` ∈ `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`
  - `scope` is the affected package or area (optional)
  - subject is imperative ("add X", not "added X")
- Examples:
  - `feat(api): add InboxTriageEngine deposit endpoint`
  - `docs(prd): clarify out-of-sync detection rules`
  - `chore: update .gitignore for Sandcastle artifacts`
- Multi-line commits welcome. First line is summary; body explains *why*.

### Versioning

- `v0.1` = initial iOS MVP (passes the 4-walks-per-week-for-4-weeks success criterion in `docs/prd.md`)
- `v0.2` = Phase 1.5 web app shipped
- `v1.0` = productization-ready (multi-tenant, billing, public)
- Tag major milestones with `git tag` + push tags. Otherwise lightweight; no per-release versioning until productization.

### Code style

- TypeScript: strict mode, explicit return types on public APIs.
- Swift: SwiftUI defaults, no metaprogramming, conventional Apple idioms (this codegen target is more conservative than the language allows).
- Markdown: hard-wrap at 100 chars in code; soft-wrap in prose.
- Line endings: LF only (enforced via `.gitattributes`). Cross-machine consistency.
- Indentation: 2 spaces (4 for Swift), tabs in Makefile only. Enforced via `.editorconfig`.

### Deep modules

Every new module should aim for [Ousterhout's deep-module principle](https://web.stanford.edu/~ouster/cgi-bin/aposd.php): small public interface, lots of hidden complexity, change-resistant. Test the public interface; don't test internals. The PRD's module list (`docs/prd.md` §"Modules") is the canonical inventory.

### Test-as-success-criterion

PRs ship when their issue's listed tests are green. Codex agents shouldn't claim "done" without green tests. Reviewers (human or Claude Code) verify the test list matches the issue's acceptance criteria, then verify it passes.
