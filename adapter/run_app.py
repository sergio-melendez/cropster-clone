"""
Bundled-app entry point.

This is what the packaged Windows .exe runs (see roastmonitor.spec). It starts
the FastAPI server and opens the roaster's default browser at the local app.
For development you don't need this — just use `uvicorn main:app --reload`.

Env vars are the same as the adapter (ROAST_SOURCE, BT_CHANNEL, ...). To ship a
build that talks to the real board by default, set them in the launcher (or a
small .bat next to the exe).
"""

from __future__ import annotations

import os
import threading
import time
import webbrowser

import uvicorn

from main import app

PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "127.0.0.1")


def _open_browser() -> None:
    # Give uvicorn a moment to bind the port before opening the page.
    time.sleep(1.5)
    webbrowser.open(f"http://localhost:{PORT}")


def main() -> None:
    if os.getenv("OPEN_BROWSER", "1") == "1":
        threading.Thread(target=_open_browser, daemon=True).start()
    # Pass the app object directly (not an import string): reload/workers are
    # off, which is what we want inside a frozen single-file exe.
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
