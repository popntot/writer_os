# ADR-0001: Mentor Neutrality — Craft Is in Scope, Ideology Is Not

**Status**: Accepted
**Date**: 2026-05-06
**Deciders**: Will (founder/PM)
**Supersedes**: —
**Related**: PRD §"Mentor system", PRD §"Further Notes → Mentor neutrality (ADR candidate)"

---

## Context

Writer OS plans to ship a **Mentor system** in Phase 2. Mentors are user-selectable craft profiles drawn from subject-matter experts (Heath brothers on stickiness, Albrighton on clarity, Strunk & White on economy, Fitzpatrick & Hunt on pedagogical structure, etc.). A Mentor influences how the agent supports the writer — suggesting structures, sentence-level edits, argumentation patterns — within the writer's own work on a Project.

Every SME comes with two layers entangled: their **craft** (the technical principles they teach) and their **worldview** (the political, cultural, or ideological convictions woven into their examples, framings, and selection of what's worth teaching). Naive ingestion of an SME's corpus pulls in both. Without a hard boundary, Mentors will silently propagate the SMEs' worldviews into the user's writing — which fundamentally violates the product's premise that the writer's voice and convictions are sovereign.

This is not a hypothetical risk. It is the default failure mode of an SME-informed AI writing tool. Locking the boundary now — before any Mentor is designed, before any source is curated, before any system prompt is written — forces every downstream design decision through the right filter from the start.

This is also the most consequential ethical decision in the product. It deserves a formal record.

## Decision

The Mentor system is scoped strictly to **writing craft**: structure, sentence rhetoric, narrative pacing, argument patterns, pedagogical scaffolding, economy of expression, stickiness mechanics. Mentors **do not** propagate the ideological positioning, political bias, or worldview of source SMEs onto the user's work.

The neutrality constraint applies to **system-initiated behavior**, not to user-initiated requests. Specifically:

- **System-initiated** (constrained, craft-only): Mentor application during sessions, writer-profile inference, autonomous framing in agent-generated artifacts (outlines, drafts, scratchpad entries), theme suggestions, anything the agent produces without an explicit user directive about frame or stance.
- **User-initiated** (always honored): if the user explicitly asks the agent for help framing their work in a particular ideology, register, tradition, or worldview ("draft this from a libertarian frame," "rewrite in a feminist register," "make this read like a Catholic moral argument"), the agent treats it as a craft request and gives full assistance. The user's voice is sovereign; an explicit ask for a frame is itself an act of voice.

**v1 disposition: restrictive.** When the craft/ideology line is genuinely ambiguous, default to craft-only and strip framing. Relax with evidence and user feedback in later versions, never the other direction.

## Alternatives Considered

### Alternative A: Ideology-aware Mentors that match user perceived politics
The agent infers the user's political/cultural leanings from their writing and selects Mentors and framings to match.

**Rejected.** Muddies the craft/belief boundary by design. Forces the platform into editorial responsibility for what users believe. Creates an opaque feedback loop where the agent reinforces whatever it inferred, including misinferences. Introduces a privacy and surveillance surface (the user's politics, modeled and stored). Makes the product a partisan tool rather than a craft tool.

### Alternative B: No Mentors at all
Strip the Mentor concept entirely; ship only generic craft principles in the base agent.

**Rejected.** The SME-informed craft layer is a real product differentiator. Generic LLM writing assistance is commoditized. A curated, named library of craft profiles — with the worldview cleanly separated out — is one of the few defensible value props for this product.

### Alternative C: Soft neutrality (best-effort, no hard rule)
Treat neutrality as a goal rather than a constraint; rely on the base model's existing "neutrality" tuning.

**Rejected.** Base model neutrality is unreliable, drifts across model versions, and offers no auditable surface. Without a hard rule, neutrality erodes through curation choices nobody notices: which examples ship in the system prompt, which interview clips get embedded, how a Mentor's description is phrased. A formal rule is the only thing that survives turnover in model versions, prompts, and curation hands.

## Consequences

### Curation rules

1. **Mentor descriptions never frame in author-identity terms.** A Mentor is described as "argument scaffolding for hard pedagogical questions" — not "write like Fitzpatrick & Hunt." The Mentor's name may credit the SME, but the user-facing pitch is craft, not identity.
2. **No wholesale corpus ingestion.** Encode principles in system prompts plus curated knowledge bases (interviews, public talks, public-domain or fair-use snippets, the user's own notes). This is a license/copyright requirement *and* a neutrality requirement: wholesale ingestion drags worldview in by accident.
3. **Curation filter:** if a Mentor's craft cannot be expressed without their worldview, that Mentor does not belong in the library. The test: can a writer with the opposite politics use this Mentor and feel served, not subverted?
4. **System prompts include explicit anti-bias instructions** scoped to system-initiated behavior. Phrasing is owned by the prompt-engineering pass, not this ADR.
5. **Single-curator at MVP.** Will is the sole Mentor-library curator through v0.1 / Phase 2. A formal review process is deferred to productization.

### Agent behavior rules

6. **System-initiated framing is craft-only.** When the agent autonomously chooses how to frame, structure, or articulate something on the user's behalf, it draws on craft alone. No worldview projection from inferred user profile, Mentor selection, or training priors.
7. **User-initiated framing is honored without disclaimer.** The agent does not editorialize, hedge, or refuse when the user asks for a specific frame. It gives full craft assistance for the requested register.
8. **Writer-profile inference is constrained to craft preferences.** The agent may infer "this writer prefers short sentences, builds arguments inductively, favors concrete examples over abstractions." It may not infer or persist "this writer leans progressive / conservative / religious / secular" as a profile attribute that influences future system-initiated behavior.

### Audit and accountability

9. **Phase 2 ships a bias audit feature.** The user can ask the agent: *"did any framing slip in from your training, your prompts, or the Mentors I have active?"* The agent introspects against the active Mentor list and system prompt, and surfaces risks honestly. Phase 2 deliverable, not v0.1.
10. **System prompts and Mentor descriptions are versioned and inspectable.** Any framing decision encoded in prompts can be reviewed after the fact. Implementation: prompts live in `packages/prompts/` (per PRD architecture), versioned in git, never injected from runtime config.

### Sequencing

11. **This ADR gates Phase 2.** Mentor system design begins after this ADR is accepted; not before. v0.1 (iOS MVP) ships with the base agent's bundled craft principles only — no formal Mentor library yet. The constraint still applies to that base agent.

## Open Questions

- **Bias audit UX**: how the user invokes it, how the agent's introspection is presented. Phase 2 design problem; out of scope here.
- **Disagreement handling**: if a user reports a Mentor's output felt biased, what's the triage process? Single-curator at MVP makes this informal; formalize at productization.
- **Mentor combination**: PRD specifies single Mentor per Project. Whether multiple Mentors can ever be layered (e.g., "Heath structure + Strunk economy") is a Phase 2 design question; the neutrality rule applies regardless.

## Notes

The cleanest litmus test for any future Mentor design decision:

> Could a writer whose politics are the opposite of the source SME's use this Mentor and feel served, not subverted?

If yes, ship. If no, redesign or drop.
