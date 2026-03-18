"use client";

import { useStore } from "../lib/store";
import Knob from "./Knob";

export default function EQControls() {
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);

  const formatDb = (v: number) =>
    `${v > 0 ? "+" : ""}${v.toFixed(0)}DB`;

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] text-dw-muted uppercase tracking-[0.15em]">
        EQ
      </span>
      <div className="flex gap-4">
        <Knob
          value={params.eqLow}
          min={-12}
          max={12}
          step={1}
          label="LO"
          valueDisplay={formatDb(params.eqLow)}
          onChange={(v) => setParam("eqLow", v)}
          ticks={7}
        />
        <Knob
          value={params.eqMid}
          min={-10}
          max={10}
          step={1}
          label="MID"
          valueDisplay={formatDb(params.eqMid)}
          onChange={(v) => setParam("eqMid", v)}
          ticks={7}
        />
        <Knob
          value={params.eqHigh}
          min={-10}
          max={10}
          step={1}
          label="HI"
          valueDisplay={formatDb(params.eqHigh)}
          onChange={(v) => setParam("eqHigh", v)}
          ticks={7}
        />
      </div>
    </div>
  );
}
