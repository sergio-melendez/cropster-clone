"""
Roast persistence (SQLite).

Completed roasts are saved here when a roast is stopped. The live roast loop in
`main.py` never touches the DB while roasting — it only persists the finished
curve + events once, on stop. The history/review view reads back through the
REST endpoints in `main.py`.

One table, `roasts`. The curve (list of {t, bt, et, ror}) and events
(list of {t, type, label}) are stored as JSON blobs: a completed roast is always
read and written whole, so there's nothing to gain from a per-reading table, and
a lot of churn to avoid. Summary columns (duration, max_bt) are denormalized so
the list view doesn't have to parse every blob.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "roasts.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS roasts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  REAL NOT NULL,   -- wall-clock epoch seconds at charge
    finished_at REAL NOT NULL,   -- wall-clock epoch seconds at drop/stop
    duration_s  REAL NOT NULL,   -- roast length in seconds (last point's t)
    max_bt      REAL,            -- peak bean temp, for the list view
    points_json TEXT NOT NULL,   -- [{t, bt, et, ror}, ...]
    events_json TEXT NOT NULL    -- [{t, type, label}, ...]
);

CREATE TABLE IF NOT EXISTS profiles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    created_at  REAL NOT NULL,   -- wall-clock epoch seconds when saved
    source      TEXT NOT NULL,   -- 'roast' | 'csv' | 'artisan'
    duration_s  REAL NOT NULL,   -- last point's t, for the list view
    notes       TEXT,
    points_json TEXT NOT NULL,   -- [{t, bt}, ...] target bean-temp curve
    events_json TEXT NOT NULL    -- [{t, type, label}, ...] optional milestones
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the table if it doesn't exist. Safe to call on every startup."""
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def save_roast(
    started_at: float,
    history: list[dict],
    events: list[dict],
    finished_at: float | None = None,
) -> int:
    """Persist one completed roast and return its new id."""
    finished = finished_at if finished_at is not None else time.time()
    duration = history[-1]["t"] if history else 0.0
    max_bt = max((p["bt"] for p in history), default=None)
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO roasts "
            "(started_at, finished_at, duration_s, max_bt, points_json, events_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                started_at,
                finished,
                duration,
                max_bt,
                json.dumps(history),
                json.dumps(events),
            ),
        )
        return int(cur.lastrowid)


def list_roasts() -> list[dict]:
    """Return roast summaries (no curve), newest first."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, started_at, finished_at, duration_s, max_bt, events_json "
            "FROM roasts ORDER BY started_at DESC"
        ).fetchall()
    return [
        {
            "id": r["id"],
            "started_at": r["started_at"],
            "finished_at": r["finished_at"],
            "duration_s": r["duration_s"],
            "max_bt": r["max_bt"],
            "event_count": len(json.loads(r["events_json"])),
        }
        for r in rows
    ]


def get_roast(roast_id: int) -> dict | None:
    """Return one roast in full (curve + events), or None if it doesn't exist."""
    with _connect() as conn:
        r = conn.execute("SELECT * FROM roasts WHERE id = ?", (roast_id,)).fetchone()
    if r is None:
        return None
    return {
        "id": r["id"],
        "started_at": r["started_at"],
        "finished_at": r["finished_at"],
        "duration_s": r["duration_s"],
        "max_bt": r["max_bt"],
        "history": json.loads(r["points_json"]),
        "events": json.loads(r["events_json"]),
    }


def delete_roast(roast_id: int) -> bool:
    """Delete one roast. Returns True if a row was removed."""
    with _connect() as conn:
        cur = conn.execute("DELETE FROM roasts WHERE id = ?", (roast_id,))
        return cur.rowcount > 0


# ---- profiles (target curves to roast against) -------------------------------
# A profile is a target bean-temp curve: [{t, bt}, ...]. It can come from one of
# our own saved roasts, or be imported from an open format (CSV / Artisan).


def save_profile(
    name: str,
    source: str,
    points: list[dict],
    events: list[dict] | None = None,
    notes: str | None = None,
) -> int:
    """Persist one target profile and return its new id."""
    events = events or []
    duration = points[-1]["t"] if points else 0.0
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO profiles "
            "(name, created_at, source, duration_s, notes, points_json, events_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                name,
                time.time(),
                source,
                duration,
                notes,
                json.dumps(points),
                json.dumps(events),
            ),
        )
        return int(cur.lastrowid)


def list_profiles() -> list[dict]:
    """Return profile summaries (no curve), newest first."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at, source, duration_s, points_json "
            "FROM profiles ORDER BY created_at DESC"
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "created_at": r["created_at"],
            "source": r["source"],
            "duration_s": r["duration_s"],
            "point_count": len(json.loads(r["points_json"])),
        }
        for r in rows
    ]


def get_profile(profile_id: int) -> dict | None:
    """Return one profile in full (curve + events), or None if it doesn't exist."""
    with _connect() as conn:
        r = conn.execute(
            "SELECT * FROM profiles WHERE id = ?", (profile_id,)
        ).fetchone()
    if r is None:
        return None
    return {
        "id": r["id"],
        "name": r["name"],
        "created_at": r["created_at"],
        "source": r["source"],
        "duration_s": r["duration_s"],
        "notes": r["notes"],
        "points": json.loads(r["points_json"]),
        "events": json.loads(r["events_json"]),
    }


def delete_profile(profile_id: int) -> bool:
    """Delete one profile. Returns True if a row was removed."""
    with _connect() as conn:
        cur = conn.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
        return cur.rowcount > 0
