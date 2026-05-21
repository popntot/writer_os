ROLE: Implementer for Stream A — DS-3 Today + Walk reskin.
WORKTREE: /Users/williamgreen/witer-os-git/writer_os-stream-a
BRANCH: stream-a-ds-3-today-walk (already checked out by Queen)
BASE: main (commit a42170c)
ISSUE: popntot/writer_os#44

DELIVERABLE (one sentence):
Reskin the Today (replaces ProjectsView) and Walk (replaces voice ChatView) surfaces to compose only `apps/ios/WriterOS/DesignSystem/` primitives, per §7 + §10 of the style guide, with no changes to existing voice/audio plumbing.

READ FIRST (in order):
- docs/interfaces/design-system.md                                                      (locked DS-1 interface doc, §13 checklist applies to this PR)
- docs/interfaces/ui style guide/writer-os-minimal-design-system-style-guide.md         (§7 Today, §10 Walk — source spec)
- apps/ios/WriterOS/DesignSystem/Tokens.swift + Primitives/*.swift                       (the 12 primitives + Tokens you compose)
- apps/ios/WriterOS/ProjectsView.swift                                                  (this is the file you replace; preserve routing into ChatView, InboxView, CreateProjectSheet)
- apps/ios/WriterOS/ChatView.swift                                                      (voice-mode rendering branch is what Walk replaces — keep text-mode branch reachable per Work Item 3)
- apps/ios/WriterOS/InboxItem.swift, Project.swift                                      (read-only — model shapes)
- apps/ios/WriterOS/VoiceSessionController.swift, AudioPlaybackEngine.swift             (read-only — DO NOT modify, view-layer reskin only)

WORK ITEMS:
1. Rewrite `apps/ios/WriterOS/ProjectsView.swift` (or replace with `TodayView.swift` if you keep ProjectsView as a thin shim) so it composes only DS primitives:
   - `PageShell` outer.
   - Top lockup: date (mono uppercase) + `ModeSwitch` (Walk/Desk). Persist mode per-session with `@SceneStorage("today.mode")`.
   - Page title: serif 43-48pt, wrap not truncate (§11).
   - **Desk mode** (default when projects list is non-empty): `WorkIndex` of projects (numbered reading order, NOT a task checklist).
   - **Walk mode**: single `PrimaryQuestion` = current project's open question if the spine has one, else `"Nothing waiting. Begin."` as the soft empty state.
   - Inbox surface: `QuietRow` at bottom of Desk mode. State dot `active` iff there are unreviewed items, label `Captured`, title `"\(n) captured"`, body `"Review when settled."`. Tap → push InboxView (unchanged).
   - New-project entry: `QuietRow` at bottom of index, state `inactive`, title `"New project"`. Tap → existing `CreateProjectSheet`.
2. Rewrite the **voice-mode** branch of `apps/ios/WriterOS/ChatView.swift` so it renders the Walk surface:
   - `PageShell` outer.
   - Top: session timer (mono, 14.5pt body).
   - Body: serif paragraph rendering ONE captured thought — the most recent user utterance, not a transcript feed (§10 forbids transcript feed).
   - No on-screen assistant reply text. Audio-only via existing `AudioPlaybackEngine`.
   - Single mic-tap region, no chrome.
   - Exit-walk swipe-down → existing `SessionEndCoordinator` (DS-4 will reskin Close).
3. **Text-mode** ChatView (typing turns, not voice): make it reachable only via a debug/System sub-screen or behind a `#if DEBUG` flag. Voice is primary per PRD; text-as-primary is not in the style guide. Document your shot in the PR body.
4. Add snapshot tests under `apps/ios/WriterOSTests/DesignSystem/`:
   - `TodayDeskSnapshotTests.swift` — light + night, with and without inbox count
   - `TodayWalkSnapshotTests.swift` — light + night, with question and empty state
   - `WalkSurfaceSnapshotTests.swift` — light + night, with and without captured thought

DEFINITION OF DONE:
- ProjectsView composes ONLY DS primitives (`grep -E "Text\\(|VStack\\(|HStack\\(|Color\\(" apps/ios/WriterOS/ProjectsView.swift` returns only the bare-text content inside primitives' label slots, no raw styling).
- Voice-mode branch in ChatView reskinned per Work Item 2; existing `VoiceSessionController` / `AudioPlaybackEngine` / `SSEStreamConsumer` UNTOUCHED (verify via `git diff` summary in PR body).
- Walk surface renders ≤1 captured thought; older utterances not visible.
- Inbox count updates live (subscribe to the same source InboxView mutates).
- §13 acceptance checklist documented in PR body for both Today and Walk.
- Existing XCTests still pass; new snapshot tests green (light + night × every primitive composition).
- `pnpm typecheck` green from repo root (you should not touch TypeScript).
- Logical commits, each compiling individually:
  1. `feat(#44): TodayView composes DS primitives — Desk + Walk modes`
  2. `feat(#44): ChatView voice branch becomes Walk surface`
  3. `chore(#44): gate text-mode chat behind System sub-screen`
  4. `test(#44): snapshot tests for Today + Walk (light + night)`

SANDBOX LESSONS (apply verbatim):
- The Codex sandbox CANNOT write to `.git/worktrees/<name>/index.lock` and cannot push branches. DO NOT attempt `git commit` / `git push` / `gh pr create`. Instead: leave a clean working tree of staged-but-not-committed changes AND emit one `git format-patch`-shaped patch per logical commit, written to `./_dispatch/stream-a-<n>-<short-title>.patch`. The Queen applies them outside the sandbox via `git am`.
- The Codex sandbox CANNOT run the iOS simulator. Run what you can: `pnpm typecheck`, `xcodebuild build` (build-for-testing only — no simulator runtime). The Queen runs the simulator suite outside the sandbox before merge.
- Write your handoff to `docs/handoffs/stream-a-ds-3-today-walk.md` covering: what shipped, decisions made (esp. the text-mode-chat call), verified/unverified gates, follow-ups.
