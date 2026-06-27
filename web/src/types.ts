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

export type WsMessage =
  | ({ type: "reading"; roasting: boolean } & Partial<RoastPoint>)
  | { type: "snapshot"; history: RoastPoint[]; events: RoastEvent[]; roasting: boolean }
  | { type: "event"; t: number; type_?: string; label: string }
  | { type: "roast_started" }
  | { type: "roast_stopped" };
