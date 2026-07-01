import { useEffect, useRef, useState } from "react";
import type { RoastPoint, RoastEvent } from "./types";
import { API } from "./api";

const WS =
  (import.meta.env.DEV
    ? "ws://localhost:8000"
    : (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host) + "/ws";

export function useRoastSocket() {
  const [connected, setConnected] = useState(false);
  const [roasting, setRoasting] = useState(false);
  const [history, setHistory] = useState<RoastPoint[]>([]);
  const [events, setEvents] = useState<RoastEvent[]>([]);
  const [live, setLive] = useState<RoastPoint | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sourceOk, setSourceOk] = useState(true);   // false when the probe/source drops
  // Bumps each time a roast is saved, so the history view can refresh.
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 1000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "snapshot":
            setHistory(msg.history ?? []);
            setEvents(msg.events ?? []);
            setRoasting(msg.roasting);
            if (msg.source) setSource(msg.source);
            if (msg.source_ok != null) setSourceOk(msg.source_ok);
            break;
          case "reading": {
            setRoasting(msg.roasting);
            if (msg.source_ok != null) setSourceOk(msg.source_ok);
            const pt: RoastPoint = { t: msg.t, bt: msg.bt, et: msg.et, ror: msg.ror };
            setLive(pt);
            if (msg.roasting && msg.t != null) {
              setHistory((h) => [...h, pt]);
            }
            break;
          }
          case "event":
            setEvents((ev) => [...ev, { t: msg.t, type: msg.type_ ?? msg.type, label: msg.label, bt: msg.bt ?? undefined }]);
            break;
          case "roast_started":
            setHistory([]);
            setEvents([]);
            setRoasting(true);
            break;
          case "roast_stopped":
            setRoasting(false);
            if (msg.roast_id != null) setLastSavedId(msg.roast_id);
            break;
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const post = (path: string, body?: object) =>
    fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  const start = (startWeight?: number | null) => post("/roast/start", { start_weight: startWeight ?? null });
  const stop = (endWeight?: number | null) => post("/roast/stop", { end_weight: endWeight ?? null });
  const abort = () => post("/roast/abort");
  const markEvent = (type: string, label?: string, bt?: number, t?: number) =>
    post("/roast/event", { type, label, bt, t });

  return { connected, roasting, history, events, live, source, sourceOk, lastSavedId, start, stop, abort, markEvent };
}
