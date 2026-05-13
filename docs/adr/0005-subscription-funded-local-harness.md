# ADR-0005: Subscription-Funded Local Harness, Not Autonomous Cloud Execution

**Status**: Accepted
**Date**: 2026-05-12
**Deciders**: Will (founder/PM)
**Supersedes**: PRD §"Build approach (AFK)" insofar as it implied a cloud Sandcastle deployment as the target runtime
**Related**: PRD §"Build approach", `docs/agents/harness.md`, AGENTS.md §"Escalation"

---

## Context

The PRD's "Build approach (AFK)" section originally described the build runtime as a cloud-deployed Sandcastle harness — a `parallel-planner-with-review` template running on a Vercel sandbox, picking up `ready-for-agent` issues 24/7, opening PRs without Will at the keyboard. The framing pulled hard on AFK ("away from keyboard") as both the orchestration pattern and the operational mode.

In practice, through the first eight cycles (issues #2–#7), the build has run a different shape: a **local** Claude Code + Codex CLI parallel-planner-with-review harness on Will's Mac, funded entirely by his Claude Max + Codex Plus subscriptions. Will is at the keyboard for every cycle — he picks the issue, watches the pass, reviews the PR, merges. No cloud sandbox is provisioned.

This started as a Phase A / Phase B / Phase C cost ramp ("local now, cloud later post-#10 GO"). After enough cycles to test the assumption, the upgrade path no longer makes sense to plan for. The reasons:

1. **Codex first drafts still need substantive review.** At the current LLM capability tier, Claude Code routinely rewrites parts of Codex's diff (see PR #24 retrospective in session log; ADR-pinned three-outcome review rule in `docs/agents/harness.md`). Moving the sandbox to the cloud doesn't change that — review still happens, just somewhere else. The bandwidth gain of 24/7 autonomous execution is partly fictional if review is the bottleneck.
2. **Subscription cost is fixed and predictable** (~$0/mo additional, on top of subs already paid for general use). Pay-per-token economics of an autonomous cloud harness invert that: cost scales with iteration count, and bad cycles cost as much as good ones.
3. **Will's real-time judgment is load-bearing.** Many cycles surface a small product or architectural call (a deviation from AC literal text, a paid-key blocker, a "is this slice still scoped right?") that Will can answer in the next chat message. Autonomous mode forces those into formal `ready-for-human` escalations or, worse, into the cycle's blind spots.
4. **The local pattern's actual advantage is legible now.** It's not "Will is away from keyboard." It's "Claude and Codex split the keystroke load while Will retains decision authority in real time." That's a different and probably better proposition than the AFK framing suggested.

## Decision

The Writer OS build runs on a **local, subscription-funded harness** as the steady state, not as a stepping stone to cloud autonomous execution.

- **Roles** (per `docs/agents/harness.md`): Claude Code (Opus 4.7, high effort) plans + reviews; Codex CLI (GPT-5.4) implements first pass; Will picks issues, decides escalations, merges PRs.
- **Cost surface**: Claude Max + Codex Plus subscriptions only. No autonomous cloud sandbox is provisioned.
- **Cloud Sandcastle (or any equivalent autonomous-cloud setup) is rejected**, not deferred. The PRD's "Phase C" cost line is removed from the harness doc.

The decision is **not permanent** — it stays valid until the LLM capability gap closes enough that Codex first drafts pass review without substantive rewrite at a high rate, OR Will's bandwidth becomes the explicit bottleneck (not Codex throughput, not API cost). Either trigger opens a fresh decision, and this ADR is the thing to revisit.

## Alternatives Considered

### Alternative A: Cloud Sandcastle as the target runtime (original PRD framing)
A cloud-deployed `parallel-planner-with-review` harness picks up `ready-for-agent` issues automatically. Will reviews/merges PRs asynchronously.

**Rejected** because:
1. Review is the bottleneck, not implementation throughput. Moving the sandbox to the cloud doesn't shorten the review queue.
2. Pay-per-token cost is unbounded; sub cost is fixed.
3. Will's in-session judgment is load-bearing for cycles that surface product or architectural calls. Async escalation rituals are heavyweight relative to the cost of asking a chat question.

### Alternative B: Hybrid (local now, cloud after #10 GO)
Run local through MVP; flip to cloud after the real-walk smoke test validates the product.

**Rejected** because the trigger for the flip wasn't really "MVP validates" — it was "Codex is good enough that review is rubber-stamping." That's a model-capability event, not a product-validation event. Tying the runtime upgrade to a product milestone confuses two independent decisions.

### Alternative C: Pay-per-token API directly (no Codex sub, no Claude Max sub)
Drive both planner and implementer through pay-per-token APIs from a thin local script.

**Rejected** because subs are already paid for general use; marginal cost of the harness on top is zero. Switching to per-token would add cost without adding capability.

## Consequences

### Runtime model
1. **Will at keyboard is the default.** Cycles do not run while Will is asleep, walking, or otherwise unavailable. This is a feature, not a limitation.
2. **In-session escalation is the default mechanism.** Claude Code surfaces decisions in chat with 2–3 options + a recommendation. The formal `ready-for-human` PR-label ritual is reserved for cases where Will has explicitly signaled "I'm stepping away, run as far as you can without me" — and even then, the slice should reach a safe checkpoint and stop rather than try to autonomously navigate ambiguity.
3. **No cloud sandbox to maintain.** Saves the operational tax of a deployed service that wasn't pulling its weight.

### Cost model
4. **Harness cost is $0/mo additional.** Claude Max + Codex Plus. The cost surfaces that matter are paid API keys for *runtime* (Anthropic for the production Worker's conversational LLM, ElevenLabs for production TTS) — those are unchanged by this ADR.
5. **The PRD's Phase A / B / C ramp collapses to just Phase A and Phase B.** Phase A = subs + free tiers, no paid keys. Phase B = subs + runtime paid keys provisioned as slices need them (Anthropic at #6, ElevenLabs at #8). There is no Phase C in the build cost model.

### Process
6. **PRD user stories #62–66 ("AFK build workflow") are reinterpreted as delegated-cycle stories,** not autonomous-cycle stories. The discipline they encode (explicit ACs, scope boundaries, Claude reviews every Codex PR, fail-loud escalation, single AGENTS.md substrate, observability) is still right — it just describes the local harness, not a deferred cloud one.
7. **The word "AFK" is retired from new docs.** Where it appears in `AGENTS.md`, `docs/agents/harness.md`, or PRD, prefer "delegated cycle" (work delegated to Claude+Codex while Will retains decision authority) or just plain language. Existing session-log entries are left alone — they're historical records.

### Revisit triggers
8. **Revisit when either of these fires:**
   - Codex first-draft acceptance rate (no Claude rewrite + ≤1 re-prompt) sustains above ~80% across 10+ consecutive slices. At that point, autonomous execution starts to actually compress wall time, not just relocate review.
   - Will's bandwidth (not the LLMs', not the API cost) becomes the explicit bottleneck on shipping. Today it isn't.
9. **If the budget shape changes** (e.g., the project gets funded such that pay-per-token is the natural cost model, or productization requires a cloud build pipeline for hand-offs), this ADR's economic argument weakens and it's worth a fresh look.

## Notes

The original PRD's "Sandcastle / cloud AFK" framing was reasonable on paper and reflected the best available pattern at draft time. It didn't survive contact with the actual cycles. This ADR records the path-not-taken so a future reader (or Will revisiting in 6 months) doesn't mistake the local harness for a temporary scaffold.

The decision is reversible by writing a superseding ADR. Don't reverse it on intuition — reverse it on the trigger conditions in Consequence #8.
