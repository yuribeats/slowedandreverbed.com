"use client";

import { useRef, useEffect, useCallback } from "react";
import { useStore } from "../lib/store";
import { getAudioContext } from "../lib/audio-context";

export default function WaveformCanvas() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const startedAt = useStore((s) => s.startedAt);
  const rate = useStore((s) => s.params.rate);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const drawWaveform = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      buffer: AudioBuffer,
      color: string,
      width: number,
      height: number
    ) => {
      const data = buffer.getChannelData(0);
      const step = Math.ceil(data.length / width);
      const mid = height / 2;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 0; i < width; i++) {
        const start = i * step;
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step && start + j < data.length; j++) {
          const val = data[start + j];
          if (val < min) min = val;
          if (val > max) max = val;
        }
        ctx.moveTo(i, mid + min * mid);
        ctx.lineTo(i, mid + max * mid);
      }
      ctx.stroke();
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // VU meter style background grid
    ctx.strokeStyle = "rgba(200, 169, 110, 0.06)";
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = "rgba(200, 169, 110, 0.15)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (sourceBuffer) {
      drawWaveform(ctx, sourceBuffer, "#c8a96e", width, height);
    }

    // Playhead
    if (isPlaying && sourceBuffer) {
      const audioCtx = getAudioContext();
      const elapsed = audioCtx.currentTime - startedAt;
      const totalDuration = sourceBuffer.duration / rate;
      const progress = elapsed / totalDuration;
      if (progress >= 0 && progress <= 1) {
        const x = progress * width;
        ctx.strokeStyle = "#e8e0d0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      animRef.current = requestAnimationFrame(draw);
    }
  }, [sourceBuffer, isPlaying, startedAt, rate, drawWaveform]);

  useEffect(() => {
    draw();
    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw, isPlaying]);

  if (!sourceBuffer) return null;

  return (
    <div className="relative bg-gradient-to-b from-[#3a3a3e] to-[#2a2a2e] border border-[#1a1a1a] shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] p-4">
      <div className="bg-[#0a0a0a] border border-[#111] shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] p-1">
        <canvas ref={canvasRef} className="w-full h-28 block" />
      </div>
    </div>
  );
}
