# adapter/ — Python hardware adapter

FastAPI service that reads temperature probes and streams them to the web UI
over WebSocket. The hardware is encapsulated behind `TemperatureSource`
(`hardware.py`): `SimulatedSource` (default) or `PhidgetSource` (real Phidget
1048).

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000        # simulated source
```

Real Phidget 1048 (after `pip install Phidget22` + driver from phidgets.com):

```bash
ROAST_SOURCE=phidget BT_CHANNEL=0 BT_TC=K ET_CHANNEL=1 ET_TC=K \
  uvicorn main:app --port 8000
```

| Env var          | Default | Meaning                                  |
|------------------|---------|------------------------------------------|
| `ROAST_SOURCE`   | `sim`   | `sim` or `phidget`                       |
| `BT_CHANNEL`     | `0`     | board channel (0-3) for Bean Temp        |
| `ET_CHANNEL`     | `1`     | board channel (0-3) for Env Temp         |
| `BT_TC` / `ET_TC`| `K`     | thermocouple type per probe: J/K/E/T     |
| `PHIDGET_SERIAL` | unset   | pin a specific board by serial number    |

## HTTP / WebSocket API

| Method | Path           | Purpose                                       |
|--------|----------------|-----------------------------------------------|
| POST   | `/roast/start` | begin a roast (clears history, starts clock)  |
| POST   | `/roast/stop`  | end the roast                                 |
| POST   | `/roast/event` | mark event `{type, label}` (TP/DRY_END/FC_START/DROP/…) |
| GET    | `/status`      | current state + full history + events         |
| WS     | `/ws`          | live stream; sends a `snapshot` on connect, then `reading`/`event` messages |

Readings are `{t, bt, et, ror}` — seconds since charge, bean temp °C, env temp
°C, rate-of-rise °C/min. Sampling is `SAMPLE_HZ` (2 Hz); RoR window is
`ROR_WINDOW_S` (30 s). Both are constants at the top of `main.py`.

## Files

- `hardware.py` — `TemperatureSource` interface, `SimulatedSource`, `PhidgetSource`.
  All Phidget-specific code lives here and nowhere else.
- `main.py` — FastAPI app, roast state, background sampler, WebSocket broadcast.
