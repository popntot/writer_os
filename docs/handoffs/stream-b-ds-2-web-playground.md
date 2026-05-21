# Stream B DS-2 Web Visual Reference Playground

I tackled the DS-2 web visual reference playground for issue #43: a disposable,
no-build static `apps/web/` oracle for the locked minimal Writer OS design
system. The work ports the canonical minimal prototype into separate static
screen files and keeps the CSS custom-property surface aligned with the checked-in
style guide.

## What Landed

No commit SHAs landed in this session because Git writes are blocked by sandbox
permissions. This worktree's Git metadata lives at
`/Users/williamgreen/Code/writer_os/.git/worktrees/writer_os-stream-b`, outside
the writable roots, so `git add` cannot create `index.lock`.

Files produced:

- `apps/web/index.html`
- `apps/web/css/tokens.css`
- `apps/web/css/primitives.css`
- `apps/web/screens/today.html`
- `apps/web/screens/walk.html`
- `apps/web/screens/close.html`
- `apps/web/screens/article.html`
- `apps/web/screens/source.html`
- `apps/web/screens/system.html`
- `apps/web/README.md`

The six screens shipped are Today, Walk, Close, Article, Source, and System.
Each screen links the shared token and primitive CSS files and exposes the
light/night tone toggle through `data-tone="light|night"` on `<html>`.

## Still Owed

Commit, push, PR creation, PR labeling, and writing the handoff to the requested
main checkout path are still owed because this sandbox cannot write to the shared
Git directory or `/Users/williamgreen/Code/writer_os/docs/handoffs/`.

`pnpm typecheck` is also blocked here because the worktree has no complete
`node_modules`; `turbo` is unavailable, and `pnpm install --offline
--frozen-lockfile` is missing `@cloudflare/workers-types` from the local store.

Browser console verification is partially blocked. The Browser plugin requires a
Node REPL control surface that is not exposed in this session. The macOS `open`
command also fails because no default `.html` handler is registered in this
environment.

## Non-Obvious Decisions

I kept `tokens.css` limited to the CSS custom properties that appear verbatim in
`writer-os-minimal-design-system-style-guide.md`: color, shadow, serif, and mono
tokens. The issue text mentions `--inactive`, typography sizes, spacing, and rule
weights as custom properties, but the source style guide does not define those
custom-property names. To preserve the token-name parity acceptance criterion, I
used literal CSS values for spacing, type sizes, and 1px rules in
`primitives.css` rather than inventing DS-2-only variables.

The tone toggle is intentionally inline and duplicated across static pages. That
keeps the app no-build and avoids adding a third shared asset beyond the required
CSS split. It stores the selected tone in `localStorage` when available, while
falling back cleanly on `file://` or restricted contexts.

The Close screen copy uses filed/captured/next/open language and avoids
false-finish wording.

## Open Questions For The Queen

The only token-name ambiguity I saw is `--inactive`: issue #43 calls it out, but
the style guide treats inactive navigation as `--ink-3` and does not define an
`--inactive` custom property. I chose the style guide as authoritative and did not
create `--inactive`.

Likewise, the issue asks for typography sizes, spacing, and rule weights in
`tokens.css`, but the style guide names those as scale rows and values, not CSS
custom properties. If Stream A's `docs/interfaces/design-system.md` introduces
formal names for those, integration review should decide whether DS-2 should add
them after #42 lands.

## Cross-Stream Artifacts

`apps/web/` is the produced visual reference oracle. Consumers are DS-3/4/5
reviewers and the future Phase-1.5 web port when they need to compare against the
locked minimal editorial intent.
