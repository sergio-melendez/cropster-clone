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

Milestone 3 (done): roast profiles + roast-over-target. A profile is a target
bean-temp curve (`[{t, bt}]`) stored in a `profiles` table. Sources: save one
of our own roasts as a profile (`POST /profiles`), or import an open format
(`POST /profiles/import` — CSV or Artisan `.alog`; parsers isolated in
`adapter/profile_import.py`). Routes also include `GET /profiles`,
`GET /profiles/{id}`, `DELETE /profiles/{id}`. The Live view gains a "Roast
against" selector that overlays the target curve (`RoastChart` `target` prop),
plus a live Δ-to-target readout and a drift alert (`DELTA_ALERT_C`, default 5°C).
Delta/alerts are computed client-side from the existing `reading` stream — the
WebSocket protocol is unchanged. New web files: `RoastProfiles.tsx`, `profile.ts`
(target interpolation). Profile import needs `python-multipart`.

Milestone 4 (done): import profiles from Cropster **PDF** roast reports. The PDF
draws the bean curve as a vector path (~1 pt/s) and prints a coarse 30s table;
`parse_cropster_pdf` (in `adapter/profile_import.py`, via `pypdf`) extracts the
vector curve and calibrates pixel→time/°C using the table as ground truth — which
also auto-selects the bean curve over the bottom-temp curve (lowest residual; the
sample calibrates to <0.1°C). Falls back to the table points if no curve
validates. `.pdf` is added to the `POST /profiles/import` dispatch; the importer
also returns a suggested profile name (the PDF's `[PR-####] …` title). Needs
`pypdf` (added to requirements + the PyInstaller spec).

Note: Cropster `.crc` files are **AES-encrypted** (verified: entropy ~8.0, no
plaintext) and can't be parsed without Cropster's key. `.crc` import is rejected
with a clear message; the **PDF export is the supported Cropster→app path**.
Revisit `.crc` via the Cropster API or a real key.

Not yet built (good next tasks):
- CSV / Artisan-compatible *export* (we import; export is the inverse).
- Drift-alert thresholds as user settings; server-side active-profile state.
- Tests (pytest + vitest) and CI.
