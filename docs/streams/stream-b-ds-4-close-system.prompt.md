ROLE: Implementer for Stream B — DS-4 Close + System reskin.
WORKTREE: /Users/williamgreen/witer-os-git/writer_os-stream-b
BRANCH: stream-b-ds-4-close-system (already checked out by Queen)
BASE: main (commit a42170c)
ISSUE: popntot/writer_os#45

DELIVERABLE (one sentence):
Reskin the session-close flow (Close, replacing SessionEndCoordinator's UI) and the system/settings surfaces (System, subsuming SettingsView + ConfigSetupView + DumpView) to compose only DS primitives, per §7 and §10 of the style guide, with no semantics changes to `SettingsStore` or routing.

READ FIRST (in order):
- docs/interfaces/design-system.md                                                      (locked DS-1 interface doc, §13 checklist applies)
- docs/interfaces/ui style guide/writer-os-minimal-design-system-style-guide.md         (§7 System, §10 Close — source spec, especially §1 "rules of restraint")
- apps/ios/WriterOS/DesignSystem/Tokens.swift + Primitives/*.swift                       (DS primitives you compose)
- apps/ios/WriterOS/SessionEndCoordinator.swift                                         (the UI this PR reskins; preserve `SessionEndCoordinator` model + routing)
- apps/ios/WriterOS/SettingsView.swift, SettingsStore.swift, Settings.swift             (controls + store; reskin visuals only, do NOT change `SettingsStore` semantics)
- apps/ios/WriterOS/ConfigSetupView.swift                                               (API key + server URL controls; preserve first-launch routing)
- apps/ios/WriterOS/DumpView.swift                                                      (TrueLine + version readout; embed read-only under Spine section)
- apps/ios/WriterOS/RootView.swift                                                      (read-only — how these views are routed)

WORK ITEMS:
1. Rewrite the visual layer rendered by `SessionEndCoordinator` so it produces a Close surface:
   - `PageShell` outer.
   - Three blocks top-down:
     a. **Captured note** — the session's most recent contribution, serif paragraph.
     b. **Open question** — consolidation worker's surfaced open question, as a `PrimaryQuestion` if present. Truncate the language to file-not-finish vocabulary (§10).
     c. **Next** — `QuietRow` with state `ready`, label `Next`, title = next-session starter (from ConsolidationWorker output already plumbed through SessionEndCoordinator), body = one-line context.
   - Bottom: single text button `Return` (mono uppercase, hairline-bordered). Tap → return to Today (existing routing).
   - **Forbidden-verb grep gate**: search the diff for `completed`, `resolved`, `done`, `optimized` in any new user-facing copy. None permitted (§10). Report grep output in PR body.
2. Build a new `SystemView.swift` that subsumes Settings + ConfigSetup + Dump:
   - `PageShell` outer; single scrolling page.
   - Sections separated by ink-weight 1pt rules. Each section header: serif 28pt.
   - Sections in order:
     - **Audio** — capture defaults + retention controls (lifted from `SettingsView` — same bindings, reskinned).
     - **Identity** — API key + server URL controls (lifted from `ConfigSetupView` — same bindings, reskinned).
     - **Spine** — read-only dump of current project's TrueLine + version (from `DumpView` — same data, reskinned).
     - **Rules of restraint** — static prose, lifted verbatim from §1 of the style guide.
   - Compose primarily `QuietRow`. If a row pattern (label + value + optional control) recurs and feels generic, introduce `SystemSpecRow` as a local primitive AND amend `docs/interfaces/design-system.md` to upstream it (§13 says new colors/fonts/spacing require a paired doc PR — same rule for new primitives).
   - No segmented controls, no nav bars, no SF Symbol icons.
3. Route changes:
   - `SettingsView`, `ConfigSetupView`, `DumpView` → still present as files but no longer reachable through normal navigation. Either delete them after migrating their bindings to SystemView, or leave them as shims that route to SystemView's relevant section. Pick one and justify in the PR body.
   - First-launch flow that gates on missing API key MUST still work — SystemView's Identity section must be reachable pre-login, or `ConfigSetupView` retained as the gating screen with reskinned visuals.
4. Snapshot tests under `apps/ios/WriterOSTests/DesignSystem/`:
   - `CloseSurfaceSnapshotTests.swift` — light + night, with and without open question.
   - `SystemViewSnapshotTests.swift` — light + night, two anchor scrolls (top: Audio + Identity, mid: Spine + Rules).

DEFINITION OF DONE:
- SessionEndCoordinator UI renders the three Close blocks; no other content.
- Forbidden-verb grep gate runs and passes (capture grep output in PR body).
- SystemView renders all four sections; SettingsView/ConfigSetupView/DumpView functionality preserved (list each preserved binding in PR body — no feature regression).
- First-launch routing still gates on missing API key.
- `SettingsStore` semantics UNCHANGED (verify via `git diff -- apps/ios/WriterOS/SettingsStore.swift apps/ios/WriterOS/Settings.swift` — should show empty diff).
- §13 acceptance checklist documented in PR body for both Close and System.
- Snapshot tests green (light + night). Existing XCTests still pass.
- `pnpm typecheck` green from repo root.
- Logical commits:
  1. `feat(#45): Close surface composes DS primitives — three-block layout`
  2. `feat(#45): SystemView subsumes Settings + ConfigSetup + Dump`
  3. `chore(#45): retire (or shim) replaced settings views`
  4. `test(#45): snapshot tests for Close + System`

SANDBOX LESSONS (apply verbatim):
- The Codex sandbox CANNOT write to `.git/worktrees/<name>/index.lock` and cannot push branches. DO NOT attempt `git commit` / `git push` / `gh pr create`. Instead: leave a clean working tree of staged-but-not-committed changes AND emit one `git format-patch`-shaped patch per logical commit, written to `./_dispatch/stream-b-<n>-<short-title>.patch`. The Queen applies them outside the sandbox via `git am`.
- The Codex sandbox CANNOT run the iOS simulator. Run what you can: `pnpm typecheck`, `xcodebuild build` (build-for-testing only — no simulator runtime). The Queen runs the simulator suite outside the sandbox before merge.
- Write your handoff to `docs/handoffs/stream-b-ds-4-close-system.md` covering: what shipped, retire-vs-shim decision for replaced views, verified/unverified gates, follow-ups.
