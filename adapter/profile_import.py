"""
Profile file importers.

Parsing of external roast-data files is isolated here (the same way `hardware.py`
hides the Phidget). Each parser takes raw bytes and returns the canonical shape the
rest of the app uses for a target profile:

    points: [{"t": seconds_since_charge, "bt": bean_temp_c}, ...]
    events: [{"t": seconds, "type": str, "label": str}, ...]   (may be empty)

Supported today: generic CSV (a time column + a bean-temp column) and Artisan
`.alog` files. Cropster `.crc` is NOT supported here: it is AES-encrypted and can't
be parsed without Cropster's private key (see the project plan/roadmap).
"""

from __future__ import annotations

import ast
import csv
import io


def _parse_time(value: str) -> float | None:
    """Parse a time cell as seconds. Accepts plain seconds or 'm:ss' / 'h:mm:ss'."""
    value = value.strip()
    if not value:
        return None
    if ":" in value:
        parts = value.split(":")
        try:
            nums = [float(p) for p in parts]
        except ValueError:
            return None
        secs = 0.0
        for n in nums:  # most-significant first: [m, s] or [h, m, s]
            secs = secs * 60 + n
        return secs
    try:
        return float(value)
    except ValueError:
        return None


def parse_csv(data: bytes) -> tuple[list[dict], list[dict]]:
    """Parse a CSV with a time column and a bean-temp column into target points.

    Column detection is by header (case-insensitive): the time column matches
    'time' / 't', and the bean-temp column matches 'bt' / 'bean'. Falls back to
    the first two columns if no header is recognized.
    """
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        raise ValueError("CSV is empty")

    header = [c.strip().lower() for c in rows[0]]
    has_header = not all(_parse_time(c) is not None for c in rows[0][:1])

    t_idx = bt_idx = None
    if has_header:
        for i, name in enumerate(header):
            if t_idx is None and name in ("time", "t", "time (s)", "seconds"):
                t_idx = i
            if bt_idx is None and ("bt" in name or "bean" in name):
                bt_idx = i
    if t_idx is None or bt_idx is None:
        # Fall back to the first two columns.
        t_idx, bt_idx = 0, 1

    data_rows = rows[1:] if has_header else rows
    points: list[dict] = []
    for r in data_rows:
        if len(r) <= max(t_idx, bt_idx):
            continue
        t = _parse_time(r[t_idx])
        try:
            bt = float(r[bt_idx])
        except (ValueError, IndexError):
            continue
        if t is None:
            continue
        points.append({"t": round(t, 2), "bt": round(bt, 1)})

    if not points:
        raise ValueError(
            "No usable rows found. Expected a time column and a bean-temp (BT) column."
        )
    return _normalize(points), []


# Artisan's `timeindex` is a fixed-position list; each slot is a known milestone.
# Slot 0 is CHARGE (used as the time origin, not emitted as an event).
_ARTISAN_SLOTS = [
    ("CHARGE", "Charge"),
    ("DRY_END", "Dry End"),
    ("FC_START", "FC Start"),
    ("FC_END", "FC End"),
    ("SC_START", "SC Start"),
    ("SC_END", "SC End"),
    ("DROP", "Drop"),
    ("COOL", "Cool"),
]


def parse_artisan_alog(data: bytes) -> tuple[list[dict], list[dict]]:
    """Parse an Artisan `.alog` profile (a Python dict literal).

    Uses `timex` (seconds), `temp2` (bean temp / BT), and `timeindex` (indices into
    timex marking CHARGE/DRY/FCs/DROP/...). Time is normalized so CHARGE = 0.
    """
    text = data.decode("utf-8", errors="replace").strip()
    try:
        obj = ast.literal_eval(text)
    except (ValueError, SyntaxError) as e:
        raise ValueError(f"Not a valid Artisan .alog file: {e}") from e
    if not isinstance(obj, dict):
        raise ValueError("Artisan .alog did not contain a profile object")

    timex = obj.get("timex") or []
    temp2 = obj.get("temp2") or []
    if not timex or not temp2:
        raise ValueError("Artisan .alog is missing timex/temp2 series")

    timeindex = obj.get("timeindex") or []
    # timeindex[0] is the CHARGE index (0 means 'not set' in Artisan).
    charge_i = timeindex[0] if timeindex else 0
    t0 = timex[charge_i] if 0 <= charge_i < len(timex) else 0.0

    n = min(len(timex), len(temp2))
    points = [
        {"t": round(timex[i] - t0, 2), "bt": round(float(temp2[i]), 1)}
        for i in range(n)
        if timex[i] - t0 >= 0
    ]

    events: list[dict] = []
    for slot, idx in enumerate(timeindex):
        if slot == 0 or idx <= 0 or idx >= len(timex):
            continue  # slot 0 is charge (the origin); 0 means unset
        if slot >= len(_ARTISAN_SLOTS):
            break
        ev_type, label = _ARTISAN_SLOTS[slot]
        events.append({"t": round(timex[idx] - t0, 2), "type": ev_type, "label": label})

    if not points:
        raise ValueError("Artisan .alog produced no usable points")
    return _normalize(points), events


def _normalize(points: list[dict]) -> list[dict]:
    """Sort by time and shift so the first point starts at t=0."""
    points = sorted(points, key=lambda p: p["t"])
    t0 = points[0]["t"]
    if t0:
        points = [{"t": round(p["t"] - t0, 2), "bt": p["bt"]} for p in points]
    return points


def parse_profile_file(filename: str, data: bytes) -> tuple[str, list[dict], list[dict]]:
    """Dispatch on file extension. Returns (source, points, events).

    `source` is one of 'csv' | 'artisan' for storage. Raises ValueError on an
    unsupported extension (notably `.crc`, which is encrypted) or a parse failure.
    """
    name = (filename or "").lower()
    if name.endswith(".alog"):
        points, events = parse_artisan_alog(data)
        return "artisan", points, events
    if name.endswith(".csv"):
        points, events = parse_csv(data)
        return "csv", points, events
    if name.endswith(".crc"):
        raise ValueError(
            "Cropster .crc files are encrypted and can't be imported. "
            "Export the roast as CSV or an Artisan .alog instead."
        )
    raise ValueError(f"Unsupported file type: {filename!r}. Use .csv or .alog.")
