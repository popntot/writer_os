# Stream C TestFlight Readiness Handoff

I tackled issue #22 / Tracer 19a as a packaging-only TestFlight readiness slice. The diff keeps
runtime code untouched and adds the project settings, asset catalog, archive/export script, root
`pnpm ios:build` wiring, and iOS README workflow needed for a signed App Store Connect export once
Gate #23 supplies Apple Developer/App Store Connect signing state.

## What Landed

Commits were requested, but I could not create them from this sandbox. `git commit` failed because
this worktree's Git metadata points at `/Users/williamgreen/Code/writer_os/.git`, which is outside
the writable root:

```text
fatal: Unable to create '/Users/williamgreen/Code/writer_os/.git/worktrees/writer_os-stream-c/index.lock': Operation not permitted
```

Intended commit split:

- `chore(#22): add iOS privacy and version scheme`
- `chore(#22): add placeholder iOS app icon assets`
- `chore(#22): add TestFlight archive command`
- `docs(#22): document TestFlight build workflow`

Files changed or added:

- `apps/ios/project.yml`
  - Kept `com.popntot.WriterOS` and `com.popntot.WriterOS.Tests`.
  - Added `MARKETING_VERSION: 0.1.0`.
  - Added `CURRENT_PROJECT_VERSION: 1`.
  - Added `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`.
  - Added `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: NO`.
  - Confirmed existing microphone and speech recognition purpose strings are present.
- `apps/ios/WriterOS/Assets.xcassets/Contents.json`
- `apps/ios/WriterOS/Assets.xcassets/AppIcon.appiconset/Contents.json`
- `apps/ios/WriterOS/Assets.xcassets/AppIcon.appiconset/placeholder-icon-1024.png`
- `apps/ios/scripts/make-placeholder-icon.sh`
  - Generates the exact 1024x1024 solid placeholder PNG with `perl` + macOS `sips`.
- `scripts/ios-build.sh`
  - Requires `DEVELOPMENT_TEAM`.
  - Bumps `CURRENT_PROJECT_VERSION`, preferring `yq` when available and falling back to audited
    `sed`.
  - Runs `xcodegen generate`.
  - Archives Release for `generic/platform=iOS`.
  - Exports with a temporary export-options plist and normalizes the result to
    `apps/ios/build/WriterOS.ipa`.
  - Rolls back the build-number bump if archive/export fails.
- `scripts/ios-export-options.plist`
  - Uses `method=app-store-connect`, `signingStyle=automatic`, and a runtime-substituted
    `TEAM_ID_PLACEHOLDER`.
- `package.json`
  - Adds `"ios:build": "bash scripts/ios-build.sh"`.
- `apps/ios/README.md`
  - Adds the "TestFlight build" section with prerequisites, command, output path, finalized bundle
    IDs, version policy, placeholder icon note, and generated launch screen note.

## Verification

Passed:

- `apps/ios/scripts/make-placeholder-icon.sh`
  - Produced `placeholder-icon-1024.png`.
  - `file` and `sips -g pixelWidth -g pixelHeight` confirmed `1024 x 1024`.
- `bash -n scripts/ios-build.sh`
- `bash -n apps/ios/scripts/make-placeholder-icon.sh`
- `plutil -lint scripts/ios-export-options.plist`
- Ruby JSON parse for both asset-catalog `Contents.json` files.
- `cd apps/ios && xcodegen generate`
  - XcodeGen is available at `/opt/homebrew/bin/xcodegen`.
  - Generated `WriterOS.xcodeproj`; it remains ignored by git.
  - The generated pbxproj contains `ASSETCATALOG_COMPILER_APPICON_NAME`, versions, and export
    compliance settings.
- `pnpm ios:build`
  - Reaches the expected signing gate and fails early without `DEVELOPMENT_TEAM`.
  - Restores `project.yml` on failure.

Blocked:

- `pnpm install` failed because the sandbox cannot resolve `registry.npmjs.org`.
- `pnpm typecheck` and `pnpm test` then failed with `turbo: command not found`.
- `shellcheck` is not installed, so I performed syntax checks and manual shell review only.
- I did not run a full `xcodebuild archive` / `xcodebuild -exportArchive` because this sandbox does
  not have `DEVELOPMENT_TEAM`/signing provisioning for Gate #23.
- I could not fetch `gh issue view 22 --comments`; GitHub API access failed from the sandbox.

## Non-Obvious Decisions

I left the launch screen on the existing generated default:
`INFOPLIST_KEY_UILaunchScreen_Generation: YES`. That gives the functional blank launch surface this
slice needs without adding a storyboard or design artifact.

The placeholder app icon is intentionally a solid-color 1024x1024 PNG. The helper script sources it
from generated PPM bytes and `sips`, so no image dependency or committed design source is required.
The README calls out that this must be replaced before a public TestFlight.

The export-options plist keeps `TEAM_ID_PLACEHOLDER` committed and substitutes `$DEVELOPMENT_TEAM`
into a temporary plist at build time. This avoids hard-coding Will's team ID while still giving
`xcodebuild -exportArchive` the `teamID` key it expects for automatic App Store Connect signing.

I did not add additional Info.plist usage descriptions. A local grep found only microphone and
Speech framework usage in the current iOS API surface, and those two strings already exist. I also
explicitly did not add `NSUserTrackingUsageDescription`; this app does not use tracking APIs.

## Still Owed

The reviewer needs to commit the diff from a context that can write the parent repo's Git metadata,
using the intended four-pass split above or a close equivalent.

Gate #23 still needs real Apple Developer/App Store Connect provisioning, a real
`DEVELOPMENT_TEAM`, and one successful signed archive/export run:

```sh
export DEVELOPMENT_TEAM=ABCDE12345
pnpm ios:build
```

The reviewer also needs to rerun `pnpm install`, `pnpm typecheck`, `pnpm test`, and preferably
`shellcheck scripts/ios-build.sh apps/ios/scripts/make-placeholder-icon.sh` outside the netless
sandbox.

## Open Questions For The Queen

- Confirm that `method=app-store-connect` is accepted by the installed Xcode version for local IPA
  export. If this Xcode build still expects legacy `app-store`, change only the plist value.
- Confirm whether the exported archive's signing settings need an App Store Connect provisioning
  profile selected once in Xcode before the CLI export can succeed.
- Confirm that no future Stream D README edits conflict with the new "TestFlight build" section.

## Cross-Stream Artifacts

- `scripts/ios-build.sh` and `scripts/ios-export-options.plist` are for #23/Will to consume during
  signing-time archive validation.
- `apps/ios/WriterOS/Assets.xcassets/AppIcon.appiconset/placeholder-icon-1024.png` is a functional
  placeholder for TestFlight eligibility and should be replaced by a future design/brand pass.
- `apps/ios/project.yml` remains the only Xcode project source of truth. Stream D should not need
  to touch it for Settings because the existing `sources: path: WriterOS` rule picks up Swift files.
