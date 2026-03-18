"use client";

import { useRef, useEffect, useCallback } from "react";
import { useStore } from "../lib/store";

const BAR_COUNT = 32;
const BAR_GAP = 2;

export default function SpectrumAnalyzer() {
  const isPlaying = useStore((s) => s.isPlaying);
  const nodes = useStore((s) => s.nodes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const peaksRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

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

    // VFD dark background
    ctx.fillStyle = "#050e08";
    ctx.fillRect(0, 0, width, height);

    // Subtle teal grid lines
    ctx.strokeStyle = "rgba(0, 229, 204, 0.03)";
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const barWidth = (width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
    const freqData = new Uint8Array(128);

    if (nodes?.analyser && isPlaying) {
      nodes.analyser.getByteFrequencyData(freqData);
    }

    for (let i = 0; i < BAR_COUNT; i++) {
      const binIndex = Math.floor(Math.pow(i / BAR_COUNT, 1.5) * freqData.length);
      const value = freqData[binIndex] || 0;
      const normalized = value / 255;
      const x = i * (barWidth + BAR_GAP);

      const segmentHeight = 4;
      const segmentGap = 1;
      const totalSegments = Math.floor(height / (segmentHeight + segmentGap));
      const activeSegments = Math.floor(normalized * totalSegments);

      for (let s = 0; s < activeSegments; s++) {
        const segY = height - (s + 1) * (segmentHeight + segmentGap);
        const ratio = s / totalSegments;

        // VFD teal color scheme: dim teal → bright teal → white-teal
        let r, g, b;
        if (ratio < 0.5) {
          r = 0;
          g = 120 + ratio * 200;
          b = 100 + ratio * 160;
        } else if (ratio < 0.8) {
          r = 0;
          g = 229;
          b = 204;
        } else {
          r = (ratio - 0.8) * 400;
          g = 229 + (ratio - 0.8) * 130;
          b = 204 + (ratio - 0.8) * 260;
        }

        ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        ctx.fillRect(x, segY, barWidth, segmentHeight);
      }

      // Peak hold
      if (normalized > (peaksRef.current[i] || 0)) {
        peaksRef.current[i] = normalized;
      } else {
        peaksRef.current[i] = Math.max(0, (peaksRef.current[i] || 0) - 0.01);
      }

      const peakSegment = Math.floor(peaksRef.current[i] * totalSegments);
      if (peakSegment > 0) {
        const peakY = height - peakSegment * (segmentHeight + segmentGap);
        ctx.fillStyle = "rgb(0, 255, 200)";
        ctx.fillRect(x, peakY, barWidth, segmentHeight);
      }
    }

    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    }
  }, [isPlaying, nodes]);

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
    if (!isPlaying) {
      peaksRef.current = new Array(BAR_COUNT).fill(0);
      draw();
    }
  }, [isPlaying, draw]);

  return (
    <div className="px-3 py-2">
      <div className="vfd-display p-1">
        <canvas ref={canvasRef} className="w-full h-32 block" />
      </div>
    </div>
  );
}
