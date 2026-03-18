"use client";

import { useStore } from "../lib/store";
import Knob from "./Knob";

export default function ReverbControls() {
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] text-dw-muted uppercase tracking-[0.15em]">
        REVERB
      </span>
      <div className="flex gap-4">
        <Knob
          value={params.reverbWet}
          min={0}
          max={1}
          step={0.01}
          label="WET"
          valueDisplay={`${Math.round(params.reverbWet * 100)}%`}
          onChange={(v) => setParam("reverbWet", v)}
          ticks={11}
        />
        <Knob
          value={params.reverbDuration}
          min={1}
          max={6}
          step={0.1}
          label="SIZE"
          valueDisplay={`${params.reverbDuration.toFixed(1)}S`}
          onChange={(v) => setParam("reverbDuration", v)}
          ticks={6}
        />
        <Knob
          value={params.reverbDecay}
          min={1}
          max={5}
          step={0.1}
          label="DECAY"
          valueDisplay={params.reverbDecay.toFixed(1)}
          onChange={(v) => setParam("reverbDecay", v)}
          ticks={5}
        />
      </div>
    </div>
  );
}
