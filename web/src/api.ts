import type { SavedRoast, SavedRoastMeta } from "./types";

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
