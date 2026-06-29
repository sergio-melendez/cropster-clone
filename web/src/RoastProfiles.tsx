import { useCallback, useEffect, useRef, useState } from "react";
import RoastChart from "./RoastChart";
import { deleteProfile, getProfile, importProfile, listProfiles } from "./api";
import type { Profile, ProfileMeta } from "./types";

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}

const SOURCE_LABEL: Record<string, string> = {
  roast: "from roast",
  csv: "CSV",
  artisan: "Artisan",
  cropster_pdf: "Cropster PDF",
  native: "RoastMonitor",
};

// Download a profile as our native .json format (round-trips back via import).
function exportProfile(p: Profile): void {
  const doc = {
    format: "roastmonitor.profile",
    version: 1,
    name: p.name,
    source: p.source,
    duration_s: p.duration_s,
    notes: p.notes,
    points: p.points,
    events: p.events,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.name.replace(/[^\w.-]+/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RoastProfiles() {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setProfiles(await listProfiles());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedId == null) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    getProfile(selectedId)
      .then((p) => !cancelled && setSelected(p))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      setError(null);
      await importProfile(file);
      await refresh();
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("Delete this profile? This can't be undone.")) return;
    try {
      await deleteProfile(id);
      if (selectedId === id) setSelectedId(null);
      await refresh();
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Profiles ({profiles.length})</strong>
          <button
            onClick={refresh}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
          >
            ↻ Refresh
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.alog,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            width: "100%",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px dashed #9ca3af",
            background: "#fff",
            cursor: busy ? "default" : "pointer",
            marginBottom: 10,
          }}
        >
          {busy ? "Importing…" : "⬆ Import Cropster PDF / CSV / Artisan / .json"}
        </button>

        {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>{error}</div>}

        {profiles.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14, padding: "12px 8px" }}>
            No profiles yet. Import a file above, or save a roast as a profile from the History tab.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {profiles.map((p) => (
              <div key={p.id} style={rowStyle(p.id === selectedId)} onClick={() => setSelectedId(p.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{fmtDate(p.created_at)}</div>
                  <div style={{ fontSize: 12, color: "#374151" }}>
                    {fmtDuration(p.duration_s)} · {SOURCE_LABEL[p.source] ?? p.source} · {p.point_count} pts
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  title="Delete profile"
                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", cursor: "pointer" }}
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
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {SOURCE_LABEL[selected.source] ?? selected.source} · {fmtDuration(selected.duration_s)} ·
                  {" "}{selected.points.length} points
                </div>
              </div>
              <button
                onClick={() => exportProfile(selected)}
                style={{ fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#fff", color: "#2563eb", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                ⬇ Export .json
              </button>
            </div>
            <RoastChart history={[]} events={selected.events} target={selected.points} />
            {selected.events.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>
                <strong>Comments:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {selected.events.map((e, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: "#6b7280" }}>
                        {fmtDuration(e.t)}
                      </span>{" "}
                      {e.label}
                      {e.bt != null ? ` · ${e.bt.toFixed(1)}°` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 14, padding: 40, textAlign: "center" }}>
            Select a profile to preview its target curve.
          </div>
        )}
      </div>
    </div>
  );
}
