#!/usr/bin/env bash
# Registers amethyst-launcher:// protocol handler pointing to the dev electron binary.
# Run once before `npm run dev`. Safe to run multiple times.

ELECTRON_BIN="$(node -e "process.stdout.write(require('electron'))" 2>/dev/null)"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/amethyst-launcher-dev.desktop"

if [ -z "$ELECTRON_BIN" ]; then
    echo "ERROR: Could not find electron binary. Make sure 'npm install' has been run."
    exit 1
fi

mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=Amethyst Launcher (Dev)
Exec=$ELECTRON_BIN $REPO_DIR %u
MimeType=x-scheme-handler/amethyst-launcher;
Type=Application
NoDisplay=true
EOF

xdg-mime default amethyst-launcher-dev.desktop x-scheme-handler/amethyst-launcher
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "Registered amethyst-launcher:// → $ELECTRON_BIN $REPO_DIR"
echo "Test with: xdg-open amethyst-launcher://startprofile/test"
