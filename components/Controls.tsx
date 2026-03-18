"use client";

import { useState } from "react";
import Knob from "./Knob";
import { useStore } from "../lib/store";

function PanelScrew() {
  return (
    <div className="w-[10px] h-[10px] rounded-full bg-gradient-to-br from-[#555] to-[#333] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.05)]">
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-[6px] h-[1px] bg-[#222]" />
      </div>
    </div>
  );
}

// Semitone snap: round speed to nearest semitone boundary
function snapToSemitone(speed: number): number {
  const rate = 1.0 + speed;
  const semitones = 12 * Math.log2(rate);
  const snapped = Math.round(semitones);
  return Math.pow(2, snapped / 12) - 1.0;
}

export default function Controls() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const [stepMode, setStepMode] = useState(false);

  if (!sourceBuffer) return null;

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
    <div className="relative bg-gradient-to-b from-[#3a3a3e] to-[#2a2a2e] border border-[#1a1a1a] shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.08)] to-transparent" />
      <div className="absolute top-3 left-3"><PanelScrew /></div>
      <div className="absolute top-3 right-3"><PanelScrew /></div>
      <div className="absolute bottom-3 left-3"><PanelScrew /></div>
      <div className="absolute bottom-3 right-3"><PanelScrew /></div>

      <div className="px-8 py-6">
        <div className="flex items-center justify-center gap-12 sm:gap-20">
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
              className={`mt-1 text-[8px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 border ${
                stepMode
                  ? "text-dw-accent border-dw-accent"
                  : "text-dw-muted border-[#333]"
              } hover:text-dw-accent`}
            >
              STEP
            </button>
          </div>

          <div className="hidden sm:block w-[1px] h-[120px] bg-[#1a1a1a] shadow-[1px_0_0_rgba(255,255,255,0.04)]" />

          <Knob
            value={params.reverb}
            min={0}
            max={1}
            step={0.01}
            label="REVERB"
            valueDisplay={`${Math.round(params.reverb * 100)}%`}
            onChange={(v) => setParam("reverb", v)}
          />

          <div className="hidden sm:block w-[1px] h-[120px] bg-[#1a1a1a] shadow-[1px_0_0_rgba(255,255,255,0.04)]" />

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
    </div>
  );
}
