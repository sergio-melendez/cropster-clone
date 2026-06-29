import type { Profile, RoastEvent } from "./types";
import type { ProfilePoint } from "./types";

/**
 * Linear-interpolate a target profile's bean temp at time `t` (seconds).
 * Returns null if there's no profile, or `t` is outside the profile's range
 * (we don't extrapolate — before the first or after the last point there's no
 * meaningful target).
 *
 * Assumes `points` is sorted by `t` ascending (the adapter stores them that way).
 */
export function interpolateTarget(
  points: ProfilePoint[] | undefined,
  t: number,
  key: "bt" | "ror" = "bt",
): number | null {
  if (!points || points.length === 0) return null;
  if (t < points[0].t || t > points[points.length - 1].t) return null;

  // Binary search for the segment containing t.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const av = a[key];
  const bv = b[key];
  if (av == null || bv == null) return null; // field missing (e.g. older profiles without ror)
  if (b.t === a.t) return av;
  const frac = (t - a.t) / (b.t - a.t);
  return av + (bv - av) * frac;
}

export interface ProfileGoals {
  chargeBt: number | null;       // bean temp at charge (first point)
  turningPoint: RoastEvent | null;
  dryEnd: RoastEvent | null;
  firstCrack: RoastEvent | null;
  duration: number;              // seconds (last point / drop)
  developmentTime: number | null;  // drop - first crack
  devRatio: number | null;       // developmentTime / duration
  endBt: number | null;          // bean temp at drop / last point
}

/** Derive the goals / "reference information" shown on both screens from a profile. */
export function computeGoals(p: Profile): ProfileGoals {
  const ev = (type: string): RoastEvent | null =>
    p.events.find((e) => e.type === type) ?? null;
  const firstCrack = ev("FC_START");
  const drop = ev("DROP");
  const duration = drop?.t ?? (p.points.length ? p.points[p.points.length - 1].t : 0);
  const developmentTime = firstCrack ? Math.max(0, duration - firstCrack.t) : null;
  const endBt = drop?.bt ?? (p.points.length ? p.points[p.points.length - 1].bt : null);
  return {
    chargeBt: p.points.length ? p.points[0].bt : null,
    turningPoint: ev("TP"),
    dryEnd: ev("DRY_END"),
    firstCrack,
    duration,
    developmentTime,
    devRatio: developmentTime && duration ? developmentTime / duration : null,
    endBt,
  };
}
