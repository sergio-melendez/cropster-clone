import type { Profile, ProfileMeta, SavedRoast, SavedRoastMeta } from "./types";

// In dev the UI is served by Vite (:5173) while the adapter runs on :8000.
// In the bundled app the adapter serves the UI too, so use the current origin.
export const API = import.meta.env.DEV
  ? "http://localhost:8000"
  : window.location.origin;

export async function listRoasts(): Promise<SavedRoastMeta[]> {
  const res = await fetch(`${API}/roasts`);
  if (!res.ok) throw new Error(`list roasts failed: ${res.status}`);
  const data = await res.json();
  return data.roasts as SavedRoastMeta[];
}

export async function getRoast(id: number): Promise<SavedRoast> {
  const res = await fetch(`${API}/roasts/${id}`);
  if (!res.ok) throw new Error(`get roast ${id} failed: ${res.status}`);
  return (await res.json()) as SavedRoast;
}

export async function deleteRoast(id: number): Promise<void> {
  const res = await fetch(`${API}/roasts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete roast ${id} failed: ${res.status}`);
}

// ---- profiles ----------------------------------------------------------------
export async function listProfiles(): Promise<ProfileMeta[]> {
  const res = await fetch(`${API}/profiles`);
  if (!res.ok) throw new Error(`list profiles failed: ${res.status}`);
  const data = await res.json();
  return data.profiles as ProfileMeta[];
}

export async function getProfile(id: number): Promise<Profile> {
  const res = await fetch(`${API}/profiles/${id}`);
  if (!res.ok) throw new Error(`get profile ${id} failed: ${res.status}`);
  return (await res.json()) as Profile;
}

export async function createProfileFromRoast(
  name: string,
  roastId: number,
  notes?: string,
): Promise<number> {
  const res = await fetch(`${API}/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, roast_id: roastId, notes }),
  });
  if (!res.ok) throw new Error(`create profile failed: ${res.status}`);
  return (await res.json()).id as number;
}

export async function importProfile(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/profiles/import`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep status */
    }
    throw new Error(detail);
  }
}

export async function deleteProfile(id: number): Promise<void> {
  const res = await fetch(`${API}/profiles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete profile ${id} failed: ${res.status}`);
}
