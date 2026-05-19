#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/ios"

project_file="project.yml"
archive_path="build/WriterOS.xcarchive"
export_path="build"
export_options_template="../../scripts/ios-export-options.plist"
export_options_plist="$(mktemp)"
original_project="$(mktemp)"
build_succeeded=false
use_yq=false

cp "$project_file" "$original_project"

on_exit() {
  local exit_code="$1"

  rm -f "$export_options_plist"

  if [[ "$build_succeeded" != "true" ]]; then
    cp "$original_project" "$project_file"
    echo "Build did not complete; restored $project_file." >&2
  fi

  rm -f "$original_project"
  exit "$exit_code"
}
trap 'on_exit $?' EXIT

if [[ -z "${DEVELOPMENT_TEAM:-}" ]]; then
  cat >&2 <<'EOF'
DEVELOPMENT_TEAM is required for TestFlight export.

Set it to your Apple Developer Team ID, for example:
  export DEVELOPMENT_TEAM=ABCDE12345
EOF
  exit 1
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen is required. Install with: brew install xcodegen" >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is required. Install Xcode and its command line tools." >&2
  exit 1
fi

if command -v yq >/dev/null 2>&1 && yq eval '.targets.WriterOS.settings.base.CURRENT_PROJECT_VERSION' "$project_file" >/dev/null 2>&1; then
  use_yq=true
fi

if [[ "$use_yq" == "true" ]]; then
  current_build="$(yq eval '.targets.WriterOS.settings.base.CURRENT_PROJECT_VERSION' "$project_file")"
else
  current_build="$(
    sed -nE \
      's/^[[:space:]]*CURRENT_PROJECT_VERSION:[[:space:]]*"?([0-9]+)"?[[:space:]]*$/\1/p' \
      "$project_file" | head -n 1
  )"
fi

if [[ ! "$current_build" =~ ^[0-9]+$ ]]; then
  echo "Could not read numeric CURRENT_PROJECT_VERSION from $project_file." >&2
  exit 1
fi

new_build="$((current_build + 1))"

if [[ "$use_yq" == "true" ]]; then
  yq eval -i ".targets.WriterOS.settings.base.CURRENT_PROJECT_VERSION = ${new_build}" "$project_file"
else
  # Replace only the target build-number setting; keep indentation and avoid a
  # YAML dependency on machines that only have the default macOS toolchain.
  sed -i '' -E \
    "s/^([[:space:]]*CURRENT_PROJECT_VERSION:[[:space:]]*)\"?[0-9]+\"?[[:space:]]*$/\\1${new_build}/" \
    "$project_file"
fi

if [[ "$use_yq" == "true" ]]; then
  marketing_version="$(yq eval '.targets.WriterOS.settings.base.MARKETING_VERSION' "$project_file")"
else
  marketing_version="$(
    sed -nE \
      's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"?([^"]+)"?[[:space:]]*$/\1/p' \
      "$project_file" | head -n 1
  )"
fi

if [[ -z "$marketing_version" ]]; then
  echo "Could not read MARKETING_VERSION from $project_file." >&2
  exit 1
fi

sed "s/TEAM_ID_PLACEHOLDER/${DEVELOPMENT_TEAM}/g" "$export_options_template" > "$export_options_plist"

xcodegen generate

xcodebuild \
  -project WriterOS.xcodeproj \
  -scheme WriterOS \
  -configuration Release \
  -archivePath "$archive_path" \
  -destination 'generic/platform=iOS' \
  clean archive

xcodebuild \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$export_path" \
  -exportOptionsPlist "$export_options_plist"

ipa_path="$(find "$export_path" -maxdepth 1 -name '*.ipa' -print -quit)"
desired_ipa_path="$export_path/WriterOS.ipa"

if [[ -z "$ipa_path" ]]; then
  echo "Archive export completed, but no .ipa was found in $export_path." >&2
  exit 1
fi

if [[ "$ipa_path" != "$desired_ipa_path" ]]; then
  mv -f "$ipa_path" "$desired_ipa_path"
  ipa_path="$desired_ipa_path"
fi

build_succeeded=true

echo "Produced: apps/ios/$ipa_path"
echo "Version: $marketing_version ($new_build)"
