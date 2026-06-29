import { useState } from "react";
import RoastChart from "./RoastChart";
import { computeGoals } from "./profile";
import { Stat, btn, fmtTime } from "./ui";
import type { Profile, ProfileMeta, RoastPoint, SavedRoastMeta } from "./types";

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function fmtDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Dashboard({
  connected,
  live,
  profiles,
  activeProfile,
  onPickProfile,
  recent,
  onOpenRoast,
  onStart,
}: {
  connected: boolean;
  live: RoastPoint | null;
  profiles: ProfileMeta[];
  activeProfile: Profile | null;
  onPickProfile: (id: number | null) => void;
  recent: SavedRoastMeta[];
  onOpenRoast: (id: number) => void;
  onStart: () => void;
}) {
  const [tab, setTab] = useState<"profile" | "chart">("profile");
  const goals = activeProfile ? computeGoals(activeProfile) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 240px", gap: 16 }}>
      {/* Left: today's production */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, alignSelf: "start" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Today's production</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>No roasts yet.</div>
        ) : (
          recent.map((r) => (
            <div
              key={r.id}
              onClick={() => onOpenRoast(r.id)}
              style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, border: "1px solid transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>Roast #{r.id}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {fmtDate(r.started_at)} · {fmtTime(r.duration_s)} ·
                {" "}{r.max_bt != null ? `${r.max_bt.toFixed(0)}°` : "--"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Center: next roast */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#6b7280" }}>Profile</label>
          <select
            value={activeProfile?.id ?? ""}
            onChange={(e) => onPickProfile(e.target.value ? Number(e.target.value) : null)}
            style={{ ...btn, fontWeight: 500, flex: 1 }}
          >
            <option value="">None — free roast</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {!activeProfile ? (
          <div style={{ color: "#6b7280", fontSize: 14, padding: 30, textAlign: "center" }}>
            Pick a profile to roast against, or start a free roast.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {(["profile", "chart"] as const).map((tb) => (
                <button
                  key={tb}
                  onClick={() => setTab(tb)}
                  style={{
                    ...btn, textTransform: "capitalize",
                    background: tab === tb ? "#111827" : "#fff",
                    color: tab === tb ? "#fff" : "#374151",
                    borderColor: tab === tb ? "#111827" : "#d1d5db",
                  }}
                >
                  {tb}
                </button>
              ))}
            </div>

            {tab === "profile" && goals ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Goals</div>
                {goals.chargeBt != null && <GoalRow label="Charge bean temp" value={`${goals.chargeBt.toFixed(1)}°`} />}
                {goals.turningPoint && <GoalRow label="Turning point" value={`${fmtTime(goals.turningPoint.t)} · ${goals.turningPoint.bt?.toFixed(1)}°`} />}
                {goals.dryEnd && <GoalRow label="Dry end" value={`${fmtTime(goals.dryEnd.t)} · ${goals.dryEnd.bt?.toFixed(1)}°`} />}
                {goals.firstCrack && <GoalRow label="First crack" value={`${fmtTime(goals.firstCrack.t)} · ${goals.firstCrack.bt?.toFixed(1)}°`} />}
                {goals.developmentTime != null && <GoalRow label="Development time" value={fmtTime(goals.developmentTime)} />}
                {goals.devRatio != null && <GoalRow label="Dev. time ratio" value={`${(goals.devRatio * 100).toFixed(1)}%`} />}
                <GoalRow label="Duration" value={fmtTime(goals.duration)} />
                {goals.endBt != null && <GoalRow label="End bean temp" value={`${goals.endBt.toFixed(1)}°`} />}

                {activeProfile.events.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Comments</div>
                    {activeProfile.events.map((e, i) => (
                      <div key={i} style={{ fontSize: 13, padding: "2px 0" }}>
                        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>{fmtTime(e.t)}</span>{" "}
                        {e.label}{e.bt != null ? ` · ${e.bt.toFixed(1)}°` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <RoastChart history={[]} events={activeProfile.events} target={activeProfile.points} />
            )}
          </>
        )}
      </div>

      {/* Right: live readouts + start */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "start" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Stat label="Bean" value={live ? `${live.bt.toFixed(1)}°` : "--"} color="#dc2626" />
          <Stat label="Env" value={live && live.et != null ? `${live.et.toFixed(1)}°` : "--"} color="#ea580c" />
          <Stat label="RoR" value={live ? `${live.ror.toFixed(1)}` : "--"} color="#16a34a" />
        </div>
        <button
          style={{ ...btn, background: "#16a34a", color: "#fff", borderColor: "#16a34a", padding: "14px", fontSize: 16 }}
          onClick={onStart}
          disabled={!connected}
        >
          ▶ Start Roast
        </button>
      </div>
    </div>
  );
}
