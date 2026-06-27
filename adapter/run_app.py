"""
Bundled-app entry point.

This is what the packaged Windows .exe runs (see roastmonitor.spec). It:
  1. loads `roastmonitor.env` sitting next to the .exe (if present) so a roaster
     can configure the board without touching env vars or the command line,
  2. starts the FastAPI server, and
  3. opens the roaster's default browser at the local app.

For development you don't need this — just use `uvicorn main:app --reload`.

Config precedence: real environment variables win over the file (so you can
still override on the command line). If no `roastmonitor.env` exists next to the
app, a commented template is written there on first run and the app falls back
to the simulator.
"""

from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

CONFIG_NAME = "roastmonitor.env"

_TEMPLATE = """\
# RoastMonitor configuration.
# Edit, save, then restart RoastMonitor. Lines starting with # are ignored.
#
# Use the real Phidget 1048 board (default is the built-in simulator):
#ROAST_SOURCE=phidget
#
# Which board channel (0-3) each probe is wired to, and its thermocouple type
# (J/K/E/T). For a single-probe (Bean-only) rig, set ET_CHANNEL=none.
#BT_CHANNEL=0
#BT_TC=K
#ET_CHANNEL=1
#ET_TC=K
#
# Only needed if more than one Phidget is attached (the board is auto-discovered):
#PHIDGET_SERIAL=284663
"""


def _app_dir() -> Path:
    """Directory the user sees the app in: next to the .exe when frozen."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _load_config_env() -> None:
    """Load KEY=VALUE lines from roastmonitor.env into os.environ.

    Real env vars take precedence (setdefault). Writes a template on first run
    if the file is missing, so the config is discoverable.
    """
    cfg = _app_dir() / CONFIG_NAME
    if not cfg.exists():
        try:
            cfg.write_text(_TEMPLATE)
            print(f"[config] wrote a template to {cfg} — edit it to use your board.")
        except OSError:
            pass  # read-only location; not fatal, we just use defaults
        return

    print(f"[config] loading {cfg}")
    for raw in cfg.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, val)


def _open_browser(port: int) -> None:
    # Give uvicorn a moment to bind the port before opening the page.
    time.sleep(1.5)
    webbrowser.open(f"http://localhost:{port}")


def main() -> None:
    _load_config_env()  # must run BEFORE importing the app (source is built on import)

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")

    if os.getenv("OPEN_BROWSER", "1") == "1":
        threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    # Imported here (not at module top) so make_source() in main.py sees the env
    # vars we just loaded from the config file.
    from main import app

    # Pass the app object directly (not an import string): reload/workers are
    # off, which is what we want inside a frozen single-file exe.
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
