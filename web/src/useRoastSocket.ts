import { useEffect, useRef, useState } from "react";
import type { RoastPoint, RoastEvent } from "./types";

const API = "http://localhost:8000";
const WS = "ws://localhost:8000/ws";

export function useRoastSocket() {
  const [connected, setConnected] = useState(false);
  const [roasting, setRoasting] = useState(false);
  const [history, setHistory] = useState<RoastPoint[]>([]);
  const [events, setEvents] = useState<RoastEvent[]>([]);
  const [live, setLive] = useState<RoastPoint | null>(null);
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
            break;
          case "reading": {
            setRoasting(msg.roasting);
            const pt: RoastPoint = { t: msg.t, bt: msg.bt, et: msg.et, ror: msg.ror };
            setLive(pt);
            if (msg.roasting && msg.t != null) {
              setHistory((h) => [...h, pt]);
            }
            break;
          }
          case "event":
            setEvents((ev) => [...ev, { t: msg.t, type: msg.type_ ?? msg.type, label: msg.label }]);
            break;
          case "roast_started":
            setHistory([]);
            setEvents([]);
            setRoasting(true);
            break;
          case "roast_stopped":
            setRoasting(false);
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

  const start = () => fetch(`${API}/roast/start`, { method: "POST" });
  const stop = () => fetch(`${API}/roast/stop`, { method: "POST" });
  const markEvent = (type: string, label?: string) =>
    fetch(`${API}/roast/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, label }),
    });

  return { connected, roasting, history, events, live, start, stop, markEvent };
}
