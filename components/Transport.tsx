"use client";

import { useStore } from "../lib/store";

const btnBase =
  "bg-gradient-to-b from-[#4a4a4e] to-[#2a2a2e] border border-[#1a1a1a] shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] hover:from-[#555] hover:to-[#333] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-50 flex items-center justify-center";

export default function Transport() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const play = useStore((s) => s.play);
  const stop = useStore((s) => s.stop);
  const rewind = useStore((s) => s.rewind);
  const fastForward = useStore((s) => s.fastForward);
  const eject = useStore((s) => s.eject);

  if (!sourceBuffer) return null;

  return (
    <div className="flex items-center gap-1">
      {/* Rewind */}
      <button
        onClick={rewind}
        className={`${btnBase} w-10 h-10 text-dw-muted hover:text-dw-text`}
        title="REWIND"
      >
        <span className="text-sm leading-none">&#9198;</span>
      </button>

      {/* Play / Stop */}
      {isPlaying ? (
        <button
          onClick={stop}
          className={`${btnBase} w-10 h-10 text-dw-text`}
          title="STOP"
        >
          <span className="text-xs leading-none">&#9632;</span>
        </button>
      ) : (
        <button
          onClick={play}
          className={`${btnBase} w-10 h-10 text-dw-accent`}
          title="PLAY"
        >
          <span className="text-sm leading-none">&#9654;</span>
        </button>
      )}

      {/* Fast Forward */}
      <button
        onClick={fastForward}
        className={`${btnBase} w-10 h-10 text-dw-muted hover:text-dw-text`}
        title="FAST FORWARD"
      >
        <span className="text-sm leading-none">&#9197;</span>
      </button>

      {/* Eject */}
      <button
        onClick={eject}
        className={`${btnBase} w-10 h-10 text-dw-muted hover:text-dw-text ml-2`}
        title="EJECT"
      >
        <span className="text-sm leading-none">&#9167;</span>
      </button>
    </div>
  );
}
