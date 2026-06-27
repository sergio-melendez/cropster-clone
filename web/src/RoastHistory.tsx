import { useCallback, useEffect, useState } from "react";
import RoastChart from "./RoastChart";
import { createProfileFromRoast, deleteRoast, getRoast, listRoasts } from "./api";
import type { SavedRoast, SavedRoastMeta } from "./types";

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}

export default function RoastHistory({ refreshKey }: { refreshKey: number | null }) {
  const [roasts, setRoasts] = useState<SavedRoastMeta[]>([]);
  const [selected, setSelected] = useState<SavedRoast | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setRoasts(await listRoasts());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Reload the list on mount and whenever a new roast is saved.
  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  // Load the full curve when a roast is selected.
  useEffect(() => {
    if (selectedId == null) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    getRoast(selectedId)
      .then((r) => !cancelled && setSelected(r))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const onDelete = async (id: number) => {
    if (!confirm("Delete this roast? This can't be undone.")) return;
    try {
      await deleteRoast(id);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const onSaveAsProfile = async (roast: SavedRoast) => {
    const name = prompt("Name this profile:", `Roast #${roast.id}`);
    if (!name) return;
    try {
      await createProfileFromRoast(name, roast.id);
      alert(`Saved "${name}" as a profile. Pick it under "Roast against" on the Live tab.`);
    } catch (e) {
      setError(String(e));
    }
  };

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "#eff6ff" : "transparent",
    border: active ? "1px solid #bfdbfe" : "1px solid transparent",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, alignSelf: "start" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <strong style={{ fontSize: 14 }}>Saved roasts ({roasts.length})</strong>
          <button
            onClick={refresh}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>{error}</div>}

        {roasts.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14, padding: "12px 8px" }}>
            No roasts saved yet. Run a roast and press Stop to save it here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {roasts.map((r) => (
              <div
                key={r.id}
                style={rowStyle(r.id === selectedId)}
                onClick={() => setSelectedId(r.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Roast #{r.id}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{fmtDate(r.started_at)}</div>
                  <div style={{ fontSize: 12, color: "#374151" }}>
                    {fmtDuration(r.duration_s)} · peak{" "}
                    {r.max_bt != null ? `${r.max_bt.toFixed(0)}°` : "--"} · {r.event_count} events
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(r.id);
                  }}
                  title="Delete roast"
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #fecaca",
                    background: "#fff",
                    color: "#b91c1c",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        {selected ? (
          <>
            <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Roast #{selected.id}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {fmtDate(selected.started_at)} · {fmtDuration(selected.duration_s)} ·
                  peak {selected.max_bt != null ? `${selected.max_bt.toFixed(1)}°` : "--"}
                </div>
              </div>
              <button
                onClick={() => onSaveAsProfile(selected)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #2563eb",
                  background: "#fff",
                  color: "#2563eb",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ★ Save as profile
              </button>
            </div>
            <RoastChart history={selected.history} events={selected.events} />
            {selected.events.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 14, color: "#374151" }}>
                <strong>Events:</strong>{" "}
                {selected.events.map((e, i) => (
                  <span key={i} style={{ marginRight: 14 }}>
                    {e.label} @ {fmtDuration(e.t)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 14, padding: 40, textAlign: "center" }}>
            Select a roast on the left to review its curve.
          </div>
        )}
      </div>
    </div>
  );
}
