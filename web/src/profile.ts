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
