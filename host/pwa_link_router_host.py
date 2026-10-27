#!/usr/bin/env python3
"""Native messaging host for pwa-link-router.

Receives a URL from the browser extension and opens it in the browser
chosen by the user (the system default, Brave, Chrome, ... or a custom
command).

Protocol (one JSON message per request, length-prefixed as required by
the native messaging spec):

    {"action": "open", "url": "https://...", "browser": "brave"}
    {"action": "open", "url": "https://...", "browser": "custom",
     "command": "firefox --new-tab {url}"}
    {"action": "list"}

Responses:

    {"ok": true}
    {"ok": false, "error": "..."}
    {"ok": true, "browsers": [{"id": "brave", "name": "Brave", "available": true}, ...]}
"""

import json
import os
import shlex
import shutil
import struct
import subprocess
import sys
from urllib.parse import urlsplit

ALLOWED_SCHEMES = {"http", "https"}

# Candidate executables for each known browser, tried in order.
BROWSERS = {
    "default": ("Navigateur par défaut du système", ["xdg-open"]),
    "brave": ("Brave", ["brave-browser", "brave-browser-stable", "brave", "com.brave.Browser"]),
    "chrome": ("Google Chrome", ["google-chrome", "google-chrome-stable"]),
    "chromium": ("Chromium", ["chromium", "chromium-browser"]),
    "firefox": ("Firefox", ["firefox"]),
    "vivaldi": ("Vivaldi", ["vivaldi", "vivaldi-stable"]),
}


def read_message(stream):
    raw_length = stream.read(4)
    if len(raw_length) < 4:
        return None
    (length,) = struct.unpack("=I", raw_length)
    data = stream.read(length)
    if len(data) < length:
        return None
    return json.loads(data.decode("utf-8"))


def write_message(stream, message):
    data = json.dumps(message).encode("utf-8")
    stream.write(struct.pack("=I", len(data)))
    stream.write(data)
    stream.flush()


# Edge started from the desktop may not have the snap and flatpak
# directories in its PATH (Brave is often installed as a snap).
EXTRA_PATH_DIRS = [
    "/snap/bin",
    "/var/lib/flatpak/exports/bin",
    os.path.expanduser("~/.local/share/flatpak/exports/bin"),
    os.path.expanduser("~/.local/bin"),
]


def search_path():
    dirs = os.environ.get("PATH", "").split(os.pathsep)
    return os.pathsep.join(dirs + [d for d in EXTRA_PATH_DIRS if d not in dirs])


def find_executable(browser_id):
    _, candidates = BROWSERS[browser_id]
    for candidate in candidates:
        path = shutil.which(candidate, path=search_path())
        if path:
            return path
    return None


def list_browsers():
    return [
        {"id": browser_id, "name": name, "available": find_executable(browser_id) is not None}
        for browser_id, (name, _) in BROWSERS.items()
    ]


def build_command(message):
    url = message.get("url", "")
    if urlsplit(url).scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError("URL refusée (seuls http et https sont acceptés) : %r" % url)

    browser_id = message.get("browser") or "default"
    if browser_id == "custom":
        template = (message.get("command") or "").strip()
        if not template:
            raise ValueError("Commande personnalisée vide")
        args = shlex.split(template)
        if any("{url}" in arg for arg in args):
            return [arg.replace("{url}", url) for arg in args]
        return args + [url]

    if browser_id not in BROWSERS:
        raise ValueError("Navigateur inconnu : %r" % browser_id)
    executable = find_executable(browser_id)
    if not executable:
        raise ValueError("Navigateur introuvable sur ce système : %s" % BROWSERS[browser_id][0])
    return [executable, url]


def launch(command):
    # Detach so the browser outlives this host process (Edge kills the host
    # once the message exchange is over).
    subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        close_fds=True,
    )


def handle(message):
    action = message.get("action", "open")
    if action == "list":
        return {"ok": True, "browsers": list_browsers()}
    if action == "open":
        launch(build_command(message))
        return {"ok": True}
    raise ValueError("Action inconnue : %r" % action)


def main():
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    while True:
        try:
            message = read_message(stdin)
        except (ValueError, UnicodeDecodeError) as exc:
            write_message(stdout, {"ok": False, "error": "Message illisible : %s" % exc})
            return 1
        if message is None:
            return 0
        try:
            response = handle(message)
        except (ValueError, OSError) as exc:
            response = {"ok": False, "error": str(exc)}
        write_message(stdout, response)


if __name__ == "__main__":
    # Edge may start the host with an unexpected working directory.
    os.chdir(os.path.expanduser("~"))
    sys.exit(main())
