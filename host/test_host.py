import json
import os
import struct
import subprocess
import sys
import tempfile
import time
import unittest

HOST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pwa_link_router_host.py")


def frame(message):
    data = json.dumps(message).encode("utf-8")
    return struct.pack("=I", len(data)) + data


def unframe(raw):
    messages = []
    while raw:
        (length,) = struct.unpack("=I", raw[:4])
        messages.append(json.loads(raw[4 : 4 + length]))
        raw = raw[4 + length :]
    return messages


def run_host(*messages, env=None):
    result = subprocess.run(
        [sys.executable, HOST],
        input=b"".join(frame(m) for m in messages),
        capture_output=True,
        timeout=10,
        env=env,
    )
    return unframe(result.stdout)


class HostTest(unittest.TestCase):
    def test_list_returns_known_browsers(self):
        (response,) = run_host({"action": "list"})
        self.assertTrue(response["ok"])
        ids = [b["id"] for b in response["browsers"]]
        self.assertIn("default", ids)
        self.assertIn("brave", ids)

    def test_custom_command_receives_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "url.txt")
            command = "sh -c 'printf %s \"$1\" > " + out + "' sh {url}"
            (response,) = run_host(
                {"action": "open", "url": "https://example.com/a?b=c&d", "browser": "custom", "command": command}
            )
            self.assertTrue(response["ok"], response)
            for _ in range(50):
                if os.path.exists(out) and os.path.getsize(out):
                    break
                time.sleep(0.05)
            with open(out) as f:
                self.assertEqual(f.read(), "https://example.com/a?b=c&d")

    def test_rejects_non_http_urls(self):
        for url in ("file:///etc/passwd", "javascript:alert(1)", "", "ms-teams:foo"):
            (response,) = run_host({"action": "open", "url": url, "browser": "default"})
            self.assertFalse(response["ok"], url)

    def test_finds_browsers_outside_path(self):
        # Simulates Edge started without the snap/flatpak dirs in its PATH.
        with tempfile.TemporaryDirectory() as home:
            bin_dir = os.path.join(home, ".local", "share", "flatpak", "exports", "bin")
            os.makedirs(bin_dir)
            fake = os.path.join(bin_dir, "com.brave.Browser")
            with open(fake, "w") as f:
                f.write("#!/bin/sh\n")
            os.chmod(fake, 0o755)
            env = {"HOME": home, "PATH": "/usr/bin:/bin"}
            (response,) = run_host({"action": "list"}, env=env)
            brave = next(b for b in response["browsers"] if b["id"] == "brave")
            self.assertTrue(brave["available"])

    def test_unknown_browser(self):
        (response,) = run_host({"action": "open", "url": "https://example.com", "browser": "netscape"})
        self.assertFalse(response["ok"])

    def test_several_messages_in_one_session(self):
        responses = run_host({"action": "list"}, {"action": "nope"})
        self.assertEqual(len(responses), 2)
        self.assertTrue(responses[0]["ok"])
        self.assertFalse(responses[1]["ok"])


if __name__ == "__main__":
    unittest.main()
