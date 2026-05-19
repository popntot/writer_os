#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

output="WriterOS/Assets.xcassets/AppIcon.appiconset/placeholder-icon-1024.png"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$(dirname "$output")"

# Generate an exact 1024x1024 solid-color source image, then convert it to PNG
# with macOS' built-in sips. This is a functional placeholder, not branding.
ppm="$tmpdir/placeholder-icon.ppm"
perl -e 'print "P6\n1024 1024\n255\n"; print "\x24\x56\x64" x (1024 * 1024);' > "$ppm"
sips -s format png "$ppm" --out "$output" >/dev/null

echo "Wrote $output"
