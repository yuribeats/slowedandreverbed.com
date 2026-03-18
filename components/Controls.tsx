"use client";

import SpeedPitchSlider from "./SpeedPitchSlider";
import ReverbControls from "./ReverbControls";
import EQControls from "./EQControls";
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

export default function Controls() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);

  if (!sourceBuffer) return null;

  return (
    <div className="relative bg-gradient-to-b from-[#3a3a3e] to-[#2a2a2e] border border-[#1a1a1a] shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]">
      {/* Top edge highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.08)] to-transparent" />

      {/* Panel screws */}
      <div className="absolute top-3 left-3"><PanelScrew /></div>
      <div className="absolute top-3 right-3"><PanelScrew /></div>
      <div className="absolute bottom-3 left-3"><PanelScrew /></div>
      <div className="absolute bottom-3 right-3"><PanelScrew /></div>

      <div className="px-8 py-6">
        <div className="flex items-start justify-center gap-8 sm:gap-12 flex-wrap">
          {/* Divider lines between sections */}
          <SpeedPitchSlider />
          <div className="hidden sm:block w-[1px] h-[120px] bg-[#1a1a1a] shadow-[1px_0_0_rgba(255,255,255,0.04)] self-center" />
          <ReverbControls />
          <div className="hidden sm:block w-[1px] h-[120px] bg-[#1a1a1a] shadow-[1px_0_0_rgba(255,255,255,0.04)] self-center" />
          <EQControls />
        </div>
      </div>
    </div>
  );
}
