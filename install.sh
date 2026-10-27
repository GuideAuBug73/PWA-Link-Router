#!/usr/bin/env bash
# Installs the native messaging host for the current user.
set -euo pipefail

EXTENSION_ID="${1:-hncnnfdenhfdmlplbicaogigpjecklje}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)/host"
INSTALL_DIR="$HOME/.local/share/pwa-link-router"
HOST_PATH="$INSTALL_DIR/pwa_link_router_host.py"

# Browsers that may run the extension (Edge first, the others for testing).
MANIFEST_DIRS=(
  "$HOME/.config/microsoft-edge/NativeMessagingHosts"
  "$HOME/.config/microsoft-edge-beta/NativeMessagingHosts"
  "$HOME/.config/microsoft-edge-dev/NativeMessagingHosts"
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/chromium/NativeMessagingHosts"
)

command -v python3 >/dev/null || { echo "python3 est requis." >&2; exit 1; }

install -Dm755 "$SRC_DIR/pwa_link_router_host.py" "$HOST_PATH"

for dir in "${MANIFEST_DIRS[@]}"; do
  # Only register with browsers that are actually set up for this user.
  [ -d "$(dirname "$dir")" ] || continue
  mkdir -p "$dir"
  sed -e "s|@HOST_PATH@|$HOST_PATH|" -e "s|@EXTENSION_ID@|$EXTENSION_ID|" \
    "$SRC_DIR/com.pwa_link_router.host.json.in" > "$dir/com.pwa_link_router.host.json"
  echo "Hôte enregistré dans $dir"
done

echo "Hôte installé dans $HOST_PATH (extension autorisée : $EXTENSION_ID)"
