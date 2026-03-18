"use client";

import { useStore } from "../lib/store";

export default function Player() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const play = useStore((s) => s.play);
  const stop = useStore((s) => s.stop);

  if (!sourceBuffer) return null;

  return (
    <button
      onClick={isPlaying ? stop : play}
      className="bg-gradient-to-b from-[#4a4a4e] to-[#2a2a2e] border border-[#1a1a1a] text-dw-text px-5 py-3 text-xs uppercase tracking-[0.15em] shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] hover:from-[#555] hover:to-[#333] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] font-mono"
    >
      {isPlaying ? "STOP" : "PLAY"}
    </button>
  );
}
