# web/ — React roast UI

React + Vite + TypeScript. Connects to the adapter at `ws://localhost:8000/ws`,
draws the live roast curve (Recharts), and exposes start/stop + event controls.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (expects the adapter on :8000)
npm run build      # tsc -b (strict type-check) + production build
npm run preview    # serve the production build
```

## Files

- `src/App.tsx` — page layout: live stat readouts, Start/Stop, event buttons.
- `src/RoastChart.tsx` — the roast curve: BT, ET, RoR + vertical event markers.
- `src/useRoastSocket.ts` — WebSocket hook (auto-reconnect) + REST calls
  (`/roast/start`, `/roast/stop`, `/roast/event`).
- `src/types.ts` — shared types (`RoastPoint`, `RoastEvent`, `WsMessage`).

## Notes

- The adapter base URL is hard-coded to `localhost:8000` in `useRoastSocket.ts`.
  Make it configurable (`import.meta.env.VITE_ADAPTER_URL`) before deploying.
- Strict TS is on; `npm run build` must pass with no unused locals/params.
- Charting is Recharts today; if sample rates climb, consider uPlot for the live
  curve.
