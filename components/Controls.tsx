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
    <div className="px-4 py-6">
      <div className="flex items-center justify-center gap-8 sm:gap-16">
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
            className={`mt-1 text-[8px] uppercase tracking-[0.05em] font-mono px-2 py-0.5 border ${
              stepMode
                ? "text-dw-vfd-teal border-dw-vfd-teal"
                : "text-dw-muted border-dw-btn-border"
            } hover:text-dw-vfd-teal`}
          >
            STEP
          </button>
        </div>

        <div className="hidden sm:block w-[1px] h-[100px] bg-dw-panel-border" />

        <Knob
          value={params.reverb}
          min={0}
          max={1}
          step={0.01}
          label="REVERB"
          valueDisplay={`${Math.round(params.reverb * 100)}%`}
          onChange={(v) => setParam("reverb", v)}
        />

        <div className="hidden sm:block w-[1px] h-[100px] bg-dw-panel-border" />

        <Knob
          value={params.tone}
          min={-1}
          max={1}
          step={0.01}
          label="TONE"
          valueDisplay={params.tone === 0 ? "FLAT" : params.tone < 0 ? "DARK" : "BRIGHT"}
          onChange={(v) => setParam("tone", v)}
        />
      </div>
    </div>
  );
}
