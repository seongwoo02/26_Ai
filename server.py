from __future__ import annotations

import json
import mimetypes
import os
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LEADERBOARD_PATH = ROOT / "leaderboard.json"
MAX_ENTRIES = 10


def load_entries() -> list[dict]:
    if not LEADERBOARD_PATH.exists():
        return []

    try:
        with LEADERBOARD_PATH.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except (json.JSONDecodeError, OSError):
        return []

    if not isinstance(payload, list):
        return []

    entries = []
    for item in payload:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "")).strip()[:16]
        score = item.get("score")
        created_at = str(item.get("created_at", ""))
        if not name or not isinstance(score, (int, float)):
            continue

        entries.append(
            {
                "name": name,
                "score": round(float(score), 1),
                "created_at": created_at,
            }
        )

    return sort_entries(entries)[:MAX_ENTRIES]


def save_entries(entries: list[dict]) -> None:
    with LEADERBOARD_PATH.open("w", encoding="utf-8") as file:
        json.dump(entries[:MAX_ENTRIES], file, ensure_ascii=False, indent=2)


def reset_entries() -> None:
    save_entries([])


def sort_entries(entries: list[dict]) -> list[dict]:
    return sorted(
        entries,
        key=lambda item: (-float(item["score"]), item.get("created_at", "")),
    )


class GameHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/leaderboard":
            self.handle_get_leaderboard()
            return
        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/leaderboard":
            self.handle_post_leaderboard()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def handle_get_leaderboard(self) -> None:
        self.send_json({"entries": load_entries()})

    def handle_post_leaderboard(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self.send_json({"error": "Request body is required."}, HTTPStatus.BAD_REQUEST)
            return

        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json({"error": "Invalid JSON payload."}, HTTPStatus.BAD_REQUEST)
            return

        name = str(payload.get("name", "")).strip()
        score = payload.get("score")

        if not name:
            self.send_json({"error": "Nickname is required."}, HTTPStatus.BAD_REQUEST)
            return
        if len(name) > 16:
            name = name[:16]
        if not isinstance(score, (int, float)):
            self.send_json({"error": "Score must be numeric."}, HTTPStatus.BAD_REQUEST)
            return

        normalized_score = round(float(score), 1)
        if normalized_score < 0:
            self.send_json({"error": "Score must be positive."}, HTTPStatus.BAD_REQUEST)
            return

        entries = load_entries()
        entries.append(
            {
                "name": name,
                "score": normalized_score,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        entries = sort_entries(entries)[:MAX_ENTRIES]
        save_entries(entries)
        self.send_json({"entries": entries}, HTTPStatus.CREATED)

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def guess_type(self, path: str) -> str:
        if path.endswith(".js"):
            return "application/javascript; charset=utf-8"
        if path.endswith(".css"):
            return "text/css; charset=utf-8"
        if path.endswith(".html"):
            return "text/html; charset=utf-8"
        return mimetypes.guess_type(path)[0] or "application/octet-stream"


def run() -> None:
    port = int(os.environ.get("PORT", "8000"))
    reset_entries()
    server = ThreadingHTTPServer(("0.0.0.0", port), GameHandler)
    print(f"Serving Arrow Dodge on http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
