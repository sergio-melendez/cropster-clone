# Packaging & shipping (Windows)

The goal: hand the roaster a single **`RoastMonitor.exe`**. They double-click it,
their browser opens to the live app, and they roast. No Python, no Node, no
terminal.

## How it's bundled

- The web UI is built to static files (`web/dist`) and **served by the Python
  adapter itself**, so the whole app is one server on one port (`:8000`).
- `adapter/run_app.py` is the entry point: it starts the server and opens the
  browser.
- PyInstaller (`roastmonitor.spec`) freezes that into one `.exe` with the UI,
  uvicorn, and the Phidget Python library all inside.

```
RoastMonitor.exe
 ├─ Python runtime + adapter (FastAPI/uvicorn)
 ├─ Phidget22 (Python wrapper)
 └─ web_dist/  (the built React UI)
```

## Important: you can't build the .exe on a Mac

PyInstaller does not cross-compile. The Windows binary must be produced on
Windows. Two supported paths:

### A. GitHub Actions (recommended — no Windows machine needed)

`.github/workflows/build-windows.yml` builds on a `windows-latest` runner.

1. Push this repo to GitHub.
2. Go to the **Actions** tab → **Build Windows exe** → **Run workflow**
   (or push a tag like `v0.1.0` to trigger it).
3. When it finishes, download **RoastMonitor-windows** from the run's
   *Artifacts* section. That's your `.exe`.

Free tier: public repos build for free with no minute cap; private repos get
~2,000 free minutes/month (Windows runners count at 2×, so ~1,000 Windows
minutes) — plenty for occasional builds.

### B. On a Windows machine (your fallback)

With Node 18+ and Python 3.10+ installed, from the repo root in PowerShell:

```powershell
.\build_windows.ps1
```

Output: `dist\RoastMonitor.exe`.

## The one thing not in the exe: the Phidget driver

`libphidget22` is a system USB driver, so it can't live inside the exe — it's
installed once per machine. This is the same requirement Cropster has.

On the target Windows laptop, before first run:

1. Install the **Phidget driver** from phidgets.com (the "Phidget Control Panel"
   / libphidget22 installer).
2. Plug in the Phidget 1048 by USB; confirm it shows up in the Control Panel.

## Shipping a build that uses the real board by default

The exe defaults to the **simulator**. To make a build talk to the 1048 on
launch, put a small `RoastMonitor.bat` next to the exe:

```bat
@echo off
set ROAST_SOURCE=phidget
set BT_CHANNEL=0
set BT_TC=K
set ET_CHANNEL=1
set ET_TC=J
RoastMonitor.exe
```

The roaster runs the `.bat` instead of the exe directly. (Adjust channels/types
to however the probes are wired — see the env-var table in `adapter/README.md`.)

## Target-laptop experience, end to end

1. Install the Phidget driver (once).
2. Copy over `RoastMonitor.exe` (+ optional `.bat`).
3. Double-click → browser opens to the roast monitor → **Start Roast**.

## Notes / future polish

- The spec uses `console=True` so a log window is visible (handy while you're
  still shaking things out). Flip to `console=False` in `roastmonitor.spec` for
  a silent launch once it's stable.
- For a true installer (Start-menu shortcut, bundled driver, auto-update),
  wrap the exe with Inno Setup later — not needed for a single machine.
- Code-signing avoids the Windows SmartScreen "unknown publisher" prompt. Until
  signed, the roaster clicks *More info → Run anyway* on first launch.
