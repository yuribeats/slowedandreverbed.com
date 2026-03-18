"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  startedAt?: number;
  pauseOffset: number;
  playbackRate?: number;
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

  // Normalize
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
  const effectiveEnd = regionEnd > 0 ? regionEnd : duration;

  // Compute peaks when buffer changes
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

    // Background
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, w, h);

    if (!peaks || !audioBuffer) {
      // Empty state
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.font = "11px monospace";
      ctx.fillText("NO TRACK LOADED", w / 2, h / 2 + 4);
      return;
    }

    const numBars = peaks.length;
    const barWidth = w / numBars;
    const midY = h / 2;

    // Region shading
    const rsX = (regionStart / duration) * w;
    const reX = (effectiveEnd / duration) * w;

    // Dim area outside region
    if (regionStart > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, rsX, h);
    }
    if (regionEnd > 0 && regionEnd < duration) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(reX, 0, w - reX, h);
    }

    // Draw waveform bars
    for (let i = 0; i < numBars; i++) {
      const x = i * barWidth;
      const barH = peaks[i] * midY * 0.9;
      const posInTrack = (i / numBars) * duration;
      const inRegion = posInTrack >= regionStart && posInTrack <= effectiveEnd;

      if (inRegion) {
        ctx.fillStyle = "#6b8f71";
      } else {
        ctx.fillStyle = "#2a3a2c";
      }

      // Mirror waveform
      ctx.fillRect(x, midY - barH, Math.max(barWidth - 0.5, 1), barH);
      ctx.fillRect(x, midY, Math.max(barWidth - 0.5, 1), barH * 0.6);
    }

    // Center line
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Region markers
    if (regionStart > 0 || (regionEnd > 0 && regionEnd < duration)) {
      ctx.strokeStyle = "#c8a96e";
      ctx.lineWidth = 2;

      if (regionStart > 0) {
        ctx.beginPath();
        ctx.moveTo(rsX, 0);
        ctx.lineTo(rsX, h);
        ctx.stroke();

        // Handle triangle
        ctx.fillStyle = "#c8a96e";
        ctx.beginPath();
        ctx.moveTo(rsX, 0);
        ctx.lineTo(rsX + 8, 0);
        ctx.lineTo(rsX, 8);
        ctx.fill();
      }

      if (regionEnd > 0 && regionEnd < duration) {
        ctx.beginPath();
        ctx.moveTo(reX, 0);
        ctx.lineTo(reX, h);
        ctx.stroke();

        ctx.fillStyle = "#c8a96e";
        ctx.beginPath();
        ctx.moveTo(reX, 0);
        ctx.lineTo(reX - 8, 0);
        ctx.lineTo(reX, 8);
        ctx.fill();
      }
    }

    // Playback cursor
    const pos = pauseOffset;
    if (pos > 0 || isPlaying) {
      const cursorX = (pos / duration) * w;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();
    }

    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
  }, [audioBuffer, isPlaying, pauseOffset, regionStart, regionEnd, effectiveEnd, duration]);

  useEffect(() => {
    draw();
    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw, isPlaying]);

  // Redraw when paused and pauseOffset changes
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

    // Check if near region handles (within 12px)
    const rsX = (regionStart / duration) * w;
    const reX = (effectiveEnd / duration) * w;

    if (regionStart > 0 && Math.abs(x - rsX) < 12) {
      setDragMode("regionStart");
    } else if (regionEnd > 0 && regionEnd < duration && Math.abs(x - reX) < 12) {
      setDragMode("regionEnd");
    } else {
      setDragMode("seek");
      const t = getTimeFromX(e.clientX);
      onSeek(t);
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [audioBuffer, regionStart, regionEnd, effectiveEnd, duration, getTimeFromX, onSeek]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragMode || !audioBuffer) return;
    const t = getTimeFromX(e.clientX);

    if (dragMode === "seek") {
      onSeek(t);
    } else if (dragMode === "regionStart") {
      const newStart = Math.min(t, effectiveEnd - 0.5);
      onRegionChange(Math.max(0, newStart), regionEnd);
    } else if (dragMode === "regionEnd") {
      const newEnd = Math.max(t, regionStart + 0.5);
      onRegionChange(regionStart, Math.min(newEnd, duration));
    }
  }, [dragMode, audioBuffer, getTimeFromX, onSeek, onRegionChange, regionStart, regionEnd, effectiveEnd, duration]);

  const handlePointerUp = useCallback(() => {
    setDragMode(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="crt"
      style={{ height: "80px", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
