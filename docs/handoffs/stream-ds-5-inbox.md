# Stream DS-5 Inbox Handoff

## What Shipped

- Replaced the old `InboxView` nested `NavigationStack` + `List` composition with a Writer OS
  design-system surface titled `Captured`.
- Added a pure, data-driven `CapturedSurface` that takes plain `CapturedSurfaceItem` fixtures,
  loading state, and callbacks. The live `InboxView` passes `scrollable: true`; snapshot tests use
  the default non-scrolling path.
- Pending inbox items render as `QuietRow` instances:
  - `text`, `url`, and `audio` captures map to `source` / `Captured`.
  - triaged items map to `ready` / `Triaged`.
  - surfaced questions map to `open` / `Open`.
- Single-tapping a row opens a detail sheet composed around `SourceNote`.
- Added `CapturedSurfaceSnapshotTests` for populated and empty states using
  `assertWriterSnapshots`.

## Deposit Affordance

Text deposit is preserved through `InboxStore.deposit(config:content:surface:)`.

The old bordered `TextEditor` composer was removed from the main screen. The live surface now shows
a quiet `New capture` `QuietRow` at the bottom; tapping it opens a DS-styled compose sheet with
hairline rules, serif body input, and mono action text.

## Overflow Menu

Destructive / filing actions moved out of rows. The detail sheet exposes a single mono `…` button in
a hairline-bordered tap area. Tapping it opens an actions sheet.

The existing confirm behavior is preserved through
`InboxStore.confirm(config:item:projectId:)`. If triage proposed a project, the actions sheet files
to that project. If no project is proposed, the file action is disabled and the sheet explains that
triage has not proposed a project yet. No delete action was added because the existing store exposes
no delete API.

## Design System Checklist

- The page has one dominant thought: the `Captured` section heading and captured rows.
- The UI no longer resembles chat, a dashboard, a generic upload inbox, or a checklist.
- Color is used only for state dots and state labels.
- State is conveyed by color plus text (`Captured`, `Triaged`, `Open`).
- Rows use `QuietRow`; detail uses `SourceNote`; rules use `Hairline`; labels use `StateLabel`.
- Empty pending state is the quiet serif sentence `Nothing captured.`
- No checkboxes, bulk selection, swipe-to-delete, cards, pills, or ad-hoc colors were introduced.
- No new design-system primitive was needed.

## Preserved Behaviors

- `InboxItem.swift` unchanged.
- `InboxStore.swift` unchanged.
- `InboxStore.deposit` still powers new text capture with surface `ios-app-dump`.
- `InboxStore.confirm` still powers confirm/file to the proposed project.
- `TodayView` continues to push `InboxView` inside its existing `NavigationStack`; `InboxView` no
  longer creates a nested navigation stack.

## Verified

- `pnpm typecheck` passed.
- `cd apps/ios && xcodegen generate` passed.
- `git diff -- apps/ios/WriterOS/InboxItem.swift apps/ios/WriterOS/InboxStore.swift` is empty.

## Unverified

- Snapshot PNG baselines were not recorded; this requires the reviewer's simulator pass.
- The requested `xcodebuild -project WriterOS.xcodeproj -scheme WriterOS -destination
  'platform=iOS Simulator,name=iPhone 17,OS=latest' build-for-testing` did not compile because this
  sandbox has no matching `iPhone 17` simulator destination and CoreSimulatorService was unavailable.
