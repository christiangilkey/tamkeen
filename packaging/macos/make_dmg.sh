#!/usr/bin/env bash
# Build the macOS .dmg from the PyInstaller .app bundle.
#   packaging/macos/make_dmg.sh 0.1.0
set -euo pipefail
VERSION="${1:?version required}"
APP="dist/Tamkeen.app"
STAGE="dist/dmg"
OUT="dist/Tamkeen-${VERSION}-macOS-AppleSilicon.dmg"

[ -d "$APP" ] || { echo "Missing $APP. Run pyinstaller first." >&2; exit 1; }

# Ad-hoc signature: Apple Silicon refuses to run completely unsigned code. This is NOT a
# Developer ID signature, so Gatekeeper still warns on first launch (see README).
codesign --force --deep --sign - "$APP"

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cp README.md "$STAGE/Read Me.md" 2>/dev/null || true
# On build machines hdiutil now and then fails with "Resource busy" (something is still
# scanning the freshly copied app). Trying again a few seconds later works.
for attempt in 1 2 3 4 5 6; do
  if hdiutil create -volname "Tamkeen" -srcfolder "$STAGE" -ov -format UDZO "$OUT"; then
    break
  fi
  if [ "$attempt" = 6 ]; then
    echo "hdiutil failed $attempt times; giving up." >&2
    exit 1
  fi
  echo "hdiutil failed (attempt $attempt); trying again in 10 seconds..." >&2
  rm -f "$OUT"
  sleep 10
done
rm -rf "$STAGE"
echo "Built $OUT"
