ROLE: Implementer for Stream A — DS-1 design system foundation.
WORKTREE: /Users/williamgreen/witer-os-git/writer_os-stream-a
BRANCH: stream-a-ds1-foundation (already checked out)
BASE: main (commit 293ece9)
ISSUE: popntot/writer_os#42

DELIVERABLE (one sentence):
A locked `docs/interfaces/design-system.md` contract, a complete `apps/ios/WriterOS/DesignSystem/` SwiftUI primitive module (12 primitives + Tokens), snapshot tests in both light and night tones, and the updated AGENTS.md styling section — all foundation-only, no existing iOS views modified.

READ FIRST (in order):
- docs/interfaces/ui style guide/writer-os-minimal-design-system-style-guide.md  (prose spec, source of truth for tokens + state grammar + §13 acceptance checklist)
- docs/interfaces/ui style guide/writer-os-ui-minimal.html                       (canonical visual prototype — extract any pixel values not in the .md)
- docs/interfaces/trueline-store.md                                              (interface-doc shape to model design-system.md after — status header, version, contract framing)
- AGENTS.md                                                                      (find "UI / branding standing instruction" section; you will replace it per Work Item 4)
- apps/ios/project.yml                                                           (note: XcodeGen-driven project — do NOT hand-edit WriterOS.xcodeproj; if you must add new source files, they're picked up automatically because the `WriterOS` target uses path-based sources)
- apps/ios/WriterOS/RootView.swift, ChatView.swift, InboxView.swift, DumpView.swift, ProjectListView.swift  (read-only — to confirm "no existing views modified" and to see current SwiftUI conventions in the codebase)

WORK ITEMS:
1. Author `docs/interfaces/design-system.md` modeled on `docs/interfaces/trueline-store.md`. Sections, in this order:
   - Status header (locked / vN at PR-merge time — leave version blank for the Queen to fill).
   - Token contract: color light + night palettes, typography scale, spacing scale, rule weights — pulled verbatim from style-guide §3–§5 but reframed as a contract ("Light tone defines exactly these colors; new colors require a paired PR amending this doc"), not a recommendation.
   - Primitive specs: for each of the 12 Swift types listed in Work Item 2, give (a) one-sentence responsibility, (b) required props/inputs, (c) visual constraints (padding, font role, rule weight if any), (d) what it must NOT do (e.g., "BottomNav must not render icons").
   - State grammar contract: `type WriterState = "active" | "ready" | "source" | "open" | "inactive"`, as an enumerated section.
   - Acceptance checklist: §13 of the style guide, copied verbatim, framed as "every reskin PR runs against this checklist before merge".
   - Out of scope (motion beyond the spec'd 220ms fade, asset catalogs for SF Symbols, web port).
2. Build `apps/ios/WriterOS/DesignSystem/` with these files:
   - `Tokens.swift` — colors (use SwiftUI `Color(uiColor:)` + `UITraitCollection.userInterfaceStyle` switching, or asset-catalog with `Color(\"name\")` — pick whichever lets snapshot tests deterministically render both tones), typography roles (serif + mono with iOS-acceptable fallback stacks; expose as `Font` factories), spacing scale (as `CGFloat` constants), rule-weight enum (`RuleWeight.ink | .hairline | .hairline2`).
   - `Primitives/PageShell.swift` — full-screen container: 70pt left rail, 26pt right padding, 20pt top, bottom-nav safe area inset.
   - `Primitives/PageRail.swift` — narrow left margin rail; optional vertical page mark (init param).
   - `Primitives/Hairline.swift` — 1pt rule with `RuleWeight` variants.
   - `Primitives/StateDot.swift` — 6pt dot, color resolved from `WriterState`.
   - `Primitives/StateLabel.swift` — mono uppercase 9pt, tracking 0.12em (use `.tracking()`).
   - `Primitives/QuietRow.swift` — composes StateDot + StateLabel + title + one-sentence body.
   - `Primitives/PrimaryQuestion.swift` — serif 25–26pt, bounded by ink rules top + bottom; one-per-screen contract enforced via a `.primaryQuestionInstance()` ViewModifier or a documented runtime check (debug-only assertion is fine).
   - `Primitives/WorkIndex.swift` — numbered ordered list, mono numerals, reading order (NOT a checklist — no checkboxes).
   - `Primitives/DocumentWeather.swift` — terse label+value cells (think `weather strip`).
   - `Primitives/SourceNote.swift` — source label + serif blockquote + one-line context.
   - `Primitives/BottomNav.swift` — 6-tab text rail, 72pt min height, mono uppercase, equal-width tabs, NO icons.
   - `Primitives/ModeSwitch.swift` — Walk / Desk toggle, 42pt min height.
   - Add a `WriterState` enum (in Tokens.swift or its own file) matching the contract in design-system.md.
3. Add snapshot tests under `apps/ios/WriterOSTests/DesignSystem/` — one test per primitive, captured in both `light` and `night` tones. Use Xcode's built-in `XCTest` + manual snapshot comparison if you can, else add `pointfreeco/swift-snapshot-testing` as a Swift Package dependency via `apps/ios/project.yml` packages: section (justify the dep in your handoff if you add it). Reference snapshots go under `apps/ios/WriterOSTests/DesignSystem/__Snapshots__/`. The suite must be green on `xcodebuild test -project apps/ios/WriterOS.xcodeproj -scheme WriterOS -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5'`.
4. Replace the "UI / branding standing instruction" section in `AGENTS.md` (search for the heading; the section is the standing instruction locking visuals to SwiftUI defaults) with this exact block:

   ### UI / styling

   Visual style is locked to [`docs/interfaces/design-system.md`](docs/interfaces/design-system.md). All screens compose primitives from `apps/ios/WriterOS/DesignSystem/` and pass the §13 acceptance checklist before merge. Do not introduce ad-hoc colors, fonts, or spacing — extend the design system doc + primitives instead, in a paired PR.

5. The 220ms fade (specified in style guide §8 or similar — confirm by reading) must respect `UIAccessibility.isReduceMotionEnabled`. Expose this as a `WriterFade` ViewModifier or animation helper in `Tokens.swift` so callers don't reimplement it. Snapshot the static state only; don't try to snapshot motion.

DEFINITION OF DONE:
- `docs/interfaces/design-system.md` exists, modeled on `trueline-store.md`'s shape, and contains: status header, full token tables (color light + night, typography, spacing, rule weights), specs for all 12 primitives, state grammar enumeration, §13 acceptance checklist verbatim, out-of-scope list.
- `apps/ios/WriterOS/DesignSystem/Tokens.swift` plus all 12 primitive files compile under `xcodebuild build`.
- `xcodebuild test -project apps/ios/WriterOS.xcodeproj -scheme WriterOS -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5'` passes, including all new DesignSystem snapshot tests (light + night for every primitive). Previous test count (28) must still pass plus the new snapshot tests.
- `xcodegen generate` runs cleanly from `apps/ios/` (project.yml may be edited if you added a Swift Package dep; reflect that change in the file).
- `pnpm typecheck` passes from repo root (should not break — you are not touching TypeScript).
- `AGENTS.md` "UI / branding standing instruction" section is replaced with the block in Work Item 4. No other AGENTS.md sections modified.
- No file under `apps/ios/WriterOS/` modified except files inside the new `DesignSystem/` directory. (RootView, ChatView, InboxView, DumpView, ProjectListView, APIClient.swift, etc. — all untouched.)
- Logical commits, each compiling individually:
  1. `feat(#42): lock design-system interface doc`
  2. `feat(#42): add iOS design system tokens + primitive module`
  3. `test(#42): snapshot tests for all design system primitives (light + night)`
  4. `docs(#42): replace AGENTS.md UI/branding section with design-system pointer`

OUT OF SCOPE (do not touch):
- Any existing iOS view file (RootView.swift, ChatView.swift, ProjectListView.swift, InboxView.swift, DumpView.swift, ProjectDetailView.swift, etc.). Reskinning is DS-3/4/5.
- `apps/web/` — DS-2 owns the web port.
- `packages/**` — backend; not relevant to this stream.
- `apps/api/**` — backend; not relevant to this stream.
- Motion beyond the spec'd 220ms fade.
- Adding SF Symbol icons or any image assets — the design system is icon-less by spec.
- The uncommitted `apps/ios/project.yml` `project.local.yml` include in the parent worktree — that's a personal config layer; if your worktree's `project.yml` happens to include it, leave it alone.

COORDINATION:
- Produces (consumed by DS-2/3/4/5 in future iterations):
  - `docs/interfaces/design-system.md` — the locked contract every reskin reads.
  - `apps/ios/WriterOS/DesignSystem/*` — the primitive module DS-3/4/5 will compose against.
  - Updated `AGENTS.md` styling section — the rule of the road for all future iOS work.
- Consumes (no cross-stream inputs this iteration):
  - Style-guide source artifacts already merged on `main` (commit 293ece9).

ENVIRONMENT NOTES:
- The codex netless sandbox cannot reach `registry.npmjs.org`. `pnpm install` will fail. The repo ships with `node_modules/` populated on this machine — if it isn't, your handoff should flag the missing toolchain rather than guess. The iOS toolchain (`xcodegen`, `xcodebuild`, simulators) IS available locally.
- Prior workers hit `fatal: Unable to create '.../.git/worktrees/.../index.lock': Operation not permitted` when committing inside the worktree. If that recurs, write a `0001-foo.patch`, `0002-bar.patch` series at the worktree root, leave files staged, and document the blocker in your handoff — the Queen can `git am` them from the main worktree.

CLOSEOUT (mandatory, do this last):
1. Run `xcodegen generate` from `apps/ios/`, then `xcodebuild test ...` (destination above). If failing, fix or document why deferred.
2. Run `pnpm typecheck` from repo root. Same handling.
3. Commit your work in the 4 logical passes named above. If commits are blocked by the sandbox/worktree issue, write patch files instead.
4. Overwrite `docs/handoffs/stream-a-ds1-foundation.md` with a first-person handoff covering:
   - What this stream tackled (one paragraph).
   - What landed (commits with SHAs if commits worked; files + paths; test counts before/after).
   - What's still owed (anything you couldn't finish, and why).
   - Non-obvious decisions (snapshot framework choice, tone-switching mechanism, how you enforced the one-per-screen PrimaryQuestion contract, anything you departed from spec on).
   - Open questions for the Queen.
   - Cross-stream artifacts produced (paths + intended consumers).
5. Exit.
