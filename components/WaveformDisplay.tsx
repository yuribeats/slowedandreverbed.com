"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  pauseOffset: number;
  regionStart: number;
  regionEnd: number;
  onRegionChange: (start: number, end: number) => void;
  onSeek: (position: number) => void;
}

function computePeaks(buffer: AudioBuffer, numBars: number): Float32Array {
  const ch0 = buffer.getChannelData(0);
  const peaks = new Float32Array(numBars);
  const samplesPerBar = Math.floor(ch0.length / numBars);

  for (let i = 0; i < numBars; i++) {
    let max = 0;
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, ch0.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(ch0[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }

  let globalMax = 0;
  for (let i = 0; i < numBars; i++) {
    if (peaks[i] > globalMax) globalMax = peaks[i];
  }
  if (globalMax > 0) {
    for (let i = 0; i < numBars; i++) {
      peaks[i] /= globalMax;
    }
  }

  return peaks;
}

type DragMode = "seek" | "regionStart" | "regionEnd" | null;

export default function WaveformDisplay({
  audioBuffer,
  isPlaying,
  pauseOffset,
  regionStart,
  regionEnd,
  onRegionChange,
  onSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const peaksRef = useRef<Float32Array | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  const duration = audioBuffer?.duration ?? 0;
  const effectiveStart = regionStart;
  const effectiveEnd = regionEnd > 0 ? regionEnd : duration;

  useEffect(() => {
    if (audioBuffer) {
      peaksRef.current = computePeaks(audioBuffer, 200);
    } else {
      peaksRef.current = null;
    }
  }, [audioBuffer]);

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

    const w = rect.width;
    const h = rect.height;
    const peaks = peaksRef.current;

    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, w, h);

    if (!peaks || !audioBuffer || duration === 0) {
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.font = "11px monospace";
      ctx.fillText("NO TRACK LOADED", w / 2, h / 2 + 4);
      return;
    }

    const numBars = peaks.length;
    const barWidth = w / numBars;
    const midY = h / 2;

    const rsX = (effectiveStart / duration) * w;
    const reX = (effectiveEnd / duration) * w;
    const hasRegion = effectiveStart > 0 || effectiveEnd < duration;

    // Dim outside region
    if (hasRegion) {
      // Draw all bars dimmed first, then bright ones on top
      for (let i = 0; i < numBars; i++) {
        const x = i * barWidth;
        const barH = peaks[i] * midY * 0.9;
        ctx.fillStyle = "#1a2a1c";
        ctx.fillRect(x, midY - barH, Math.max(barWidth - 0.5, 1), barH);
        ctx.fillRect(x, midY, Math.max(barWidth - 0.5, 1), barH * 0.6);
      }
      // Overlay dim shade
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      if (effectiveStart > 0) ctx.fillRect(0, 0, rsX, h);
      if (effectiveEnd < duration) ctx.fillRect(reX, 0, w - reX, h);
    }

    // Draw waveform bars
    for (let i = 0; i < numBars; i++) {
      const x = i * barWidth;
      const barH = peaks[i] * midY * 0.9;
      const posInTrack = (i / numBars) * duration;
      const inRegion = posInTrack >= effectiveStart && posInTrack <= effectiveEnd;

      if (hasRegion && !inRegion) continue; // already drawn dimmed
      ctx.fillStyle = "#6b8f71";
      ctx.fillRect(x, midY - barH, Math.max(barWidth - 0.5, 1), barH);
      ctx.fillRect(x, midY, Math.max(barWidth - 0.5, 1), barH * 0.6);
    }

    // Center line
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Always draw region handles — gold triangles at top corners
    const handleSize = 10;

    // IN handle (left/start)
    ctx.fillStyle = "#c8a96e";
    ctx.strokeStyle = "#c8a96e";
    ctx.lineWidth = 2;
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(rsX, 0);
    ctx.lineTo(rsX, h);
    ctx.stroke();
    // Triangle pointing right
    ctx.beginPath();
    ctx.moveTo(rsX, 0);
    ctx.lineTo(rsX + handleSize, 0);
    ctx.lineTo(rsX, handleSize);
    ctx.fill();
    // Bottom triangle
    ctx.beginPath();
    ctx.moveTo(rsX, h);
    ctx.lineTo(rsX + handleSize, h);
    ctx.lineTo(rsX, h - handleSize);
    ctx.fill();

    // OUT handle (right/end)
    ctx.beginPath();
    ctx.moveTo(reX, 0);
    ctx.lineTo(reX, h);
    ctx.stroke();
    // Triangle pointing left
    ctx.beginPath();
    ctx.moveTo(reX, 0);
    ctx.lineTo(reX - handleSize, 0);
    ctx.lineTo(reX, handleSize);
    ctx.fill();
    // Bottom triangle
    ctx.beginPath();
    ctx.moveTo(reX, h);
    ctx.lineTo(reX - handleSize, h);
    ctx.lineTo(reX, h - handleSize);
    ctx.fill();

    // Playback cursor
    const pos = pauseOffset;
    const cursorX = (pos / duration) * w;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, h);
    ctx.stroke();

    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
  }, [audioBuffer, isPlaying, pauseOffset, effectiveStart, effectiveEnd, duration]);

  useEffect(() => {
    draw();
    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw, isPlaying]);

  useEffect(() => {
    if (!isPlaying) draw();
  }, [pauseOffset, isPlaying, draw]);

  const getTimeFromX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!audioBuffer) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const w = rect.width;
    const rsX = (effectiveStart / duration) * w;
    const reX = (effectiveEnd / duration) * w;

    // 16px hit zone for handles
    if (Math.abs(x - rsX) < 16) {
      setDragMode("regionStart");
    } else if (Math.abs(x - reX) < 16) {
      setDragMode("regionEnd");
    } else {
      setDragMode("seek");
      onSeek(getTimeFromX(e.clientX));
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [audioBuffer, effectiveStart, effectiveEnd, duration, getTimeFromX, onSeek]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragMode || !audioBuffer) return;
    const t = getTimeFromX(e.clientX);

    if (dragMode === "seek") {
      onSeek(t);
    } else if (dragMode === "regionStart") {
      const maxStart = effectiveEnd - 0.5;
      onRegionChange(Math.max(0, Math.min(t, maxStart)), regionEnd);
    } else if (dragMode === "regionEnd") {
      const minEnd = effectiveStart + 0.5;
      const newEnd = Math.min(duration, Math.max(t, minEnd));
      onRegionChange(regionStart, newEnd);
    }
  }, [dragMode, audioBuffer, getTimeFromX, onSeek, onRegionChange, regionStart, regionEnd, effectiveStart, effectiveEnd, duration]);

  const handlePointerUp = useCallback(() => {
    setDragMode(null);
  }, []);

  // Double-click to reset region
  const handleDoubleClick = useCallback(() => {
    if (!audioBuffer) return;
    onRegionChange(0, 0);
  }, [audioBuffer, onRegionChange]);

  return (
    <div
      ref={containerRef}
      style={{ height: "80px", touchAction: "none", background: "#0d0d0d", borderRadius: "2px", overflow: "hidden" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
