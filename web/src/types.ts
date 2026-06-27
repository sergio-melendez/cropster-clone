export interface RoastPoint {
  t: number;        // seconds since charge
  bt: number;       // bean temp (C)
  et: number;       // environmental temp (C)
  ror: number;      // rate of rise (C/min)
}

export interface RoastEvent {
  t: number;
  type: string;
  label: string;
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

export type WsMessage =
  | ({ type: "reading"; roasting: boolean } & Partial<RoastPoint>)
  | { type: "snapshot"; history: RoastPoint[]; events: RoastEvent[]; roasting: boolean }
  | { type: "event"; t: number; type_?: string; label: string }
  | { type: "roast_started" }
  | { type: "roast_stopped"; roast_id: number | null };
