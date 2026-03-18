"use client";

import { useStore } from "../lib/store";

export default function Player() {
  const processedBuffer = useStore((s) => s.processedBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);

  if (!processedBuffer) return null;

  return (
    <div className="flex gap-2">
      {isPlaying ? (
        <button
          onClick={pause}
          className="bg-surface-2 border border-border text-text-primary px-4 py-3 text-sm uppercase tracking-widest hover:border-accent"
        >
          STOP
        </button>
      ) : (
        <button
          onClick={play}
          className="bg-surface-2 border border-border text-text-primary px-4 py-3 text-sm uppercase tracking-widest hover:border-accent"
        >
          PLAY
        </button>
      )}
    </div>
  );
}
