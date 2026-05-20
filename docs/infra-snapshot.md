# Infrastructure Snapshot

The current vendor/service surface for Writer OS. Three jobs:

1. **Reference** — single place to see every external dependency, what it does, and what env var couples us to it.
2. **Recovery / second-machine bootstrap** — enough to stand up a working dev environment without spelunking through scattered READMEs.
3. **Prompt input for future migration or IaC work** — if we ever want to move (or codify) the stack, we hand this doc to the agent and say "reproduce this elsewhere." Per the principle in [ADR-0003](./adr/0003-cloud-first-hybrid-storage.md): one managed data-plane provider, not a SaaS-per-feature accretion.

Update this doc whenever a new service, env var, or paid key enters the build. The bar: "would a fresh Will, on a fresh Mac, be missing anything to stand the stack up?"

---

## Services

### Supabase — data plane
- **Role**: Postgres (structured records), pgvector (embeddings), Storage (TrueLine bodies, source synthesis, session audio). Single managed provider per ADR-0003.
- **State location**: Supabase dashboard (project, schema, extensions, storage buckets). Schema is reproducible from `packages/db/src/migrations/` via Drizzle.
- **Env vars consumed**: `DATABASE_URL` (pooled connection — Project Settings → Database → Connection pooling).
- **Cost surface**: free tier through MVP; paid tier (Pro, ~$25/mo) gates real-walk usage.
- **Replaces (from the canonical "vibe coder stack")**: separate Postgres host, Pinecone (vector DB), separate object store. Auth is not yet wired — when it lands, Supabase Auth is the default path (avoid Clerk unless it earns its keep).

### Cloudflare Workers — API runtime
- **Role**: Hosts `@writer-os/api` (Hono + Drizzle). Stateless edge handlers in front of Supabase.
- **State location**: `apps/api/wrangler.toml` (in repo, public-safe). Secrets set imperatively via `wrangler secret put` against the deployed Worker.
- **Env vars consumed (Worker secrets in prod, `.dev.vars` locally)**:
  - `WRITER_OS_API_SECRET` — bearer-auth shared with iOS client.
  - `DATABASE_URL` — Supabase pooled URL.
  - `ANTHROPIC_API_KEY` — see below.
  - `ELEVENLABS_API_KEY` — see below.
- **Replaces**: Vercel for deploy. Single edge host; no separate domain/DNS layer yet.

### Anthropic API — LLM provider
- **Role**: Claude (Sonnet/Opus) for session turns and ConsolidationWorker, via `@writer-os/llm` (`@anthropic-ai/sdk`).
- **State location**: console.anthropic.com (prepaid credits, auto-refill OFF as a hard spend cap — same discipline as ElevenLabs).
- **Env var**: `ANTHROPIC_API_KEY` (`sk-ant-api03-...`).
- **Paid-key status**: provisioned (slice #6 onward).

### ElevenLabs — TTS
- **Role**: Streaming TTS for voice loop, via `@writer-os/tts`.
- **State location**: elevenlabs.io account.
- **Env var**: `ELEVENLABS_API_KEY` (`sk_...`).
- **Paid-key status**: $20 prepaid, auto-refill OFF (session-log session 5).

### Apple Developer — iOS distribution
- **Role**: TestFlight signing/upload for `apps/ios`. Driven by `scripts/ios-build.sh` + xcodegen.
- **State location**: developer.apple.com (team, signing certs, provisioning profiles). Local Keychain holds signing identity.
- **Env vars / inputs**: `DEVELOPMENT_TEAM` (Apple Team ID) at build time. `apps/ios/project.yml` consumes it.
- **Paid-key status**: provisioned (issue #22 — TestFlight readiness).

### GitHub — code + workflow
- **Role**: Repo, issues (work-tracking spine), PRs (review surface for the delegated cycle). Not load-bearing on any runtime path.
- **State location**: github.com (org/repo, labels, branch protection if any).
- **Env vars consumed**: none at runtime. `gh` CLI auth on dev machines.

### Local harness — Claude Code + Codex CLI
- **Role**: The build runtime per ADR-0005. Claude Max subscription + Codex Plus subscription, no autonomous cloud sandbox.
- **State location**: each Mac (`~/.claude/`, `~/.codex/`).
- **Env vars consumed**: none at app runtime. Both CLIs hold their own auth.

---

## Per-device state (not in repo)

State that lives on the developer's Mac or the user's device. Recoverable, but not via `git clone`.

- `apps/api/.dev.vars` — copied from `.dev.vars.example`, filled in with real keys.
- iOS `AppConfig` — set per-device via `ConfigSetupView` (apiBaseURL + apiSecret). Lives in app storage.
- Cloudflare Worker secrets — set via `wrangler secret put <name>`. No file artifact.
- Apple signing identity — Keychain.
- `gh` auth, `pnpm` install, Node 20+, Xcode + CLT, xcodegen — host toolchain.

When this list grows, codifying it (IaC + secret-rotation runbook) earns its keep. The tracking issue for that work is parked at **#TODO-iac-issue** below — pulled when a paid-key blocker or a new-machine onboarding forces it.

---

## What we deliberately don't run

These show up in the canonical "vibe coder stack" but are absent here on purpose. New PRs that propose adding any of them need to clear a "why not the existing stack?" bar:

| Vendor | Why we don't use it |
| --- | --- |
| Vercel | Cloudflare Workers is the edge host. |
| Pinecone | pgvector co-located with Postgres (ADR-0003). |
| Clerk | Auth is a single bearer secret today; Supabase Auth is the path when real auth lands. |
| Upstash / Redis | No cache layer yet. Worker + Supabase has been enough. |
| Sentry / PostHog | No telemetry layer yet. Add when there's a real question to answer. |
| Resend | No transactional email yet. |
| Stripe | No payments yet. |
| Namecheap / external DNS | No custom domain yet (workers.dev for now). |

The rule of thumb: **one new SaaS dependency is a decision worth pinning in an ADR or session-log entry**, not a casual `npm install`.
