ROLE: Implementer for Stream B — DS-2 web visual reference playground.
WORKTREE: /Users/williamgreen/Code/writer_os-stream-b
BRANCH: stream-b-ds-2-web-playground (already checked out)
BASE: main

DELIVERABLE (one sentence):
A no-build `apps/web/` static site that renders the locked design system's six core screens, opened with `open apps/web/index.html` or any static server, with CSS custom-property names that exactly match those defined in `docs/interfaces/design-system.md` (the doc Stream A is producing in parallel).

READ FIRST (in order):
- GitHub issue #43 via `gh issue view 43` — full scope, AC, deferred list.
- `docs/interfaces/ui style guide/writer-os-minimal-design-system-style-guide.md` — canonical token names, typography scale, spacing, state grammar, §13 acceptance checklist. THIS IS YOUR SOURCE OF TRUTH for token names since Stream A's `docs/interfaces/design-system.md` may not be merged yet — both A and B derive from this same style guide.
- `docs/interfaces/ui style guide/writer-os-ui-minimal.html` — the canonical visual prototype you are porting.
- `docs/interfaces/ui style guide/writer-os-ui-prototype.html` — secondary reference.
- `AGENTS.md` — repo conventions, branch/commit style, PR norms.

WORK ITEMS:
1. Create `apps/web/` workspace directory (NOT a turbo-orchestrated app — pure static files). Do NOT add anything to the root `package.json` `workspaces` array that would pull in framework deps.
2. Copy `docs/interfaces/ui style guide/writer-os-ui-minimal.html` to `apps/web/index.html` as the starting point.
3. Extract all `<style>` content into two files: `apps/web/css/tokens.css` (CSS custom properties only — `--ink`, `--page`, `--active`, `--ready`, `--source`, `--open`, `--inactive`, typography sizes, spacing, rule weights) and `apps/web/css/primitives.css` (component-level styles). Link both from the head of every screen file.
4. Wire light/night tone toggle via a `data-tone="light|night"` attribute on `<html>`. Tone-specific overrides live in `tokens.css` under `[data-tone="night"]`. Toggle exposed in the UI per the prototype.
5. Build six static screen pages under `apps/web/screens/`:
   - `today.html` — date lockup + Walk/Desk switch + primary question + ≤3 quiet rows.
   - `walk.html` — timer + one captured thought + minimal capture control. NO transcript feed.
   - `close.html` — captured note + open question + next page. Use "filed/captured/next/open" language only.
   - `article.html` — title + lede + document weather + outline beats.
   - `source.html` — source codes + blockquotes + short notes.
   - `system.html` — token examples + state examples + rules-of-restraint reference.
   Each screen composes only the primitives the style guide defines — do not invent new components or layout patterns.
6. Replace `apps/web/index.html` (after step 2's copy) with a top-level index that lists the six screens with hairline-rule separation between entries.
7. Write `apps/web/README.md` with a one-line "how to serve" command (e.g. `python3 -m http.server 5173 --directory apps/web` or `npx serve apps/web`) and a one-paragraph note that this is the **reference oracle**, not the Phase-1.5 product web app — explicitly disposable.

DEFINITION OF DONE:
- `apps/web/index.html`, `apps/web/css/tokens.css`, `apps/web/css/primitives.css`, six `apps/web/screens/*.html` files, and `apps/web/README.md` all exist and validate as HTML5 / CSS.
- All CSS custom-property names used in `apps/web/` appear in `docs/interfaces/ui style guide/writer-os-minimal-design-system-style-guide.md` (verified via grep — include the grep command output in the PR description as proof per issue #43 AC).
- Each of the six screens opens with `open apps/web/screens/<name>.html` and renders without console errors.
- Light + night toggle works and is testable by clicking the toggle on any screen.
- WCAG AA contrast on body text in both tones (use a contrast checker — list ratios in PR description).
- Zero framework dependencies added; root `package.json` workspace array unchanged or only adds the bare `apps/web` entry (no new deps, no build script).
- `pnpm typecheck` still green at repo root.

OUT OF SCOPE (do not touch):
- `apps/ios/` — that's Stream A's territory.
- `apps/api/`, `packages/*` — not part of this slice.
- Any existing iOS view file. Foundation only.
- Adding React, Next.js, Vite, Webpack, or any build step. Pure static HTML/CSS.
- Bottom-nav routing — each screen is its own .html file with the nav as plain links.
- Mobile-viewport responsiveness beyond what the source prototype already does.
- Editing `docs/interfaces/design-system.md` — that file is Stream A's deliverable. Reference it conceptually but do not create or edit it.

COORDINATION:
- Consumes (from Stream A, possibly not yet merged): `docs/interfaces/design-system.md` (token names, primitive contracts). Since A may not be merged when you run, fall back to the source style guide. The token names in both sources MUST match — if you find any drift after A merges, that's a bug for the integration review, not for you to fix.
- Produces (for downstream design-system reskins DS-3/4/5 and human review): `apps/web/` as the visual reference oracle. When iOS doesn't match the visual intent, this is what gets compared.

CLOSEOUT (mandatory, do this last):
1. Run DoD checks: open each screen file, verify no console errors (grep for any `console.error` strings emitted), run the grep for CSS custom properties against the style guide markdown, run `pnpm typecheck` at repo root.
2. Commit your work in logical units (suggest: setup + css extraction; six screens as one commit or split if large; README + index). Commit message style follows `git log --oneline -10` patterns: `feat(#43): <subject>`.
3. Open a PR against `main` with title `feat(#43): web visual reference playground — apps/web/` and body that:
   - Closes #43.
   - Includes the CSS-custom-property grep output proving token-name parity with the style guide.
   - Includes WCAG AA contrast ratios for body text in both tones.
   - Notes that final merge depends on Stream A (#42) landing first so token names can be re-grepped against `docs/interfaces/design-system.md`.
   - Applies the `ready-for-agent` label (review-ready) or `ready-for-human` if blocked.
4. Write `/Users/williamgreen/Code/writer_os/docs/handoffs/stream-b-ds-2-web-playground.md` (overwrite if exists). First-person, functional tone, readable cold. Cover:
   - What this stream tackled (one paragraph).
   - What landed (commit SHAs, file paths, screens shipped).
   - What's still owed and why (e.g. if any AC item deferred, justify).
   - Non-obvious decisions you made (CSS architecture choice, tone-toggle mechanism, any deviation from the prototype).
   - Open questions for the Queen (especially: any token-name ambiguities you saw between the style guide and the prototype HTML).
   - Cross-stream artifacts produced: `apps/web/` (consumer: DS-3/4/5 reviewers, future Phase-1.5 web port).
5. Exit. Do not poll for review feedback — the Queen will hand back via this same channel.

If at any point you find the source style guide and prototype HTML disagree on a token name or visual primitive, do NOT guess — pick the style guide markdown as authoritative, note the divergence in your handoff under "Open questions for the Queen", and continue.
