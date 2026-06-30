import { useEffect, useState } from "react";
import { useRoastSocket } from "./useRoastSocket";
import RoastHistory from "./RoastHistory";
import RoastProfiles from "./RoastProfiles";
import Dashboard from "./Dashboard";
import RoastScreen from "./RoastScreen";
import { getProfile, listProfiles, listRoasts } from "./api";
import { interpolateTarget } from "./profile";
import { DELTA_ALERT_C, btn } from "./ui";
import type { Profile, ProfileMeta, SavedRoastMeta } from "./types";

type View = "dashboard" | "history" | "profiles";

export default function App() {
  const { connected, roasting, history, events, live, source, lastSavedId, start, stop, abort, markEvent } =
    useRoastSocket();
  const [view, setView] = useState<View>("dashboard");

  const [profileList, setProfileList] = useState<ProfileMeta[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<SavedRoastMeta[]>([]);
  const [historyFocus, setHistoryFocus] = useState<number | null>(null);
  const [startWeight, setStartWeight] = useState("");   // kg (as typed)

  // Refresh profile + recent-roast lists when returning to the dashboard or after a save.
  useEffect(() => {
    listProfiles().then(setProfileList).catch(() => {});
    listRoasts().then((r) => setRecent(r.slice(0, 8))).catch(() => {});
  }, [view, lastSavedId, roasting]);

  const onPickProfile = (id: number | null) => {
    if (id == null) return setActiveProfile(null);
    getProfile(id).then((p) => {
      setActiveProfile(p);
      // Prefill the start weight from the profile/PDF when it carries one.
      if (p.start_weight != null) setStartWeight(String(p.start_weight));
    }).catch(() => setActiveProfile(null));
  };

  const startRoast = () => start(startWeight ? Number(startWeight) : null);

  // Live deviation from the target at the current roast time.
  const target = activeProfile?.points;
  const targetBt = roasting && live?.t != null && target ? interpolateTarget(target, live.t) : null;
  const delta = targetBt != null && live ? live.bt - targetBt : null;
  const alerting = delta != null && Math.abs(delta) > DELTA_ALERT_C;

  const openRoast = (id: number) => {
    setHistoryFocus(id);
    setView("history");
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1180, margin: "0 auto", padding: 24, color: "#111827" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Roast Monitor</h1>
        <span
          style={{
            fontSize: 12, padding: "3px 10px", borderRadius: 999,
            background: connected ? "#dcfce7" : "#fee2e2",
            color: connected ? "#166534" : "#991b1b", fontWeight: 600,
          }}
        >
          {connected ? "● adapter connected" : "○ adapter offline"}
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>({source ?? "connecting…"})</span>

        <nav style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {(["dashboard", "history", "profiles"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                ...btn, textTransform: "capitalize",
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
        <RoastHistory refreshKey={lastSavedId} initialRoastId={historyFocus} />
      ) : view === "profiles" ? (
        <RoastProfiles />
      ) : roasting ? (
        <RoastScreen
          live={live}
          history={history}
          events={events}
          delta={delta}
          alerting={alerting}
          activeProfile={activeProfile}
          onStop={(endWeight) => stop(endWeight)}
          onAbort={() => abort()}
          markEvent={markEvent}
        />
      ) : (
        <Dashboard
          connected={connected}
          live={live}
          profiles={profileList}
          activeProfile={activeProfile}
          onPickProfile={onPickProfile}
          startWeight={startWeight}
          onStartWeight={setStartWeight}
          recent={recent}
          onOpenRoast={openRoast}
          onStart={startRoast}
        />
      )}
    </div>
  );
}
