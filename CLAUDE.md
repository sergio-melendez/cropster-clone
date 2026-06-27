# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repo. Read this
first — it tells you the architecture, how to run/build/test, and the
conventions to follow.

## What this is

A web-based coffee-roast monitor, modeled on Cropster's Roasting Intelligence:
a small **local hardware adapter** (Python) that reads temperature probes and
streams them over WebSocket, plus a **web UI** (React) that draws the live roast
curve and lets the roaster start/stop and mark events.

The hardware is a **Phidget 1048** (PhidgetTemperatureSensor 4-Input): a
4-channel thermocouple board that connects by mini-USB. Cropster calls this a
"Cropster Connector." We talk to it through Phidget's official driver
(libphidget22) + the `Phidget22` Python library — not a custom protocol.

## Architecture

```
 Thermocouples ──> Phidget 1048 ──mini-USB──> libphidget22 (driver)
                                                    │
                                       adapter/  (Python, FastAPI)
                                       hardware encapsulated here
                                                    │  WebSocket ws://localhost:8000/ws
                                                    ▼
                                       web/  (React + Vite + TS)
                                       live roast curve + controls
```

Key design rule: **the hardware is fully encapsulated behind one interface.**
The rest of the app only ever sees `TemperatureSource` (`adapter/hardware.py`).
There are two implementations:

- `SimulatedSource` — a realistic fake roast curve. The default; lets the whole
  app run with no hardware attached.
- `PhidgetSource` — the real Phidget 1048 driver. Channels 0-3, each probe's
  thermocouple type (J/K/E/T) set independently.

You switch sources with an env var (see below) — no code change needed.

## Repo layout

```
adapter/
  hardware.py        TemperatureSource interface + SimulatedSource + PhidgetSource
  main.py            FastAPI app: REST control + /ws WebSocket stream + sampler loop
                     (also mounts the built web UI for the packaged exe)
  run_app.py         bundled-app entry: starts uvicorn + opens the browser
  requirements.txt
web/
  src/
    App.tsx          UI: live stats, start/stop, event buttons, layout
    RoastChart.tsx   Recharts roast curve (BT, ET, RoR, event markers)
    useRoastSocket.ts WebSocket client hook + REST calls; auto-reconnects
    types.ts         shared TS types
  package.json, vite.config.ts, tsconfig.json, index.html
roastmonitor.spec    PyInstaller spec (single-file Windows .exe)
build_windows.ps1    local Windows build script
.github/workflows/build-windows.yml   CI build on a Windows runner
README.md            human-facing quickstart
PACKAGING.md         how to ship the Windows .exe
CLAUDE.md            this file
```

## Run / build / test

**Adapter (terminal 1):**
```bash
cd adapter
pip install -r requirements.txt
uvicorn main:app --reload --port 8000        # simulated source (default)
```

**Web UI (terminal 2):**
```bash
cd web
npm install
npm run dev                                   # http://localhost:5173
npm run build                                 # type-check (tsc -b) + production build
```

There is no test suite yet. The "test" today is: start both, open the UI, click
**Start Roast**, confirm the live curve animates and events mark. When you add
logic, add real tests (pytest for the adapter, vitest for the web).

**Packaging (Windows single-file exe):** `npm run build` in web/, then
`pyinstaller roastmonitor.spec` produces `dist/RoastMonitor.exe`. PyInstaller
can't cross-compile, so the exe is built on Windows — via the GitHub Actions
workflow (recommended) or `build_windows.ps1`. Full details in `PACKAGING.md`.

## Using the real Phidget 1048

1. Install the Phidget driver (libphidget22) from phidgets.com, and the Python
   lib: `pip install Phidget22`.
2. Wire each probe to a board channel (0-3). Note which channel is Bean Temp
   (BT) and which is Env Temp (ET), and each probe's thermocouple type.
3. Start the adapter pointed at the board:
   ```bash
   ROAST_SOURCE=phidget BT_CHANNEL=0 BT_TC=K ET_CHANNEL=1 ET_TC=K \
     uvicorn main:app --port 8000
   ```
   Env vars (defaults): `ROAST_SOURCE=sim`, `BT_CHANNEL=0`, `BT_TC=K`,
   `ET_CHANNEL=1`, `ET_TC=K`, `PHIDGET_SERIAL` (optional, to pin one board).

`PhidgetSource` calls `openWaitForAttachment` and will raise a clear error if the
board/driver isn't present, so failures are obvious.

## Conventions

- Python: type hints, stdlib + FastAPI/pydantic only in the adapter. Keep all
  hardware specifics inside `hardware.py`; never import `Phidget22` elsewhere.
- TypeScript: strict mode is on (`tsconfig.json`); `npm run build` must pass
  clean (no unused locals/params). Keep shared shapes in `types.ts`.
- Temperatures are degrees Celsius end to end. RoR (rate of rise) is C/min,
  computed in the adapter over a 30s window (`ROR_WINDOW_S`).
- The WebSocket protocol is small and explicit — message `type` is one of:
  `snapshot`, `reading`, `event`, `roast_started`, `roast_stopped`. If you add a
  message type, update both `main.py` and `useRoastSocket.ts`/`types.ts`.

## Status & roadmap

Milestone 1 (done): live BT/ET/RoR curve over WebSocket, start/stop, event
markers (Turning Point, Dry End, First Crack, Drop), all working on the
simulator and wired for the real 1048.

Milestone 2 (done): persist completed roasts to SQLite + a history/review view.
A finished roast is saved on `/roast/stop` (curve + events, with denormalized
duration/peak-BT for the list). New REST routes: `GET /roasts` (summaries),
`GET /roasts/{id}` (full curve), `DELETE /roasts/{id}`. Storage is isolated in
`adapter/storage.py` (one `roasts` table, curve/events as JSON blobs); the DB
file is `adapter/roasts.db` (gitignored). The web UI gains a Live/History tab
toggle (`web/src/RoastHistory.tsx`); the review view reuses `RoastChart`.

Not yet built (good next tasks):
- Roast profiles: overlay a target curve and roast-to-template (core Cropster
  feature).
- CSV / Artisan-compatible export.
- Tests (pytest + vitest) and CI.
