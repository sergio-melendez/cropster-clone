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
import bisect
import csv
import io
import re


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


# ---- Cropster PDF roast report ----------------------------------------------
# Cropster's exported PDF draws the bean-temp curve as a VECTOR path (~1 point/
# second) and also prints a coarse "30-second measurements" table. We extract the
# high-resolution vector curve and calibrate it (pixel space -> time/°C) using the
# table as ground truth — which also picks the bean curve out from the bottom-temp
# curve (only the bean curve's mapped values match the table). If the curve can't
# be found/validated, we fall back to the table points so the import still works.

_CAL_TOLERANCE_C = 3.0          # max mean residual (°C) to trust the vector curve
_CROPSTER_MAX_POINTS = 800      # cap stored target points (a ~13min roast is ~760)


def _interp(xs: list[float], ys: list[float], x: float) -> float:
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    i = bisect.bisect_left(xs, x)
    x0, x1, y0, y1 = xs[i - 1], xs[i], ys[i - 1], ys[i]
    return y0 if x1 == x0 else y0 + (y1 - y0) * ((x - x0) / (x1 - x0))


def _cropster_table(text: str) -> list[tuple[float, float]]:
    """(seconds, bean_temp) pairs from the printed table + milestone lines."""
    pts = set()
    for m in re.finditer(r"(\d+):(\d{2})\s+(\d{1,3},\d)", text):
        secs = int(m.group(1)) * 60 + int(m.group(2))
        bt = float(m.group(3).replace(",", "."))
        pts.add((secs, bt))
    return sorted(pts)


def _cropster_events(text: str, total_s: float) -> list[dict]:
    events: list[dict] = []
    m = re.search(r"(\d+):(\d{2})\s+\d{1,3},\d[^\n]*(?:[Pp]rimer crac|[Ff]irst [Cc]rack)", text)
    if m:
        events.append({"t": float(int(m.group(1)) * 60 + int(m.group(2))),
                       "type": "FC_START", "label": "First Crack"})
    events.append({"t": round(total_s, 2), "type": "DROP", "label": "Drop"})
    return events


def _cropster_title(text: str) -> str | None:
    m = re.search(r"\[[A-Za-z]+-\d+\][^\n]*", text)
    return m.group(0).strip() if m else None


def _long_vector_subpaths(content: str) -> list[list[tuple[float, float]]]:
    """On-curve points of each stroked subpath, grouped by moveto (`m`)."""
    subs: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    stack: list[float] = []
    for tok in content.split():
        try:
            stack.append(float(tok))
            continue
        except ValueError:
            pass
        if tok in ("m", "l") and len(stack) >= 2:
            x, y = stack[-2], stack[-1]
            if tok == "m":
                if len(cur) > 3:
                    subs.append(cur)
                cur = [(x, y)]
            else:
                cur.append((x, y))
        elif tok == "c" and len(stack) >= 6:   # bezier: keep the on-curve endpoint
            cur.append((stack[-2], stack[-1]))
        stack = []
    if len(cur) > 3:
        subs.append(cur)
    return [s for s in subs if len(s) > 100]


def _calibrate(subpath, table, total_s):
    """Map a subpath to [{t,bt}] using the table; return (points, mean_resid)."""
    pts = sorted(subpath)                       # by x (time increases L->R)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    if xs[-1] == xs[0]:
        return None
    # Sample curve y at each table time, then linear-regress bt = a*y + b.
    Y, B = [], []
    for tk, btk in table:
        xk = xs[0] + (xs[-1] - xs[0]) * (tk / total_s)
        Y.append(_interp(xs, ys, xk))
        B.append(btk)
    n = len(Y)
    sy, sb = sum(Y), sum(B)
    den = n * sum(v * v for v in Y) - sy * sy
    if den == 0:
        return None
    a = (n * sum(Y[i] * B[i] for i in range(n)) - sy * sb) / den
    b = (sb - a * sy) / n
    resid = sum(abs(a * Y[i] + b - B[i]) for i in range(n)) / n
    points = [{"t": round((x - xs[0]) / (xs[-1] - xs[0]) * total_s, 2),
               "bt": round(a * y + b, 1)} for x, y in zip(xs, ys)]
    return points, resid


def parse_cropster_pdf(data: bytes) -> tuple[list[dict], list[dict], str | None]:
    """Extract the high-res bean curve (+ events, title) from a Cropster PDF."""
    try:
        from pypdf import PdfReader
    except ImportError as e:  # pragma: no cover
        raise ValueError("PDF import needs pypdf (pip install pypdf).") from e

    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((pg.extract_text() or "") for pg in reader.pages)
    table = _cropster_table(text)
    if len(table) < 2:
        raise ValueError(
            "This doesn't look like a Cropster roast report — no measurements "
            "table found. Export the roast detail as PDF from Cropster."
        )
    total_s = table[-1][0]
    title = _cropster_title(text)
    events = _cropster_events(text, total_s)

    # Best-calibrating long vector path across all pages = the bean curve.
    best = None
    for pg in reader.pages:
        try:
            content = pg.get_contents().get_data().decode("latin1", "replace")
        except Exception:
            continue
        for sub in _long_vector_subpaths(content):
            cal = _calibrate(sub, table, total_s)
            if cal and (best is None or cal[1] < best[1]):
                best = cal

    if best is not None and best[1] <= _CAL_TOLERANCE_C:
        points = best[0]
    else:
        # Couldn't isolate/validate the plotted curve — use the table itself.
        points = [{"t": float(t), "bt": bt} for t, bt in table]

    points = _normalize(points)
    if len(points) > _CROPSTER_MAX_POINTS:
        step = len(points) / _CROPSTER_MAX_POINTS
        idxs = sorted({int(i * step) for i in range(_CROPSTER_MAX_POINTS)} | {len(points) - 1})
        points = [points[i] for i in idxs]
    return points, events, title


def parse_profile_file(
    filename: str, data: bytes
) -> tuple[str, list[dict], list[dict], str | None]:
    """Dispatch on file extension. Returns (source, points, events, suggested_name).

    `source` is 'csv' | 'artisan' | 'cropster_pdf'. `suggested_name` is a name
    pulled from the file's contents (PDF only), or None to let the caller fall
    back to the filename. Raises ValueError on an unsupported extension (notably
    `.crc`, which is encrypted) or a parse failure.
    """
    name = (filename or "").lower()
    if name.endswith(".alog"):
        points, events = parse_artisan_alog(data)
        return "artisan", points, events, None
    if name.endswith(".csv"):
        points, events = parse_csv(data)
        return "csv", points, events, None
    if name.endswith(".pdf"):
        points, events, title = parse_cropster_pdf(data)
        return "cropster_pdf", points, events, title
    if name.endswith(".crc"):
        raise ValueError(
            "Cropster .crc files are encrypted and can't be imported. "
            "Export the roast as a PDF (or CSV / Artisan .alog) instead."
        )
    raise ValueError(f"Unsupported file type: {filename!r}. Use .pdf, .csv or .alog.")
