#!/usr/bin/env python3
"""
GrandFuck Game Server
Serves the game files over HTTP and handles the DLC custom protocol.

Custom Protocol Endpoints (all GET):
  /api/dlc?action=list
      → Parse DLCs.xml and return all registered DLC entries.

  /api/dlc?action=manifest&path=<dlc_index_path>
      → Read a DLC index.xml and return Name, Author, Version.

  /api/dlc?action=load&path=<file_path>
      → Return raw XML + a lightweight JSON representation of any file.

  /api/dlc?action=resolve&id=<dlc_id>
      → Lookup a DLC id in DLCs.xml and return its src path.
"""

import http.server
import socketserver
import os
import sys
import json
import urllib.parse
import xml.etree.ElementTree as ET

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT = 8765
HOST = "0.0.0.0"
PROTOCOL_VERSION = "dlc/1.0"

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_response(ok, action, data, error=None):
    """Standard JSON envelope for the custom protocol."""
    resp = {
        "ok": ok,
        "protocol": PROTOCOL_VERSION,
        "action": action,
        "data": data
    }
    if error:
        resp["error"] = error
    return resp


def xml_to_dict(elem):
    """Recursively convert an ElementTree element to a plain dict."""
    node = {
        "_name": elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag,
    }
    if elem.attrib:
        node["_attr"] = dict(elem.attrib)
    text = (elem.text or "").strip()
    if text:
        node["_text"] = text
    children = []
    for child in elem:
        children.append(xml_to_dict(child))
    if children:
        node["_children"] = children
    return node


def parse_dlc_list():
    """Parse DLCs.xml and return a list of DLC entries."""
    path = os.path.join(SCRIPT_DIR, "DLCs.xml")
    if not os.path.exists(path):
        return []
    tree = ET.parse(path)
    root = tree.getroot()
    dlcs = []
    for dlc in root.findall("DLC"):
        entry = {"src": dlc.get("src", "")}
        # try to extract an id from the path, e.g. dlc0/index.xml → dlc0
        src = entry["src"]
        if src:
            entry["id"] = src.split("/")[0] if "/" in src else src.replace(".xml", "")
        dlcs.append(entry)
    return dlcs


def parse_dlc_manifest(rel_path):
    """Parse a DLC index.xml and return its manifest fields."""
    path = os.path.join(SCRIPT_DIR, rel_path)
    if not os.path.exists(path):
        return None
    tree = ET.parse(path)
    root = tree.getroot()
    manifest = {}
    for child in root:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        text = (child.text or "").strip()
        manifest[tag] = text
    return manifest


def load_xml_file(rel_path):
    """Load any XML file and return both raw text and parsed dict."""
    path = os.path.join(SCRIPT_DIR, rel_path)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    tree = ET.parse(path)
    root = tree.getroot()
    return {"raw": raw, "json": xml_to_dict(root)}


def resolve_dlc_id(dlc_id):
    """Look up a DLC id in DLCs.xml and return its src path."""
    dlcs = parse_dlc_list()
    for dlc in dlcs:
        if dlc.get("id") == dlc_id:
            return dlc.get("src", "")
    return None

# ---------------------------------------------------------------------------
# Request Handler
# ---------------------------------------------------------------------------

class GrandFuckHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[GrandFuck Server] {self.address_string()} - {format % args}")

    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # ---------------------------------------------------------------
        # Custom Protocol: /api/dlc
        # ---------------------------------------------------------------
        if parsed.path == "/api/dlc":
            qs = urllib.parse.parse_qs(parsed.query)
            action = qs.get("action", [None])[0]

            if action == "list":
                dlcs = parse_dlc_list()
                self._send_json(200, make_response(True, "list", {"dlcs": dlcs}))
                return

            elif action == "manifest":
                path = qs.get("path", [None])[0]
                if not path:
                    self._send_json(400, make_response(False, "manifest", None, "Missing 'path' parameter"))
                    return
                manifest = parse_dlc_manifest(path)
                if manifest is None:
                    self._send_json(404, make_response(False, "manifest", None, f"DLC manifest not found: {path}"))
                    return
                self._send_json(200, make_response(True, "manifest", manifest))
                return

            elif action == "load":
                path = qs.get("path", [None])[0]
                if not path:
                    self._send_json(400, make_response(False, "load", None, "Missing 'path' parameter"))
                    return
                result = load_xml_file(path)
                if result is None:
                    self._send_json(404, make_response(False, "load", None, f"File not found: {path}"))
                    return
                self._send_json(200, make_response(True, "load", result))
                return

            elif action == "resolve":
                dlc_id = qs.get("id", [None])[0]
                if not dlc_id:
                    self._send_json(400, make_response(False, "resolve", None, "Missing 'id' parameter"))
                    return
                src = resolve_dlc_id(dlc_id)
                if src is None:
                    self._send_json(404, make_response(False, "resolve", None, f"DLC id not found: {dlc_id}"))
                    return
                self._send_json(200, make_response(True, "resolve", {"id": dlc_id, "src": src}))
                return

            else:
                self._send_json(400, make_response(False, action or "unknown", None, f"Unknown action: {action}"))
                return

        # ---------------------------------------------------------------
        # Health check / info
        # ---------------------------------------------------------------
        if parsed.path == "/api/status":
            self._send_json(200, {
                "ok": True,
                "protocol": PROTOCOL_VERSION,
                "game": "GrandFuck",
                "dlcs": parse_dlc_list()
            })
            return

        # ---------------------------------------------------------------
        # Static files (default behaviour)
        # ---------------------------------------------------------------
        super().do_GET()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 50)
    print("  GrandFuck Game Server")
    print("=" * 50)
    print(f"  Serving from : {SCRIPT_DIR}")
    print(f"  URL          : http://localhost:{PORT}/")
    try:
        hostname = socketserver.socket.gethostbyname(socketserver.socket.gethostname())
        print(f"  LAN          : http://{hostname}:{PORT}/")
    except Exception:
        pass
    print(f"  Protocol     : {PROTOCOL_VERSION}")
    print("=" * 50)
    print("  Press Ctrl+C to stop the server.")
    print("")

    try:
        with socketserver.TCPServer((HOST, PORT), GrandFuckHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[GrandFuck Server] Shutting down...")
        sys.exit(0)
    except OSError as e:
        print(f"\n[GrandFuck Server] Error: {e}")
        print(f"  Port {PORT} may already be in use.")
        sys.exit(1)


if __name__ == "__main__":
    main()
