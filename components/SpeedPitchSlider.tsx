"use client";

import { useStore } from "../lib/store";
import Knob from "./Knob";

export default function SpeedPitchSlider() {
  const rate = useStore((s) => s.params.rate);
  const setParam = useStore((s) => s.setParam);

  const semitones = 12 * Math.log2(rate);

  return (
    <div className="flex flex-col items-center gap-1">
      <Knob
        value={rate}
        min={0.5}
        max={1.0}
        step={0.01}
        label="SPEED / PITCH"
        valueDisplay={`${rate.toFixed(2)}X / ${semitones.toFixed(1)}ST`}
        onChange={(v) => setParam("rate", v)}
      />
    </div>
  );
}
