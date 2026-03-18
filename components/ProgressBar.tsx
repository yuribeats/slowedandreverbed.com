"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useStore } from "../lib/store";
import { expandParams } from "@yuribeats/audio-utils";
import { getAudioContext } from "../lib/audio-context";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ProgressBar() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const startedAt = useStore((s) => s.startedAt);
  const pauseOffset = useStore((s) => s.pauseOffset);
  const params = useStore((s) => s.params);
  const seek = useStore((s) => s.seek);
  const barRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!sourceBuffer) return;

    const tick = () => {
      if (isPlaying) {
        const ctx = getAudioContext();
        const raw = ctx.currentTime - startedAt;
        const rate = expandParams(params).rate;
        setElapsed(raw * rate);
      } else {
        setElapsed(pauseOffset);
      }
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [sourceBuffer, isPlaying, startedAt, pauseOffset, params]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!sourceBuffer || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seek(ratio * sourceBuffer.duration);
    },
    [sourceBuffer, seek]
  );

  if (!sourceBuffer) return null;

  const duration = sourceBuffer.duration;
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;

  return (
    <div className="flex items-center gap-3 flex-1">
      <span className="text-[10px] text-dw-vfd-teal font-mono w-10 text-right" style={{ textShadow: "0 0 8px rgba(0,229,204,0.4)" }}>
        {formatTime(elapsed)}
      </span>
      <div
        ref={barRef}
        className="flex-1 h-[4px] bg-[#111] border border-dw-panel-border relative"
        onClick={handleClick}
      >
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, #007a6e, #00e5cc)",
            boxShadow: "0 0 6px rgba(0,229,204,0.3)",
          }}
        />
      </div>
      <span className="text-[10px] text-dw-muted font-mono w-10">
        {formatTime(duration)}
      </span>
    </div>
  );
}
