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
};

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
          accept=".pdf,.csv,.alog"
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
          {busy ? "Importing…" : "⬆ Import Cropster PDF / CSV / Artisan"}
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
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {SOURCE_LABEL[selected.source] ?? selected.source} · {fmtDuration(selected.duration_s)} ·
                {" "}{selected.points.length} points
              </div>
            </div>
            <RoastChart history={[]} events={selected.events} target={selected.points} />
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
