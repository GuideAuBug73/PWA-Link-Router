#!/usr/bin/env bash
set -euo pipefail

rm -rf "$HOME/.local/share/pwa-link-router"
for browser in microsoft-edge microsoft-edge-beta microsoft-edge-dev google-chrome chromium; do
  rm -f "$HOME/.config/$browser/NativeMessagingHosts/com.pwa_link_router.host.json"
done
echo "Hôte désinstallé."
