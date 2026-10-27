#!/usr/bin/env python3
"""Send one message to the installed host, the same way the extension does.

Usage: selftest.py [URL] [BROWSER]
       selftest.py list
"""

import json
import os
import struct
import subprocess
import sys

HOST = os.path.expanduser('~/.local/share/pwa-link-router/pwa_link_router_host.py')


def main():
    args = sys.argv[1:]
    if args[:1] == ["list"]:
        message = {"action": "list"}
    else:
        url = args[0] if args else "https://example.com"
        browser = args[1] if len(args) > 1 else "brave"
        message = {"action": "open", "url": url, "browser": browser}
    data = json.dumps(message).encode("utf-8")
    result = subprocess.run([HOST], input=struct.pack("=I", len(data)) + data, capture_output=True, timeout=10)
    raw = result.stdout
    if len(raw) < 4:
        print("Pas de réponse de l'hôte.", result.stderr.decode(), file=sys.stderr)
        return 1
    (length,) = struct.unpack("=I", raw[:4])
    print(json.dumps(json.loads(raw[4 : 4 + length]), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
