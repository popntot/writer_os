# Handoff — DS-3: Today + Walk reskin (issue #44)

Landed directly by Claude Code (no Codex worker — the Codex CLI/companion isn't
installed on this machine; per `docs/streams/_dispatch-log.md`, Claude Code lands
streams like this directly and verifies on the simulator).

Branch: `issue/44-ds3-today-walk`. Base: `main` @ `d45a1d6`.

## What shipped

- **`TodayView`** (replaces `ProjectsView.swift`, now deleted). Splits into a pure,
  snapshot-testable `TodaySurface` (composes only DS primitives) + a stateful
  `TodayView` container.
  - Top lockup: date as `StateLabel` (mono uppercase) + `ModeSwitch` (Walk/Desk),
    mode persisted via `@SceneStorage("today.mode")`.
  - Serif page title (`WriterTypography.pageTitle`), wraps (not truncated).
  - **Desk mode**: `WorkIndex` of projects (numbered reading order) + a `Captured`
    `QuietRow` (dot `active` iff unreviewed items, title `"{n} captured"`, body
    `"Review when settled."`) → pushes `InboxView`, + a `New project` `QuietRow`
    (state `inactive`) → `CreateProjectSheet`.
  - **Walk mode**: one `PrimaryQuestion`. Tapping it begins the current project's
    walk. When there are no projects, a `New project` `QuietRow` is offered.
- **`WalkSurface`** (in `ChatView.swift`): the §10 calm surface — timer (mono),
  one captured thought (serif, the most recent user utterance — not a transcript
  feed), and a single mic-tap capture region. No assistant text on screen; audio
  still plays via the untouched `AudioPlaybackEngine`. `ChatView` renders it by
  default; swipe-down ends the session via the existing `SessionEndCoordinator`.
- **Text-mode chat** (List + TextField + cost) is preserved but gated behind a
  `#if DEBUG` long-press (`debugChat`); it is unreachable in release builds.
- **`InboxStore`** (new `ObservableObject`, injected like `SettingsStore`): single
  source of truth for pending inbox items so the Today "Captured" count updates
  live the moment `InboxView` deposits/files. `InboxView`'s data source was
  repointed at the store; its UI is unchanged (its reskin is DS-5/#46).
- Snapshot tests: `TodayDeskSnapshotTests`, `TodayWalkSnapshotTests`,
  `WalkSurfaceSnapshotTests` + shared `SnapshotSupport.swift`. 14 baselines
  recorded under `__Snapshots__/`.

## Decisions made (flag for review)

1. **`WorkIndexItem` gained an optional `onSelect` closure** (DS-1 primitive touch).
   Additive and snapshot-preserving: the row only becomes a quiet tap target
   (`contentShape` + `onTapGesture`, no visual change), so the existing WorkIndex
   snapshot stayed green. This preserves project → Walk routing without turning the
   index into a task list. If the DS-1 owner prefers the primitive stay inert,
   revert it and route walks from Walk mode only.
2. **Walk-mode `PrimaryQuestion` is always the soft empty state** ("Nothing waiting.
   Begin.") — there is no iOS OpenQuestions surface yet (#16). The seam (`walkQuestion`)
   is ready to read a real open question once that lands.
3. **Today is non-scrolling.** A `ScrollView` inside the snapshot harness renders
   empty (`drawHierarchy` deferral), and Today is a deliberately low-density surface,
   so it's a plain top-aligned column. Long project lists would overflow — add
   scoped scrolling if that becomes real.
4. **Today has no error chrome.** Load failures fall back to the empty state and
   recover on pull-to-refresh, keeping the surface calm (vs. the old Retry panel).
5. **Navigation shell unchanged.** The `RootView` `TabView` (Today / Dump / Settings)
   stays; rewiring the six-tab DS `BottomNav` (Today/Walk/Close/Article/Source/System)
   is DS-4+ work. The Today "Captured" row and the Dump tab are briefly redundant
   until then.

## Verified

- `xcodebuild ... test` on the **iPhone 17 simulator**: 52/52 pass (45 existing +
  7 new). The 12 DS-1 primitive snapshots stayed green (WorkIndex change invisible).
- `pnpm typecheck`: green (no TypeScript touched).
- `git diff` confirms `VoiceSessionController`, `AudioPlaybackEngine`,
  `SSEStreamConsumer`, `SessionEndCoordinator` are **untouched**.
- All four surfaces eyeballed against the `apps/web` oracle (today/walk) — faithful.

## Known limitation (pre-existing, not introduced here)

The snapshot harness does **not** capture dark mode: `window.overrideUserInterfaceStyle`
doesn't propagate to dynamic-color resolution under `drawHierarchy`, so every
`-night` baseline (including the 12 existing DS-1 ones, e.g. `page-shell-night.png`)
renders with light colors. The `-night` files exist and lock layout, but tone
coverage is currently illusory. Fixing it (e.g. resolving colors against an explicit
trait collection) would re-record all night baselines repo-wide — out of DS-3 scope,
worth its own issue.

## §13 acceptance checklist (Today + Walk)

- Understood in under five seconds — yes (one dominant thought per mode/surface).
- One dominant thought — Desk: the reading order; Walk: the question; Walk surface: the thought.
- Does not look like chat — yes (transcript/assistant text removed from the walk).
- Does not look like a dashboard — yes (no KPIs, no widgets; quiet rows only).
- Color only for state — yes (state dots/marks via `WriterState`; everything else ink/serif).
- Readable light + night — light verified; night not meaningfully exercised (harness limit above).
- State by text + color — yes (`StateLabel` + `StateDot` always paired).
- No over-management — yes (Today orients; Walk captures).
- Works with decorative cues removed — yes (text + rules carry it).
