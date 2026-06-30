import { useRef } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ProfilePoint, RoastPoint, RoastEvent } from "./types";
import { interpolateTarget } from "./profile";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Merge the live/saved curve with an optional target profile into one dataset.
 * Each history point gets `target_bt` / `target_ror` (interpolated at its t); any
 * target points beyond the last history point are appended so the full target
 * curve shows ahead of the live curve. `target_ror` is null when the profile has
 * no RoR (e.g. profiles saved before RoR support) — that line just won't draw.
 */
function buildData(history: RoastPoint[], target?: ProfilePoint[]): Array<Record<string, number | null>> {
  if (!target || target.length === 0) return history as unknown as Array<Record<string, number | null>>;
  const lastT = history.length ? history[history.length - 1].t : -Infinity;
  const merged: Array<Record<string, number | null>> = history.map((p) => ({
    ...p,
    target_bt: interpolateTarget(target, p.t),
    target_ror: interpolateTarget(target, p.t, "ror"),
  }));
  for (const tp of target) {
    if (tp.t > lastT) merged.push({ t: tp.t, target_bt: tp.bt, target_ror: tp.ror ?? null });
  }
  return merged;
}

// Does the target carry any RoR values? (older profiles don't)
function hasTargetRor(target?: ProfilePoint[]): boolean {
  return !!target && target.some((p) => p.ror != null);
}

// Short tag for an on-chart marker (full text lives in the comments list).
const EVENT_TAG: Record<string, string> = {
  TP: "TP", DRY_END: "DE", FC_START: "FC", FC_END: "FCe", DROP: "Drop", GAS: "Gas",
};
function eventTag(ev: RoastEvent): string {
  return EVENT_TAG[ev.type] ?? "•";
}

export default function RoastChart({
  history,
  events,
  target,
  targetEvents,
  onPointClick,
}: {
  history: RoastPoint[];
  events: RoastEvent[];
  target?: ProfilePoint[];
  targetEvents?: RoastEvent[];
  onPointClick?: (t: number) => void;
}) {
  const data = buildData(history, target);
  const dataMaxT = data.length ? Number(data[data.length - 1].t) : 0;
  const wrapRef = useRef<HTMLDivElement>(null);

  // Map a click's pixel position to a roast time using the plot grid's bounds.
  // (Decoupled from recharts hover state, which is unreliable to drive.)
  const handleClick = (e: React.MouseEvent) => {
    if (!onPointClick || dataMaxT <= 0) return;
    const grid = wrapRef.current?.querySelector(".recharts-cartesian-grid");
    const rect = grid?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    onPointClick(Math.max(0, Math.min(dataMaxT, frac * dataMaxT)));
  };

  return (
    <div ref={wrapRef} onClick={onPointClick ? handleClick : undefined} style={{ width: "100%", ...(onPointClick ? { cursor: "crosshair" } : {}) }}>
    <ResponsiveContainer width="100%" height={460}>
      <ComposedChart
        data={data}
        margin={{ top: 10, right: 50, bottom: 10, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, "dataMax"]}
          tickFormatter={fmtTime}
          stroke="#6b7280"
        />
        <YAxis
          yAxisId="temp"
          domain={[0, 250]}
          stroke="#6b7280"
          label={{ value: "Temp (°C)", angle: -90, position: "insideLeft", fill: "#6b7280" }}
        />
        <YAxis
          yAxisId="ror"
          orientation="right"
          domain={[0, 40]}
          stroke="#16a34a"
          label={{ value: "RoR (°C/min)", angle: 90, position: "insideRight", fill: "#16a34a" }}
        />
        <Tooltip
          labelFormatter={(v) => `Time ${fmtTime(Number(v))}`}
          formatter={(value, name) => [typeof value === "number" ? value.toFixed(1) : "--", name]}
        />
        <Legend />
        {target && target.length > 0 && (
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="target_bt"
            name="Target"
            stroke="#9ca3af"
            dot={false}
            isAnimationActive={false}
            strokeWidth={2}
            strokeDasharray="6 3"
            connectNulls
          />
        )}
        <Line
          yAxisId="temp"
          type="monotone"
          dataKey="bt"
          name="Bean Temp"
          stroke="#dc2626"
          dot={false}
          isAnimationActive={false}
          strokeWidth={2.5}
        />
        <Line
          yAxisId="temp"
          type="monotone"
          dataKey="et"
          name="Env Temp"
          stroke="#ea580c"
          dot={false}
          isAnimationActive={false}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        {hasTargetRor(target) && (
          <Line
            yAxisId="ror"
            type="monotone"
            dataKey="target_ror"
            name="Target RoR"
            stroke="#86efac"
            dot={false}
            isAnimationActive={false}
            strokeWidth={1.5}
            strokeDasharray="6 3"
            connectNulls
          />
        )}
        <Line
          yAxisId="ror"
          type="monotone"
          dataKey="ror"
          name="RoR (BT)"
          stroke="#16a34a"
          dot={false}
          isAnimationActive={false}
          strokeWidth={1.5}
        />
        {(targetEvents ?? []).map((ev, i) => (
          <ReferenceLine
            key={`tgt-${i}`}
            yAxisId="temp"
            x={ev.t}
            stroke="#9ca3af"
            strokeDasharray="2 4"
            label={{ value: eventTag(ev), position: "insideTopLeft", fill: "#6b7280", fontSize: 11, fontWeight: 600 }}
          />
        ))}
        {events.map((ev, i) => (
          <ReferenceLine
            key={i}
            yAxisId="temp"
            x={ev.t}
            stroke="#2563eb"
            strokeDasharray="2 2"
            label={{ value: eventTag(ev), position: "top", fill: "#2563eb", fontSize: 11 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
