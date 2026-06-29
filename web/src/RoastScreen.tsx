import { useState } from "react";
import RoastChart from "./RoastChart";
import { computeGoals } from "./profile";
import { btn, fmtTime } from "./ui";
import type { Profile, RoastEvent, RoastPoint } from "./types";

const COMMENT_PRESETS = [
  { type: "TP", label: "Turning point" },
  { type: "DRY_END", label: "Color change" },
  { type: "FC_START", label: "First crack" },
  { type: "SC_START", label: "Second crack" },
];

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function CommentModal({
  bt,
  onClose,
  onSubmit,
}: {
  bt: number | null;
  onClose: () => void;
  onSubmit: (type: string, label: string) => void;
}) {
  const [gas, setGas] = useState("");
  const [text, setText] = useState("");
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, padding: 20, width: 340, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Comment at</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          {bt != null ? `${bt.toFixed(1)} °C` : "—"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {COMMENT_PRESETS.map((p) => (
            <button
              key={p.type}
              style={{ ...btn, background: "#16a34a", color: "#fff", borderColor: "#16a34a" }}
              onClick={() => onSubmit(p.type, p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="number" placeholder="Gas %" value={gas}
            onChange={(e) => setGas(e.target.value)}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
          />
          <button
            style={{ ...btn }}
            disabled={!gas}
            onClick={() => onSubmit("GAS", `Gas - ${gas}%`)}
          >
            Log gas
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Text comment" value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
          />
          <button style={{ ...btn }} disabled={!text.trim()} onClick={() => onSubmit("GENERIC", text.trim())}>
            Add
          </button>
        </div>
        <button style={{ ...btn, width: "100%" }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function RoastScreen({
  live,
  history,
  events,
  delta,
  alerting,
  activeProfile,
  onStop,
  onAbort,
  markEvent,
}: {
  live: RoastPoint | null;
  history: RoastPoint[];
  events: RoastEvent[];
  delta: number | null;
  alerting: boolean;
  activeProfile: Profile | null;
  onStop: () => void;
  onAbort: () => void;
  markEvent: (type: string, label?: string, bt?: number) => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const goals = activeProfile ? computeGoals(activeProfile) : null;

  // The reference comment we've most recently passed (for highlighting).
  const t = live?.t ?? 0;
  const refEvents = activeProfile?.events ?? [];
  let activeIdx = -1;
  refEvents.forEach((e, i) => {
    if (e.t <= t) activeIdx = i;
  });

  const submit = (type: string, label: string) => {
    markEvent(type, label, live?.bt ?? undefined);
    setCommenting(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
      {/* Center: chart + add-comment + alert */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button
            style={{ ...btn, background: "#111827", color: "#fff", borderColor: "#111827" }}
            onClick={() => setCommenting(true)}
          >
            ＋ Comment
          </button>
          {alerting && delta != null && (
            <span style={{ color: "#991b1b", fontWeight: 600, fontSize: 14 }}>
              ⚠ {Math.abs(delta).toFixed(1)}° {delta > 0 ? "above" : "below"} target
            </span>
          )}
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <RoastChart
            history={history}
            events={events}
            target={activeProfile?.points}
            targetEvents={activeProfile?.events}
          />
        </div>
      </div>

      {/* Right sidebar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {goals && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Reference information</div>
            <GoalRow label="Duration" value={fmtTime(goals.duration)} />
            {goals.developmentTime != null && (
              <GoalRow label="Development" value={fmtTime(goals.developmentTime)} />
            )}
            {goals.devRatio != null && (
              <GoalRow label="Dev. ratio" value={`${(goals.devRatio * 100).toFixed(1)}%`} />
            )}
            {goals.firstCrack && (
              <GoalRow label="First crack" value={`${fmtTime(goals.firstCrack.t)} · ${goals.firstCrack.bt?.toFixed(1)}°`} />
            )}
            {goals.endBt != null && <GoalRow label="End temp" value={`${goals.endBt.toFixed(1)}°`} />}
          </div>
        )}

        {refEvents.length > 0 && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, maxHeight: 240, overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Reference comments</div>
            {refEvents.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 8px",
                  borderRadius: 6, marginBottom: 2,
                  background: i === activeIdx ? "#dcfce7" : "transparent",
                  border: i === activeIdx ? "1px solid #86efac" : "1px solid transparent",
                }}
              >
                <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>{fmtTime(e.t)}</span>
                <span style={{ flex: 1, margin: "0 8px" }}>{e.label}</span>
                <span style={{ color: "#6b7280" }}>{e.bt != null ? `${e.bt.toFixed(0)}°` : ""}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { label: "Bean temp °C", value: live ? live.bt.toFixed(1) : "--", color: "#dc2626" },
            { label: "Env temp °C", value: live && live.et != null ? live.et.toFixed(1) : "--", color: "#ea580c" },
            { label: "RoR °C/min", value: live ? live.ror.toFixed(1) : "--", color: "#16a34a" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{r.label}</span>
              <span style={{ fontSize: 30, fontWeight: 700, color: r.color, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar spanning both columns */}
      <div
        style={{
          gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 16,
          padding: "12px 20px", border: "1px solid #e5e7eb", borderRadius: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{activeProfile ? activeProfile.name : "Roast"}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Roasting against target</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <button style={{ ...btn, color: "#6b7280" }} onClick={onAbort}>✕ Abort</button>
          <button
            style={{ ...btn, background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
            onClick={onStop}
          >
            ■ Stop
          </button>
          <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>
            {fmtTime(live?.t ?? 0)}
          </div>
        </div>
      </div>

      {commenting && (
        <CommentModal bt={live?.bt ?? null} onClose={() => setCommenting(false)} onSubmit={submit} />
      )}
    </div>
  );
}
