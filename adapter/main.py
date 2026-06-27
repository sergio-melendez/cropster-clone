"""
Cropster-clone local adapter.

Run:  uvicorn main:app --reload --port 8000

- POST /roast/start   -> begin a roast (clears history, starts the clock)
- POST /roast/stop    -> end the roast
- POST /roast/event   -> mark an event (TP, DRY_END, FC_START, DROP, ...)
- GET  /status        -> current state + full history
- WS   /ws            -> live stream of readings, one JSON message per sample

Swap SimulatedSource -> PhidgetSource (see hardware.py) when the board arrives.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from hardware import PhidgetSource, SimulatedSource, TemperatureSource

SAMPLE_HZ = 2.0                 # readings per second
ROR_WINDOW_S = 30.0            # window for rate-of-rise (delta BT over time)

# ---- source selection --------------------------------------------------------
# Default is the simulator. To use the real Phidget 1048, start the adapter with:
#
#   ROAST_SOURCE=phidget uvicorn main:app --port 8000
#
# Tune which channel/type each probe is via env vars (defaults shown):
#   BT_CHANNEL=0  BT_TC=K   ET_CHANNEL=1  ET_TC=K
# Channels are the board ports 0-3; TC type is one of J/K/E/T.


def make_source() -> TemperatureSource:
    if os.getenv("ROAST_SOURCE", "sim").lower() == "phidget":
        return PhidgetSource(
            bt_channel=int(os.getenv("BT_CHANNEL", "0")),
            et_channel=int(os.getenv("ET_CHANNEL", "1")),
            bt_tc=os.getenv("BT_TC", "K"),
            et_tc=os.getenv("ET_TC", "K"),
            serial=(int(os.environ["PHIDGET_SERIAL"]) if os.getenv("PHIDGET_SERIAL") else None),
        )
    return SimulatedSource()


source: TemperatureSource = make_source()
# -----------------------------------------------------------------------------


class RoastState:
    def __init__(self) -> None:
        self.roasting = False
        self.t0: float | None = None
        self.history: list[dict] = []          # [{t, bt, et, ror}, ...]
        self.events: list[dict] = []           # [{t, type, label}, ...]
        self._bt_window: deque = deque()       # (t, bt) for RoR

    def start(self) -> None:
        self.roasting = True
        self.t0 = time.monotonic()
        self.history.clear()
        self.events.clear()
        self._bt_window.clear()
        source.start()

    def stop(self) -> None:
        self.roasting = False
        source.stop()

    def elapsed(self) -> float:
        return 0.0 if self.t0 is None else time.monotonic() - self.t0

    def compute_ror(self, t: float, bt: float) -> float:
        """Rate of rise in C/min over ROR_WINDOW_S."""
        self._bt_window.append((t, bt))
        while self._bt_window and t - self._bt_window[0][0] > ROR_WINDOW_S:
            self._bt_window.popleft()
        if len(self._bt_window) < 2:
            return 0.0
        t0, bt0 = self._bt_window[0]
        dt = t - t0
        if dt <= 0:
            return 0.0
        return round((bt - bt0) / dt * 60.0, 1)


state = RoastState()


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def sampler() -> None:
    """Background loop: sample the source, compute RoR, broadcast."""
    interval = 1.0 / SAMPLE_HZ
    while True:
        reading = source.read()
        if state.roasting:
            t = round(state.elapsed(), 2)
            ror = state.compute_ror(t, reading["bt"])
            point = {"t": t, "bt": reading["bt"], "et": reading["et"], "ror": ror}
            state.history.append(point)
            await manager.broadcast({"type": "reading", **point, "roasting": True})
        else:
            await manager.broadcast(
                {"type": "reading", "t": None, "bt": reading["bt"],
                 "et": reading["et"], "ror": 0.0, "roasting": False}
            )
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(sampler())
    yield
    task.cancel()
    source.close()


app = FastAPI(title="Cropster-clone adapter", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # dev only; lock down for production
    allow_methods=["*"],
    allow_headers=["*"],
)


class EventIn(BaseModel):
    type: str
    label: str | None = None


@app.post("/roast/start")
async def roast_start():
    state.start()
    await manager.broadcast({"type": "roast_started"})
    return {"ok": True, "roasting": True}


@app.post("/roast/stop")
async def roast_stop():
    state.stop()
    await manager.broadcast({"type": "roast_stopped"})
    return {"ok": True, "roasting": False}


@app.post("/roast/event")
async def roast_event(ev: EventIn):
    if not state.roasting:
        return {"ok": False, "error": "not roasting"}
    entry = {"t": round(state.elapsed(), 2), "type": ev.type, "label": ev.label or ev.type}
    state.events.append(entry)
    await manager.broadcast({"type": "event", **entry})
    return {"ok": True, "event": entry}


@app.get("/status")
async def status():
    return {
        "roasting": state.roasting,
        "elapsed": round(state.elapsed(), 2),
        "history": state.history,
        "events": state.events,
        "sample_hz": SAMPLE_HZ,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    # Send current history so a late-joining client catches up.
    await ws.send_json({"type": "snapshot", "history": state.history,
                        "events": state.events, "roasting": state.roasting})
    try:
        while True:
            await ws.receive_text()  # keepalive / ignore client messages
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ---- serve the built web UI --------------------------------------------------
# When packaged with PyInstaller the build is unpacked next to the exe at
# `web_dist`; in a normal checkout it lives at ../web/dist. If neither exists
# (e.g. running the adapter before `npm run build`), the API still works and the
# UI is simply served by Vite during dev.
def _web_dist() -> Path | None:
    bundle = getattr(sys, "_MEIPASS", None)
    candidates = []
    if bundle:
        candidates.append(Path(bundle) / "web_dist")
    here = Path(__file__).resolve().parent
    candidates.append(here.parent / "web" / "dist")
    for c in candidates:
        if c.is_dir():
            return c
    return None


_dist = _web_dist()
if _dist is not None:
    # Mounted LAST so it never shadows the API/WS routes above.
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="web")
