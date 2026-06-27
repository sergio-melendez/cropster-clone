import { useEffect, useState } from "react";
import { useRoastSocket } from "./useRoastSocket";
import RoastChart from "./RoastChart";
import RoastHistory from "./RoastHistory";
import RoastProfiles from "./RoastProfiles";
import { getProfile, listProfiles } from "./api";
import { interpolateTarget } from "./profile";
import type { Profile, ProfileMeta } from "./types";

const EVENTS: { type: string; label: string }[] = [
  { type: "TP", label: "Turning Point" },
  { type: "DRY_END", label: "Dry End" },
  { type: "FC_START", label: "First Crack" },
  { type: "DROP", label: "Drop" },
];

// How far (°C) the bean temp may drift from the target before we flag it.
const DELTA_ALERT_C = 5;

type View = "live" | "history" | "profiles";

function fmtTime(s: number | null | undefined): string {
  if (s == null) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 110 }}>
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

export default function App() {
  const { connected, roasting, history, events, live, lastSavedId, start, stop, markEvent } =
    useRoastSocket();
  const [view, setView] = useState<View>("live");

  // Target profile to roast against (overlay + live delta + alerts).
  const [profileList, setProfileList] = useState<ProfileMeta[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);

  // Keep the selector list fresh (also picks up newly saved/imported profiles).
  useEffect(() => {
    listProfiles().then(setProfileList).catch(() => {});
  }, [view, lastSavedId]);

  const onPickProfile = (id: number | null) => {
    if (id == null) {
      setActiveProfile(null);
      return;
    }
    getProfile(id).then(setActiveProfile).catch(() => setActiveProfile(null));
  };

  // Live deviation from the target at the current roast time.
  const target = activeProfile?.points;
  const targetBt =
    roasting && live?.t != null && target ? interpolateTarget(target, live.t) : null;
  const delta = targetBt != null && live ? live.bt - targetBt : null;
  const alerting = delta != null && Math.abs(delta) > DELTA_ALERT_C;

  const btn: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
        padding: 24,
        color: "#111827",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Roast Monitor</h1>
        <span
          style={{
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 999,
            background: connected ? "#dcfce7" : "#fee2e2",
            color: connected ? "#166534" : "#991b1b",
            fontWeight: 600,
          }}
        >
          {connected ? "● adapter connected" : "○ adapter offline"}
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>(simulated source)</span>

        <nav style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {(["live", "history", "profiles"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                ...btn,
                textTransform: "capitalize",
                background: view === v ? "#111827" : "#fff",
                color: view === v ? "#fff" : "#374151",
                borderColor: view === v ? "#111827" : "#d1d5db",
              }}
            >
              {v}
            </button>
          ))}
        </nav>
      </header>

      {view === "history" ? (
        <RoastHistory refreshKey={lastSavedId} />
      ) : view === "profiles" ? (
        <RoastProfiles />
      ) : (
      <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          padding: "16px 20px",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <Stat label="Time" value={fmtTime(roasting ? live?.t : 0)} color="#111827" />
        <Stat label="Bean" value={live ? `${live.bt.toFixed(1)}°` : "--"} color="#dc2626" />
        <Stat label="Env" value={live ? `${live.et.toFixed(1)}°` : "--"} color="#ea580c" />
        <Stat label="RoR" value={live ? `${live.ror.toFixed(1)}` : "--"} color="#16a34a" />
        {activeProfile && (
          <Stat
            label="Δ Target"
            value={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}°` : "--"}
            color={delta == null ? "#9ca3af" : alerting ? "#dc2626" : "#2563eb"}
          />
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>Roast against:</label>
          <select
            value={activeProfile?.id ?? ""}
            onChange={(e) => onPickProfile(e.target.value ? Number(e.target.value) : null)}
            style={{ ...btn, fontWeight: 500, paddingRight: 10 }}
          >
            <option value="">None</option>
            {profileList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!roasting ? (
            <button
              style={{ ...btn, background: "#16a34a", color: "#fff", borderColor: "#16a34a" }}
              onClick={() => start()}
              disabled={!connected}
            >
              ▶ Start Roast
            </button>
          ) : (
            <button
              style={{ ...btn, background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
              onClick={() => stop()}
            >
              ■ Stop
            </button>
          )}
        </div>
      </div>

      {roasting && alerting && delta != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ⚠ {Math.abs(delta).toFixed(1)}° {delta > 0 ? "above" : "below"} target
          {" "}(threshold ±{DELTA_ALERT_C}°)
        </div>
      )}

      {roasting && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {EVENTS.map((e) => (
            <button key={e.type} style={btn} onClick={() => markEvent(e.type, e.label)}>
              {e.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <RoastChart history={history} events={events} target={target} />
      </div>

      {events.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 14, color: "#374151" }}>
          <strong>Events:</strong>{" "}
          {events.map((e, i) => (
            <span key={i} style={{ marginRight: 14 }}>
              {e.label} @ {fmtTime(e.t)}
            </span>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
