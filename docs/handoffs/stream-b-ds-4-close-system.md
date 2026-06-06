# Stream B DS-4 Close + System Handoff

## What Shipped

- Added `CloseSurface` beside `SessionEndCoordinator`: `PageShell`, captured note,
  optional `PrimaryQuestion`, ready `QuietRow` for Next, and a mono Return text button.
- Added `SystemView` with a pure `SystemSurface` for snapshots and a stateful container
  for live config/settings/spine loading.
- Added `SystemSpecRow` as the single new design-system primitive and documented it in
  `docs/interfaces/design-system.md`.
- Added iOS read support for `/projects/:id/trueline` through `TrueLineDocument` and
  `APIClient.getTrueLine(projectId:)`.
- Routed the normal root tabs to Today + System with text-only tab items. The old Dump
  bottom tab is retired; Today still routes to Inbox through its Captured row.
- Added snapshot test sources for Close and System. Baseline PNGs are intentionally not
  recorded in this environment.

## Retire Vs Shim Decision

- `SettingsView` is retained as a thin shim to `SystemView()`.
- `ConfigSetupView` is retained as a thin shim to `SystemView(mode: .identitySetup)`, so
  the first-launch missing-config gate still lands on Identity controls.
- `DumpView` is retained as a thin shim to `SystemView()`. The current DS-3 branch used
  `DumpView` as an inbox capture composer rather than the read-only dump described in the
  DS-4 prompt, so that composer was renamed to `InboxDumpComposer` and `InboxView` now
  uses the clearer name.

## Preserved Settings Bindings

- `audioCaptureDefault` still writes `SettingsPatch(audioCaptureDefault:)`.
- `audioRetentionHotDays` still writes `SettingsPatch(audioRetentionHotDays:)`.
- `audioRetentionColdDays` still writes `SettingsPatch(audioRetentionColdDays:)`.
- `locationTagDefault` still writes `SettingsPatch(locationTagDefault:)`.
- `SettingsStore.swift` and `Settings.swift` have empty diffs.

## Copy Gate

Command shape used: current diff plus untracked files, filtered for the §10 gated terms in
added lines.

Output:

```text
<no matches>
```

## DS Checklist

- Close: one dominant thought, no chat layout, no dashboard layout, color only marks
  state, state has text plus color, Return is the only action.
- System: one scrolling editorial page, section rules use DS hairlines, headers use
  section typography, settings rows use the new documented primitive, no nav bar, no SF
  Symbol icons, no segmented controls.

## Verified

- `pnpm typecheck` passed.
- `cd apps/ios && xcodegen generate` passed.
- Settings model/store diff check returned empty output.
- §10 copy grep returned no matches.

## Not Verified Here

- The exact requested simulator command failed before compile because this sandbox has no
  matching `iPhone 17` simulator destination.
- Fallback `build-for-testing` runs with writable DerivedData reached Swift driver
  invocation, then failed in asset catalog thinning because CoreSimulator services and
  simulator runtimes are unavailable here.
- Snapshot tests were written but not run against recorded PNG baselines. The reviewer
  still needs to record the new Close/System baselines on a simulator.

## Reviewer (Queen) follow-up

Codex implemented the surfaces; the reviewer (Claude Code) then, on the simulator:

- **Wired `CloseSurface` into the walk-end flow.** Codex couldn't touch `ChatView`
  (DS-3-owned), so `CloseSurface` was orphaned. `ChatView` now routes the session-end
  `onDismiss` (both swipe-down and the silence timeout) to present `CloseSurface`; its
  `Return` button dismisses to Today. `SessionEndCoordinator`'s model is unchanged.
  Open question / next-session starter use file-not-finish defaults — consolidation
  output isn't exposed to the client yet (parallels the Walk-question gap, #16).
- **Fixed the System top-anchor snapshot** (same `ScrollView`-renders-empty-under-
  `drawHierarchy` issue as DS-3's Today): `SystemSurface` gained a `scrollable` flag —
  the live screen scrolls, snapshots render the plain column. Replaced the top/mid
  offset anchors with one full-height `system-view-full` capture (all four sections) plus
  `system-view-identity-setup` (first-launch). Dropped the now-unused `SystemSnapshotAnchor`.
- **Recorded all 8 baselines** (Close ×2, System ×2, each light+night) and eyeballed them.

Final verification (simulator, iPhone 17): `xcodebuild ... test` **56/56**; `pnpm typecheck`
green. First-launch routing confirmed: nil config → `ConfigSetupView` shim →
`SystemView(.identitySetup)` → save → tabs.

Known: the `SettingsView`/`DumpView` shims are retained but unreferenced after the tab
rewire (kept per the prompt's shim option); the dark-mode snapshot limitation from DS-3
applies here too (night baselines render light).
