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
 * Each history point gets a `target_bt` (interpolated at its t); any target
 * points beyond the last history point are appended so the full target curve
 * shows ahead of the live curve.
 */
function buildData(history: RoastPoint[], target?: ProfilePoint[]): Array<Record<string, number | null>> {
  if (!target || target.length === 0) return history as unknown as Array<Record<string, number | null>>;
  const lastT = history.length ? history[history.length - 1].t : -Infinity;
  const merged: Array<Record<string, number | null>> = history.map((p) => ({
    ...p,
    target_bt: interpolateTarget(target, p.t),
  }));
  for (const tp of target) {
    if (tp.t > lastT) merged.push({ t: tp.t, target_bt: tp.bt });
  }
  return merged;
}

export default function RoastChart({
  history,
  events,
  target,
}: {
  history: RoastPoint[];
  events: RoastEvent[];
  target?: ProfilePoint[];
}) {
  const data = buildData(history, target);
  return (
    <ResponsiveContainer width="100%" height={460}>
      <ComposedChart data={data} margin={{ top: 10, right: 50, bottom: 10, left: 0 }}>
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
        {events.map((ev, i) => (
          <ReferenceLine
            key={i}
            yAxisId="temp"
            x={ev.t}
            stroke="#2563eb"
            strokeDasharray="2 2"
            label={{ value: ev.label, position: "top", fill: "#2563eb", fontSize: 11 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
