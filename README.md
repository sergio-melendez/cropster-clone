# Cropster-clone (roast monitoring)

A web-based coffee roast monitor, structured like Cropster's Roasting
Intelligence: a small **local hardware adapter** plus a **web UI**.

```
 Probes ──> Phidget board ──USB──> Phidget driver
                                        │
                            adapter/ (Python, FastAPI)   <-- hardware lives here, fully encapsulated
                                        │  WebSocket (localhost:8000)
                                        ▼
                            web/ (React + Vite + TS)     <-- live roast curve, controls
```

The hardware is encapsulated behind a `TemperatureSource` interface
(`adapter/hardware.py`). Right now it runs on `SimulatedSource` (a realistic
fake roast). When your Phidget board arrives, fill in `PhidgetSource` and change
one line in `adapter/main.py` — the web app does not change at all.

## Run it (two terminals)

**1. Adapter**
```bash
cd adapter
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Web UI**
```bash
cd web
npm install
npm run dev
```
Open http://localhost:5173 — you should see "● adapter connected". Click
**Start Roast** to watch the live BT / ET / RoR curve and mark events.

## What's built (milestone 1)

- Live temperature stream (Bean Temp, Env Temp) over WebSocket
- Rate of Rise (RoR) computed over a 30s window
- Start / stop a roast; mark events (Turning Point, Dry End, First Crack, Drop)
- Live roast curve with event markers (Recharts)

## Next milestones (not yet built)

- Persist roasts (SQLite) + history/review view
- Roast profiles / target curve overlay (roast-to-a-template)
- Multiple machines, batch/green-coffee metadata
- Export (CSV / Artisan-compatible)

## When the board arrives

1. `pip install Phidget22` and install the Phidget driver from phidgets.com.
2. In `adapter/hardware.py`, the `PhidgetSource` skeleton is ready — set your
   `bt_channel`, `et_channel`, thermocouple type (J/K/E/T), and serial/hub port.
3. In `adapter/main.py`, swap `source = SimulatedSource()` for
   `source = PhidgetSource(...)`.
```
