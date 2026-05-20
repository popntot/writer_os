# Stream A DS-1 Foundation Handoff

I tackled the DS-1 foundation slice for issue #42: lock the design-system contract, add the
iOS SwiftUI token/primitive layer, snapshot every primitive in light and night tones, and
replace the repo standing UI instruction so future reskins point at the locked design
system instead of SwiftUI defaults.

## What Landed

Git commits were blocked by the known worktree permission issue:

```text
fatal: Unable to create '/Users/williamgreen/witer-os-git/writer_os/.git/worktrees/writer_os-stream-a/index.lock': Operation not permitted
```

I wrote a four-patch series at the worktree root instead:

- `0001-feat-42-lock-design-system-interface-doc.patch`
- `0002-feat-42-add-ios-design-system-tokens-primitive-module.patch`
- `0003-test-42-snapshot-tests-for-design-system-primitives.patch`
- `0004-docs-42-replace-agents-ui-branding-section.patch`

The changed paths are:

- `docs/interfaces/design-system.md`
- `apps/ios/WriterOS/DesignSystem/Tokens.swift`
- `apps/ios/WriterOS/DesignSystem/Primitives/*.swift`
- `apps/ios/WriterOSTests/DesignSystem/DesignSystemSnapshotTests.swift`
- `apps/ios/WriterOSTests/DesignSystem/__Snapshots__/*.png`
- `AGENTS.md`

No existing files under `apps/ios/WriterOS/` were modified outside the new
`DesignSystem/` directory.

Verification:

- `xcodegen generate` from `apps/ios/`: passed.
- `xcodebuild test -project apps/ios/WriterOS.xcodeproj -scheme WriterOS -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5'`: passed.
- Test count observed after this slice: 45 tests, 0 failures. That is 33 existing tests plus
  12 new design-system snapshot tests; each snapshot test renders both light and night
  tones, so there are 24 reference PNGs.
- `pnpm typecheck`: blocked because `turbo` is missing and pnpm reports `node_modules`
  missing locally.

## Still Owed

The only unfinished item is a green `pnpm typecheck`. I could not run it because this
worktree does not currently have the JS toolchain installed:

```text
sh: turbo: command not found
WARN Local package.json exists, but node_modules missing, did you mean to install?
```

I also could not read `gh issue view 42 --repo popntot/writer_os --comments` because the
sandbox could not connect to `api.github.com`; I worked from the issue brief in the prompt.

## Non-Obvious Decisions

I did not add `pointfreeco/swift-snapshot-testing`. The snapshot suite uses built-in
`XCTest`, `UIHostingController`, and PNG byte comparison so DS-1 does not add a package
dependency or require network access.

Tone switching uses dynamic `Color(uiColor:)` providers keyed from
`UITraitCollection.userInterfaceStyle`. The snapshot renderer overrides
`UIUserInterfaceStyle` to deterministically capture light and night.

`PrimaryQuestion` applies `.primaryQuestionInstance()`, and `PageShell` applies
`.assertSinglePrimaryQuestion()`. That makes the one-per-screen contract a debug-time
preference assertion when screens compose through the shell.

`WriterFade` lives in `Tokens.swift` and checks `UIAccessibility.isReduceMotionEnabled`;
reduced motion removes the vertical settle and animation.

The final Xcode test run logged repeated locked physical-device warnings and SwiftUI font
descriptor warnings for `SF Mono`, but the requested simulator test command completed
successfully with 45/45 tests passing.

## Open Questions

- Should the local JS dependencies be restored in this worktree, or should the Queen run
  `pnpm typecheck` from a parent/main worktree with `node_modules` already present?
- Should future snapshot tests keep exact PNG byte comparison, or should a tolerance-based
  comparator be introduced once the design system starts rendering more complex surfaces?

## Cross-Stream Artifacts

- `docs/interfaces/design-system.md`: locked visual contract for DS-2/3/4/5 and future
  reskin work.
- `apps/ios/WriterOS/DesignSystem/`: iOS token and primitive module for DS-3/4/5 screen
  composition.
- `apps/ios/WriterOSTests/DesignSystem/`: light/night snapshot coverage for every DS-1
  primitive.
- `AGENTS.md`: standing UI rule now points future agents to the locked design-system
  contract and primitives.

