export interface RoastPoint {
  t: number;            // seconds since charge
  bt: number;           // bean temp (C)
  et: number | null;    // environmental temp (C); null on a single-probe (BT-only) rig
  ror: number;          // rate of rise (C/min)
}

export interface RoastEvent {
  t: number;
  type: string;
  label: string;
  bt?: number;   // bean temp at the comment (PDF comments carry it)
}

// Summary row for the history list (no curve).
export interface SavedRoastMeta {
  id: number;
  started_at: number;   // epoch seconds at charge
  finished_at: number;  // epoch seconds at drop/stop
  duration_s: number;
  max_bt: number | null;
  event_count: number;
}

// A full saved roast, curve + events, for the review view.
export interface SavedRoast extends Omit<SavedRoastMeta, "event_count"> {
  history: RoastPoint[];
  events: RoastEvent[];
}

// A point on a target profile curve (bean temp over time).
export interface ProfilePoint {
  t: number;          // seconds since charge
  bt: number;         // target bean temp (C)
  ror?: number;       // target rate of rise (C/min); absent on profiles saved before RoR support
}

// Summary row for the profiles list (no curve).
export interface ProfileMeta {
  id: number;
  name: string;
  created_at: number;   // epoch seconds when saved
  source: string;       // 'roast' | 'csv' | 'artisan'
  duration_s: number;
  point_count: number;
}

// A full target profile, curve + optional milestone events.
export interface Profile extends Omit<ProfileMeta, "point_count"> {
  notes: string | null;
  points: ProfilePoint[];
  events: RoastEvent[];
}

export type WsMessage =
  | ({ type: "reading"; roasting: boolean } & Partial<RoastPoint>)
  | { type: "snapshot"; history: RoastPoint[]; events: RoastEvent[]; roasting: boolean; source?: string }
  | { type: "event"; t: number; type_?: string; label: string }
  | { type: "roast_started" }
  | { type: "roast_stopped"; roast_id: number | null };
