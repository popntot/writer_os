ROLE: Implementer for Stream C — TestFlight build readiness (issue #22 / Tracer 19a).
WORKTREE: /Users/williamgreen/Code/writer_os-stream-c
BRANCH: stream-c-testflight-readiness (already checked out)
BASE: main (commit 2587803)

DELIVERABLE (one sentence):
A reproducible `pnpm ios:build` command that produces a TestFlight-eligible signed `.ipa` from a clean checkout, with Info.plist privacy strings, default app icons + launch screen, finalized bundle identifier and version scheme, and a documented archive workflow — without touching runtime code (no audio storage, no AirPods PTT, no Settings).

READ FIRST (in order, in this worktree):
- .github/ISSUE_TEMPLATE or open issue #22 inline if you cannot run `gh` — the AC list is the contract for this stream.
- apps/ios/project.yml                                  (THE source of truth for the Xcode project — pbxproj is generated)
- apps/ios/README.md                                    (existing dev-install + signing notes — extend, don't replace)
- apps/ios/WriterOS/WriterOSApp.swift                   (only to confirm app entry point; do not modify)
- apps/ios/WriterOS/Info.plist if it exists (it likely does not — INFOPLIST is generated from project.yml keys)
- AGENTS.md                                             (commit conventions, conventional-commits format)
- docs/agents/harness.md                                (review/dispatch conventions; reviewer runs tests)
- docs/session-log.md                                   (most recent entry — context only)
- package.json                                          (root scripts: ios:generate, ios:open, ios:test — mirror their style for ios:build)
- .gitignore                                            (note: apps/ios/*.xcodeproj/ is gitignored — DO NOT commit pbxproj)

WORK ITEMS:

1. **Info.plist privacy strings (via project.yml)**
   - Confirm the two existing keys are present in `apps/ios/project.yml` under `targets.WriterOS.settings.base`:
     - `INFOPLIST_KEY_NSMicrophoneUsageDescription`
     - `INFOPLIST_KEY_NSSpeechRecognitionUsageDescription`
   - Add any other usage descriptions iOS currently requires for our entitlements: at minimum `NSUserTrackingUsageDescription` is NOT required (we don't track), but verify no other Apple-mandated string is missing for our current API surface (microphone + speech). If you are confident none are missing, skip; if uncertain, leave a note in your handoff (do not guess at strings).
   - Set `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption` to `NO` (we don't use custom crypto). This silences TestFlight's "export compliance" prompt.

2. **App icons + launch screen at functional defaults**
   - Create `apps/ios/WriterOS/Assets.xcassets/` if it doesn't already exist.
   - Add `AppIcon.appiconset/` with a minimal placeholder app icon. Generate ONE 1024×1024 PNG (single-color background, "WO" text or just a solid color is fine — explicitly functional, not designed) and let Xcode's `xcassets` "single size" mode handle the rest (the modern AppIcon contents.json shape with a single `idiom: universal, platform: ios, size: 1024x1024` entry). Source the PNG via a build-time helper: write a tiny `apps/ios/scripts/make-placeholder-icon.sh` that uses `sips` (built into macOS) or `printf` + ImageMagick to produce the PNG. If `convert` (ImageMagick) is not available, hand-write a base64-encoded 1024×1024 single-color PNG bytes into the file (you can use a tiny single-colored PNG and let Xcode upscale — Xcode requires exactly 1024×1024 for the universal slot, so do produce a 1024×1024 PNG). Document the placeholder explicitly in `apps/ios/README.md` so a future designer knows to swap it.
   - Add a `LaunchScreen` storyboard OR (preferred — project uses `INFOPLIST_KEY_UILaunchScreen_Generation: YES`) ensure the generated launch screen with default background is sufficient. If `UILaunchScreen_Generation: YES` works for our needs (blank background, no text), leave the launch screen at functional default and DO NOT add a storyboard. Document the choice in your handoff.
   - If `Assets.xcassets` requires a `Contents.json` at its root, add the minimal one (`{ "info": { "author": "xcode", "version": 1 } }`).
   - After adding assets, regenerate: `cd apps/ios && xcodegen generate` and confirm the new files are picked up. If `xcodegen` isn't available in the sandbox, document this; reviewer will regenerate.

3. **Bundle identifier + version scheme**
   - Bundle identifier is ALREADY `com.popntot.WriterOS` per `project.yml` (target `WriterOS`) and `com.popntot.WriterOS.Tests` for tests. Leave both as-is. Document them as finalized in `apps/ios/README.md`.
   - Add `MARKETING_VERSION` (e.g. `0.1.0` — matches root `package.json` version) and `CURRENT_PROJECT_VERSION` (start at `1`, increments per archive — see the build script below) to `targets.WriterOS.settings.base` in `project.yml`. These map to CFBundleShortVersionString and CFBundleVersion in the generated Info.plist.
   - Document the version + build-number bump policy in `apps/ios/README.md`: MARKETING_VERSION bumps on user-visible semver changes; CURRENT_PROJECT_VERSION bumps every successful archive (the build script handles the bump).

4. **`scripts/ios-build.sh` archive workflow**
   - Repo root has no `scripts/` directory yet — create it.
   - Write `scripts/ios-build.sh` (executable, `chmod +x`). Behavior:
     1. Bash strict mode (`set -euo pipefail`).
     2. `cd "$(dirname "$0")/../apps/ios"`.
     3. Read current `CURRENT_PROJECT_VERSION` from `project.yml`, bump by 1, write back. Use `sed` or `yq` — prefer `sed` to avoid a new system dep, with a clearly commented regex so it's auditable. If `yq` is installed (`command -v yq`), prefer it.
     4. `xcodegen generate`.
     5. `xcodebuild -project WriterOS.xcodeproj -scheme WriterOS -configuration Release -archivePath build/WriterOS.xcarchive -destination 'generic/platform=iOS' clean archive`.
     6. `xcodebuild -exportArchive -archivePath build/WriterOS.xcarchive -exportPath build/ -exportOptionsPlist ../../scripts/ios-export-options.plist` (see next item).
     7. Print the path to the produced `.ipa` and the new version + build number.
   - Write `scripts/ios-export-options.plist` (a small XML plist) with `method=app-store-connect` (the modern term for "app-store" since Xcode 15+), `signingStyle=automatic`, `teamID=$(read from env DEVELOPMENT_TEAM)` if env is set else require the user to fill it. If `teamID` must be hard-coded in the plist, write a placeholder `TEAM_ID_PLACEHOLDER` and have `scripts/ios-build.sh` substitute it at runtime from `$DEVELOPMENT_TEAM` env var via `sed > tmp.plist`. Document the env var requirement in README.
   - Add to root `package.json` scripts: `"ios:build": "bash scripts/ios-build.sh"`. Keep the existing scripts intact.

5. **README updates**
   - Extend `apps/ios/README.md` with a new section "TestFlight build" at the bottom:
     - Prereqs: Apple Developer enrollment (link #23), Xcode CLI tools, DEVELOPMENT_TEAM env var set, signing configured in Xcode UI at least once.
     - Command: `pnpm ios:build`.
     - Output location: `apps/ios/build/WriterOS.ipa`.
     - Version + build-number bump policy (per Work Item 3).
     - Note that the placeholder app icon needs design replacement before public TestFlight (currently functional default).
   - Do not edit any other README.

DEFINITION OF DONE:
- `pnpm install` from the worktree root succeeds (no new deps expected unless you add `yq` as a recommended optional — do NOT add it as a hard dep).
- `pnpm typecheck` is green across all workspace tasks (TS unchanged; this slice is iOS + shell only). Run it to confirm no incidental breakage.
- `pnpm test` is green across all workspace tasks (existing 77 backend + iOS tests; this slice adds none).
- `apps/ios/project.yml` parses cleanly through `xcodegen generate` (run it once locally if `xcodegen` is in PATH; otherwise document and leave for reviewer).
- `bash scripts/ios-build.sh` is documented and shellcheck-clean (`shellcheck scripts/ios-build.sh` if available; otherwise self-review carefully).
- `pnpm ios:build` is wired in root `package.json`.
- `apps/ios/README.md` has a new "TestFlight build" section that walks Will through the archive end-to-end.
- AC items 1–5 from issue #22 are demonstrably addressed in commits or documented as "deferred to signing-time, see #23" in your handoff.
- One commit per logical pass: (a) project.yml privacy + version scheme, (b) Assets.xcassets + placeholder icon, (c) scripts/ios-build.sh + export options + root package.json wire-up, (d) README updates. Conventional Commits format per AGENTS.md, each referencing issue #22.

OUT OF SCOPE (do not touch):
- Any Swift source under `apps/ios/WriterOS/*.swift` (this slice is build/packaging only — no runtime code changes).
- `apps/api/`, `packages/`, root `turbo.json` (untouched).
- Settings (#18 / Stream D) — a parallel Codex worker is editing the iOS app for Settings; do not modify any file under `apps/ios/WriterOS/*.swift` and do not modify Settings-related strings in `project.yml`.
- The `DEVELOPMENT_TEAM` value — leave blank in `project.yml`; rely on env var or Xcode UI per existing README guidance.
- Apple Developer enrollment / cert provisioning — that's Gate #23 (HITL).
- Real app branding, splash design, marketing copy — placeholder functional defaults only.
- Audio storage tiering (#21) and AirPods PTT (#20) — those issues are listed as "blocked by" parents of #22 but their AC items don't gate the build-infra AC of #22. Do not implement them.

COORDINATION:
- Produces:
  - `scripts/ios-build.sh`, `scripts/ios-export-options.plist`, root `package.json` script `ios:build`.
  - `apps/ios/project.yml` additions: `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption`, `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`.
  - `apps/ios/WriterOS/Assets.xcassets/AppIcon.appiconset/` with placeholder icon + Contents.json.
  - `apps/ios/README.md` TestFlight build section.
- Consumes (already on main): existing xcodegen + iOS app structure.
- Cross-stream conflict surface with Stream D (Settings):
  - `apps/ios/project.yml` — Stream D should NOT need to edit this file (Settings is a new Swift view; xcodegen picks it up via the existing `sources: path: WriterOS` rule). If both streams edit project.yml, the merge is line-level and resolvable.
  - `apps/ios/README.md` — Stream D may add a brief Settings note; merge is line-level.
  - `apps/ios/WriterOS/*.swift` — Stream C does NOT modify any Swift; Stream D does. No conflict.
  - The Xcode pbxproj is **gitignored** and generated by xcodegen — no pbxproj conflicts possible.

CLOSEOUT (mandatory, do this last):
1. Run the DoD checks. If any fail and you can fix-forward in one pass, do so. If you can't, document the failure in the handoff and leave the work in place.
2. Commit your work with messages that name the work item (e.g. `chore(#22): project.yml privacy + version scheme (Pass A)`).
3. Write `docs/handoffs/stream-c-testflight-readiness.md` (overwrite if exists). First-person, functional tone, readable cold by a fresh agent. Cover:
   - What this stream tackled (one paragraph).
   - What landed: commits with SHAs, files with paths.
   - What's still owed and why (in particular: any Info.plist privacy strings you weren't sure about; whether xcodegen was available in the sandbox; whether you could actually run xcodebuild archive end-to-end).
   - Non-obvious decisions: e.g. the placeholder icon strategy, the launch screen choice, the export-options plist team-id substitution scheme.
   - Open questions for the Queen (Claude Code reviewer).
   - Cross-stream artifacts produced (paths + intended consumer — e.g. that #23 will need DEVELOPMENT_TEAM before `pnpm ios:build` can produce a signed archive).
4. Exit. Do not open a PR yourself — the reviewer (Claude Code) opens the PR after running the review checklist against your handoff.
