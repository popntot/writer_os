# @writer-os/api

Cloudflare Worker API for Writer OS. Hono framework, Drizzle ORM, bearer-secret auth.

## Local development

Local dev uses `wrangler dev` against either a local Postgres (Supabase started locally) or a remote Supabase project. PGlite is used in tests, not in `wrangler dev`.

```sh
# Set local secrets
cp .dev.vars.example .dev.vars
# Fill in the values per the comments in the file.

# Run the Worker locally
pnpm dev
```

The Worker exposes:

- `GET /health` — public, no auth
- `GET /projects` — auth required
- `POST /projects` — auth required; body `{ title: string, type?: string }`

Auth header on protected endpoints:

```
Authorization: Bearer <WRITER_OS_API_SECRET>
```

## Tests

Tests use `@electric-sql/pglite` (Postgres in WASM) so they require zero external services. The migration SQL from `packages/db/src/migrations/` is applied to a fresh PGlite instance per test run; the Hono app is constructed against a Drizzle client wrapping PGlite.

```sh
pnpm test
```

Note: after adding a new workspace dependency (e.g. a new `packages/*` consumed here), the first test run must be `pnpm test` (turbo) so the dependency's build runs first. `pnpm --filter @writer-os/api test` skips upstream builds and will fail to resolve the new package until turbo has built it once.

## Deployment

Deferred until production secrets are provisioned. Once `WRITER_OS_API_SECRET` and `DATABASE_URL` are set via `wrangler secret put`, deploy with:

```sh
pnpm deploy
```
