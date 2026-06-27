"""
Hardware abstraction layer.

The rest of the app NEVER talks to a Phidget directly. It only ever sees a
`TemperatureSource`. Today we run with `SimulatedSource`. When your board
arrives, fill in `PhidgetSource` and swap one line in main.py — nothing else
changes.
"""

from __future__ import annotations

import math
import random
import time
from abc import ABC, abstractmethod


class TemperatureSource(ABC):
    """A source of temperature readings, in degrees Celsius."""

    #: Human-readable name shown in the UI header (overridden per source).
    label: str = "unknown source"

    @abstractmethod
    def read(self) -> dict:
        """Return the latest reading, e.g. {'bt': 184.2, 'et': 210.5}.

        bt = Bean Temperature, et = Environmental (drum) Temperature.
        """
        ...

    def start(self) -> None:
        """Called when a roast begins. Optional."""

    def stop(self) -> None:
        """Called when a roast ends. Optional."""

    def close(self) -> None:
        """Release hardware handles. Optional."""


class SimulatedSource(TemperatureSource):
    """Generates a believable roast curve so we can build the whole app
    before the real board is connected.

    Profile: hot charge -> turning point ~90C around 75s -> rise through
    drying/maillard -> approaching ~215C, with realistic ET above BT.
    """

    label = "simulated source"

    def __init__(self) -> None:
        self._t0: float | None = None
        self._charge = 200.0   # probe reads hot drum at charge
        self._tp_time = 75.0   # turning point time (s)
        self._tp_temp = 92.0   # turning point bean temp (C)
        self._target = 215.0   # asymptotic target bean temp (C)
        self._tau = 320.0      # rise time constant (s)

    def start(self) -> None:
        self._t0 = time.monotonic()

    def stop(self) -> None:
        self._t0 = None

    def read(self) -> dict:
        # Idle (not roasting): sit near ambient.
        if self._t0 is None:
            return {
                "bt": round(22.0 + random.uniform(-0.2, 0.2), 1),
                "et": round(23.0 + random.uniform(-0.2, 0.2), 1),
            }

        t = time.monotonic() - self._t0

        if t < self._tp_time:
            # Falling from hot charge down to the turning point.
            frac = t / self._tp_time
            bt = self._charge + (self._tp_temp - self._charge) * frac
        else:
            # Exponential approach toward target.
            bt = self._tp_temp + (self._target - self._tp_temp) * (
                1 - math.exp(-(t - self._tp_time) / self._tau)
            )

        # ET sits above BT, with the gap widest early and narrowing.
        et = bt + 55 * math.exp(-t / 350) + 35

        bt += random.uniform(-0.3, 0.3)
        et += random.uniform(-0.5, 0.5)
        return {"bt": round(bt, 1), "et": round(et, 1)}


class PhidgetSource(TemperatureSource):
    """Real source for the **Phidget 1048** (PhidgetTemperatureSensor 4-Input).

    The 1048 connects by mini-USB directly to the computer (no VINT Hub). It
    exposes 4 thermocouple channels (0-3); each channel's type (J/K/E/T) is set
    independently in software, so your Bean and Env probes can differ.

    Requires:
      - the Phidget driver / libphidget22 installed (from phidgets.com)
      - the Python library:  pip install Phidget22

    Args:
      bt_channel / et_channel : which board channel (0-3) each probe is wired to
      bt_tc / et_tc           : thermocouple type for each probe ("J","K","E","T")
      serial                  : board serial number, or None to grab any 1048
      data_interval_ms        : how often the board samples
    """

    def __init__(
        self,
        bt_channel: int = 0,
        et_channel: int | None = 1,
        bt_tc: str = "K",
        et_tc: str = "K",
        serial: int | None = None,
        data_interval_ms: int = 250,
    ) -> None:
        # et_channel=None -> single-probe rig (Bean only). An unconnected
        # thermocouple channel reads garbage, so we simply don't open one.
        try:
            from Phidget22.Devices.TemperatureSensor import TemperatureSensor
            from Phidget22.ThermocoupleType import ThermocoupleType
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "Phidget22 not installed. Run: pip install Phidget22\n"
                "Also install the Phidget driver from phidgets.com."
            ) from e

        self._tc_map = {
            "J": ThermocoupleType.THERMOCOUPLE_TYPE_J,
            "K": ThermocoupleType.THERMOCOUPLE_TYPE_K,
            "E": ThermocoupleType.THERMOCOUPLE_TYPE_E,
            "T": ThermocoupleType.THERMOCOUPLE_TYPE_T,
        }
        self._TemperatureSensor = TemperatureSensor
        self._serial = serial
        self._data_interval_ms = data_interval_ms

        self._bt = self._open_channel(bt_channel, bt_tc)
        self._et = self._open_channel(et_channel, et_tc) if et_channel is not None else None

        et_desc = f"ET ch{et_channel}/{et_tc}" if et_channel is not None else "no ET"
        self.label = f"Phidget 1048 (BT ch{bt_channel}/{bt_tc}, {et_desc})"

    def _open_channel(self, channel: int, tc_type: str):
        tc = tc_type.upper()
        if tc not in self._tc_map:
            raise ValueError(f"Unknown thermocouple type {tc_type!r}; use J/K/E/T")
        s = self._TemperatureSensor()
        if self._serial is not None:
            s.setDeviceSerialNumber(self._serial)
        s.setChannel(channel)
        s.openWaitForAttachment(5000)  # ms; raises if the board isn't found
        s.setThermocoupleType(self._tc_map[tc])
        try:
            s.setDataInterval(self._data_interval_ms)
        except Exception:
            pass  # not all firmware honors this; safe to ignore
        return s

    def read(self) -> dict:
        return {
            "bt": round(self._bt.getTemperature(), 1),
            "et": round(self._et.getTemperature(), 1) if self._et is not None else None,
        }

    def close(self) -> None:
        for s in (getattr(self, "_bt", None), getattr(self, "_et", None)):
            try:
                if s is not None:
                    s.close()
            except Exception:
                pass
