# Cropster-clone (roast monitoring)

A web-based coffee roast monitor, structured like Cropster's Roasting
Intelligence: a small **local hardware adapter** plus a **web UI**.

```
 Thermocouples ──> Phidget 1048 ──mini-USB──> Phidget driver
                                                   │
                            adapter/ (Python, FastAPI)   <-- hardware lives here, fully encapsulated
                                                   │  WebSocket (localhost:8000)
                                                   ▼
                            web/ (React + Vite + TS)     <-- live roast curve, controls
```

Hardware: a **Phidget 1048** (4-input thermocouple board, mini-USB) — what
Cropster calls a "Cropster Connector." It's encapsulated behind a
`TemperatureSource` interface (`adapter/hardware.py`) with two implementations:
`SimulatedSource` (a realistic fake roast, the default) and `PhidgetSource` (the
real board). You switch between them with an env var — no code change, and the
web app never changes.

> New here? Read **CLAUDE.md** for the full architecture, commands, and
> conventions — it's written so an AI agent (or a new dev) can get productive in
> one read.

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

## Using the real Phidget 1048

1. Install the Phidget driver (libphidget22) from phidgets.com and the Python
   library: `pip install Phidget22`.
2. Wire each probe to a board channel (0-3); note which is Bean Temp (BT) and
   which is Env Temp (ET), plus each probe's thermocouple type.
3. Start the adapter pointed at the board (no code change needed):
   ```bash
   ROAST_SOURCE=phidget BT_CHANNEL=0 BT_TC=K ET_CHANNEL=1 ET_TC=K \
     uvicorn main:app --port 8000
   ```

Env vars (defaults): `ROAST_SOURCE=sim`, `BT_CHANNEL=0`, `BT_TC=K`,
`ET_CHANNEL=1`, `ET_TC=K`, `PHIDGET_SERIAL` (optional). See `adapter/README.md`
for the full table.
