"use client";

import { useStore } from "../lib/store";

export default function TapeWindow() {
  const isPlaying = useStore((s) => s.isPlaying);

  return (
    <div className="tape-window relative overflow-hidden" style={{
      background: "linear-gradient(180deg, #0a0a0a 0%, #151515 50%, #0a0a0a 100%)",
      border: "1px solid #333",
      boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,255,255,0.03)",
      borderRadius: "50%/40%",
      width: "100%",
      height: "64px",
    }}>
      {/* Glass reflection overlay */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 80%, rgba(255,255,255,0.02) 100%)",
        borderRadius: "50%/40%",
        pointerEvents: "none",
      }} />

      {/* Tape reels */}
      <div className="absolute inset-0 flex items-center justify-around px-4">
        {/* Left reel */}
        <div
          className="relative"
          style={{
            width: "44px",
            height: "44px",
            animation: isPlaying ? "spin-reel 2s linear infinite" : "none",
          }}
        >
          <div className="absolute inset-0 rounded-full border-2 border-[#444]" />
          <div className="absolute inset-[8px] rounded-full border border-[#333]" />
          <div className="absolute inset-[18px] rounded-full bg-[#222] border border-[#444]" />
          {/* Spokes */}
          {[0, 60, 120].map((deg) => (
            <div
              key={deg}
              className="absolute top-1/2 left-1/2 h-[1px] bg-[#555]"
              style={{
                width: "20px",
                transform: `translate(-50%, -50%) rotate(${deg}deg)`,
                transformOrigin: "center",
              }}
            />
          ))}
        </div>

        {/* Tape strip between reels */}
        <div className="flex-1 mx-2 h-[2px] bg-[#3a2820] opacity-60" />

        {/* Right reel */}
        <div
          className="relative"
          style={{
            width: "44px",
            height: "44px",
            animation: isPlaying ? "spin-reel 1.5s linear infinite" : "none",
          }}
        >
          <div className="absolute inset-0 rounded-full border-2 border-[#444]" />
          <div className="absolute inset-[8px] rounded-full border border-[#333]" />
          <div className="absolute inset-[18px] rounded-full bg-[#222] border border-[#444]" />
          {[0, 60, 120].map((deg) => (
            <div
              key={deg}
              className="absolute top-1/2 left-1/2 h-[1px] bg-[#555]"
              style={{
                width: "20px",
                transform: `translate(-50%, -50%) rotate(${deg}deg)`,
                transformOrigin: "center",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
