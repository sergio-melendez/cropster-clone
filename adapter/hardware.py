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
    """Drop-in skeleton for a real Phidget board.

    Requires the Phidget22 Python library:  pip install Phidget22
    (and the Phidget driver / libphidget22 installed on the machine).

    Fill in the channel/serial/thermocouple details once you know your board
    model (e.g. Phidget 1048 direct-USB, or a VINT Hub + TMP1101 module).
    The two channels below map to your BT and ET probes.
    """

    def __init__(
        self,
        bt_channel: int = 0,
        et_channel: int = 1,
        serial: int | None = None,   # board serial number, or None for "any"
        hub_port: int | None = None,  # set if using a VINT Hub
        tc_type: str = "K",          # J, K, E, or T
    ) -> None:
        try:
            from Phidget22.Devices.TemperatureSensor import TemperatureSensor
            from Phidget22.ThermocoupleType import ThermocoupleType
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "Phidget22 not installed. Run: pip install Phidget22\n"
                "Also install the Phidget driver from phidgets.com."
            ) from e

        tc_map = {
            "J": ThermocoupleType.THERMOCOUPLE_TYPE_J,
            "K": ThermocoupleType.THERMOCOUPLE_TYPE_K,
            "E": ThermocoupleType.THERMOCOUPLE_TYPE_E,
            "T": ThermocoupleType.THERMOCOUPLE_TYPE_T,
        }

        def _make(channel: int) -> "TemperatureSensor":
            s = TemperatureSensor()
            if serial is not None:
                s.setDeviceSerialNumber(serial)
            if hub_port is not None:
                s.setHubPort(hub_port)
            s.setChannel(channel)
            s.openWaitForAttachment(5000)  # ms
            try:
                s.setThermocoupleType(tc_map[tc_type.upper()])
            except Exception:
                pass  # RTD sensors won't accept this; ignore.
            return s

        self._bt = _make(bt_channel)
        self._et = _make(et_channel)

    def read(self) -> dict:
        return {
            "bt": round(self._bt.getTemperature(), 1),
            "et": round(self._et.getTemperature(), 1),
        }

    def close(self) -> None:
        for s in (getattr(self, "_bt", None), getattr(self, "_et", None)):
            try:
                if s is not None:
                    s.close()
            except Exception:
                pass
