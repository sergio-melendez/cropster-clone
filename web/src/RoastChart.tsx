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

// Full comment text for an on-chart label: "[m:ss] label @ btº".
function eventLabelText(ev: RoastEvent): string {
  const temp = ev.bt != null ? ` @ ${ev.bt.toFixed(0)}°` : "";
  return `[${fmtTime(ev.t)}] ${ev.label}${temp}`;
}

// Cascading label: full text near the line's x, staggered down by index so
// successive comments don't overlap (mirrors Cropster's reference labels).
function stackedLabel(text: string, idx: number, color: string) {
  return (p: { viewBox?: { x?: number; y?: number } }) => {
    const x = (p.viewBox?.x ?? 0) + 3;
    const y = (p.viewBox?.y ?? 0) + 12 + (idx % 10) * 13;
    return (
      <text x={x} y={y} fill={color} fontSize={10} fontWeight={600}>
        {text}
      </text>
    );
  };
}

export default function RoastChart({
  history,
  events,
  target,
  targetEvents,
  onPointClick,
  height = 460,
}: {
  history: RoastPoint[];
  events: RoastEvent[];
  target?: ProfilePoint[];
  targetEvents?: RoastEvent[];
  onPointClick?: (t: number) => void;
  height?: number;
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
    <ResponsiveContainer width="100%" height={height}>
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
          tickCount={11}
          stroke="#6b7280"
          label={{ value: "Temp (°C)", angle: -90, position: "insideLeft", fill: "#6b7280" }}
        />
        <YAxis
          yAxisId="ror"
          orientation="right"
          domain={[0, 40]}
          tickCount={9}
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
            label={stackedLabel(eventLabelText(ev), i, "#6b7280")}
          />
        ))}
        {events.map((ev, i) => (
          <ReferenceLine
            key={i}
            yAxisId="temp"
            x={ev.t}
            stroke="#2563eb"
            strokeDasharray="2 2"
            label={stackedLabel(eventLabelText(ev), i + (targetEvents?.length ?? 0), "#2563eb")}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
