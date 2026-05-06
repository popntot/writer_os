# Onboarding

Read this when:

- You're a fresh Claude Code (or Codex, or any AI agent) session in this repo
- You're a returning user on a new machine
- You haven't seen this project before

## Read these in order

1. **[`README.md`](../README.md)** — what this project is in 30 seconds
2. **[`docs/prd.md`](prd.md)** — the full product requirements (architecture, scope, decisions, modules, testing approach). The PRD is the source of truth for product specs. Don't rederive product details from conversation; consult the PRD.
3. **[`AGENTS.md`](../AGENTS.md)** — shared substrate for AI coding agents (links to `docs/agents/*` for tracker, label vocabulary, domain doc layout)
4. **[`docs/session-log.md`](session-log.md)** — what's been done so far across sessions; what's next; open threads
5. **[`docs/adr/`](adr/)** — Architecture Decision Records, when they exist, capture the *why* behind locked decisions
6. **[`CONTEXT.md`](../CONTEXT.md)** — domain glossary (created lazily — may not exist yet)

If you have memory entries from a prior session in this project, they auto-load. Memories live at `~/.claude/projects/-Users-<user>-Code-writer_os/memory/` and contain user preferences + collaboration style. Memories are per-machine; they don't sync via git or iCloud.

## Setting up on a new machine (laptop, etc.)

```bash
# 1. Verify tools (should already have these — gh and git are pre-existing)
which gh && which git

# 2. Authenticate gh CLI (opens a browser)
gh auth login

# 3. Clone the repo
mkdir -p ~/Code
gh repo clone popntot/writer_os ~/Code/writer_os
cd ~/Code/writer_os

# 4. Open Claude Code in the project directory and start working.
```

### Optional: copy memories from primary machine

Memories aren't load-bearing — the docs above contain the substantive context — but they make future sessions faster to onboard.

```bash
# From the primary machine, push memories to a shared location, then pull on the new machine.
# Example using rsync over SSH (replace with your hostname):
#   rsync -av ~/.claude/projects/-Users-papa-Code-writer_os/memory/ \
#     papa@laptop.local:~/.claude/projects/-Users-papa-Code-writer_os/memory/
```

If memories don't transfer, the new session will rebuild them organically as you work.

## What's *not* in iCloud

This repo is **not** stored in iCloud Drive. Git in iCloud causes silent corruption from sync of `.git/` internals. Cross-machine sync happens via GitHub (push from one machine, pull on another), not iCloud. **Don't move the project into `~/Library/Mobile Documents/`.**

Per-machine state that doesn't sync via GitHub:

- `gh` CLI auth — re-run `gh auth login` per machine
- `.env` files — gitignored; manually copy or use 1Password CLI to inject at runtime
- Claude Code memories — see above
- iOS Xcode signing certs / provisioning profiles — install per machine via Apple Developer portal

## Working with the AI agents

- **Claude Code** orchestrates, plans, reviews. Use it for architecture, ADRs, PRD updates, code review.
- **Codex** implements. Picks up issues from the tracker via Sandcastle (when configured) and ships PRs.
- Both read [`AGENTS.md`](../AGENTS.md) first.
- The build harness ([Sandcastle](https://github.com/mattpocock/sandcastle)) lives at `.sandcastle/` once configured.

## Common skills

| Skill | When to use |
|---|---|
| `/grill-me` or `/grill-with-docs` | Stress-test a plan or design before committing |
| `/to-prd` | Synthesize conversation context into a PRD; publish to GitHub Issues |
| `/to-issues` | Slice a PRD into tracer-bullet vertical-slice issues with `needs-triage` label |
| `/triage` | Move issues through the five-state state machine (`needs-triage` → `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`) |
| `/setup-pre-commit` | Add Husky + lint-staged + Prettier + typecheck + test hooks (use when first package exists, not before) |
| `/improve-codebase-architecture` | Find deepening opportunities in the codebase (use when packages exist) |
| `/diagnose` | Disciplined debugging loop for hard bugs |
| `/tdd` | Red-green-refactor TDD loop |
| `/ultrareview` | Multi-agent cloud review of the current branch (user-triggered, billed) |
