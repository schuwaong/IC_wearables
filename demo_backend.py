from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from colour_profile import analyze_image_bytes, image_bytes_from_data_url


ROOT = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 9 * 1024 * 1024


class DemoBackendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_POST(self) -> None:
        if self.path != "/api/colour-profile":
            self.send_error(404, "Unknown endpoint")
            return

        try:
            payload = self._read_json_body()
            data_url = str(payload.get("imageDataUrl") or payload.get("image") or "")
            if not data_url:
                self._send_json({"error": "Missing imageDataUrl"}, status=400)
                return

            result = analyze_image_bytes(image_bytes_from_data_url(data_url))
            self._send_json(result)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=422)
        except Exception as exc:
            self._send_json({"error": f"Could not analyse image: {exc}"}, status=500)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("Empty request body")
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("Image is too large for this demo endpoint")

        raw_body = self.rfile.read(length)
        return json.loads(raw_body.decode("utf-8"))

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the IC_wearables landing page and colour profile API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5189)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DemoBackendHandler)
    print(f"IC_wearables demo backend running at http://{args.host}:{args.port}/")
    print("POST /api/colour-profile accepts JSON: {\"imageDataUrl\": \"data:image/...;base64,...\"}")
    server.serve_forever()


if __name__ == "__main__":
    main()
