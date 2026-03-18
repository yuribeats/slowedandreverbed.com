"use client";

import { useState } from "react";
import Knob from "./Knob";
import { useStore } from "../lib/store";

function snapToSemitone(speed: number): number {
  const rate = 1.0 + speed;
  const semitones = 12 * Math.log2(rate);
  const snapped = Math.round(semitones);
  return Math.pow(2, snapped / 12) - 1.0;
}

export default function Controls() {
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const [stepMode, setStepMode] = useState(false);

  const rate = 1.0 + params.speed;
  const semitones = 12 * Math.log2(rate);

  const handleSpeed = (v: number) => {
    if (stepMode) {
      setParam("speed", snapToSemitone(v));
    } else {
      setParam("speed", v);
    }
  };

  return (
    <div className="flex items-center justify-center gap-10">
      <div className="flex flex-col items-center gap-0">
        <Knob
          value={params.speed}
          min={-0.5}
          max={0.5}
          step={stepMode ? 0.001 : 0.01}
          label="SPEED / PITCH"
          valueDisplay={`${rate.toFixed(2)}X / ${semitones >= 0 ? "+" : ""}${semitones.toFixed(1)}ST`}
          onChange={handleSpeed}
        />
        <button
          onClick={() => setStepMode(!stepMode)}
          className={`mt-1 text-[8px] uppercase tracking-[0.15em] px-2 py-0.5 border ${
            stepMode
              ? "border-[#333] bg-[rgba(224,140,38,0.15)]"
              : "border-[#777]"
          }`}
          style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}
        >
          STEP
        </button>
      </div>
    </div>
  );
}
