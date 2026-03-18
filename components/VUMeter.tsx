"use client";

import { useRef, useEffect, useCallback } from "react";
import { useStore } from "../lib/store";

export default function VUMeter() {
  const isPlaying = useStore((s) => s.isPlaying);
  const nodes = useStore((s) => s.nodes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const needleL = useRef(0);
  const needleR = useRef(0);
  const velocityL = useRef(0);
  const velocityR = useRef(0);

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
    const meterW = w / 2 - 4;

    // Get audio levels
    let levelL = 0;
    let levelR = 0;
    if (nodes?.analyser && isPlaying) {
      const data = new Uint8Array(256);
      nodes.analyser.getByteFrequencyData(data);
      // Split into left/right approximation (even/odd bins)
      let sumL = 0, sumR = 0;
      for (let i = 0; i < data.length; i++) {
        if (i % 2 === 0) sumL += data[i];
        else sumR += data[i];
      }
      levelL = sumL / (data.length / 2) / 255;
      levelR = sumR / (data.length / 2) / 255;
    }

    // Analog needle physics — slight inertia + overshoot
    const attack = 0.15;
    const release = 0.04;
    const damping = 0.7;

    const targetL = levelL;
    const targetR = levelR;

    velocityL.current += (targetL - needleL.current) * attack;
    velocityL.current *= damping;
    needleL.current += velocityL.current;
    if (!isPlaying) {
      needleL.current += (0 - needleL.current) * release;
    }
    needleL.current = Math.max(0, Math.min(1, needleL.current));

    velocityR.current += (targetR - needleR.current) * attack;
    velocityR.current *= damping;
    needleR.current += velocityR.current;
    if (!isPlaying) {
      needleR.current += (0 - needleR.current) * release;
    }
    needleR.current = Math.max(0, Math.min(1, needleR.current));

    // Draw both meters
    drawMeter(ctx, 0, 0, meterW, h, needleL.current, "L");
    drawMeter(ctx, meterW + 8, 0, meterW, h, needleR.current, "R");

    animRef.current = requestAnimationFrame(draw);
  }, [isPlaying, nodes]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <div className="tinted-glass border border-[#222] p-2">
      <canvas ref={canvasRef} className="w-full h-28 block" />
    </div>
  );
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  level: number,
  label: string
) {
  const cx = x + w / 2;
  const cy = y + h - 8;
  const radius = Math.min(w, h) * 0.7;

  // Meter face — off-white
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();

  ctx.fillStyle = "#f0ece0";
  ctx.fillRect(x, y, w, h);

  // Arc tick marks
  const startAngle = Math.PI + 0.3;
  const endAngle = -0.3;
  const tickCount = 21;

  for (let i = 0; i <= tickCount; i++) {
    const t = i / tickCount;
    const angle = startAngle + t * (endAngle - startAngle);
    const isMajor = i % 5 === 0;
    const innerR = radius - (isMajor ? 16 : 10);
    const outerR = radius - 4;

    const x1 = cx + innerR * Math.cos(angle);
    const y1 = cy + innerR * Math.sin(angle);
    const x2 = cx + outerR * Math.cos(angle);
    const y2 = cy + outerR * Math.sin(angle);

    // Color zones: green < 0.65, yellow 0.65-0.85, red > 0.85
    if (t > 0.85) {
      ctx.strokeStyle = "#cc2020";
      ctx.lineWidth = isMajor ? 2 : 1;
    } else if (t > 0.65) {
      ctx.strokeStyle = "#cc8800";
      ctx.lineWidth = isMajor ? 1.5 : 1;
    } else {
      ctx.strokeStyle = "#333";
      ctx.lineWidth = isMajor ? 1.5 : 0.8;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // dB labels
  ctx.fillStyle = "#555";
  ctx.font = "7px sans-serif";
  ctx.textAlign = "center";
  const dbLabels = [
    { val: "-20", t: 0.15 },
    { val: "-10", t: 0.35 },
    { val: "-5", t: 0.5 },
    { val: "0", t: 0.7 },
    { val: "+3", t: 0.9 },
  ];
  for (const lb of dbLabels) {
    const angle = startAngle + lb.t * (endAngle - startAngle);
    const lr = radius - 24;
    const lx = cx + lr * Math.cos(angle);
    const ly = cy + lr * Math.sin(angle);
    ctx.fillText(lb.val, lx, ly);
  }

  // VU label
  ctx.fillStyle = "#333";
  ctx.font = "bold 9px sans-serif";
  ctx.fillText("VU", cx, cy - radius * 0.25);

  // Channel label
  ctx.fillStyle = "#888";
  ctx.font = "bold 8px sans-serif";
  ctx.fillText(label, cx, cy - 2);

  // Needle
  const needleAngle = startAngle + level * (endAngle - startAngle);
  const needleLen = radius - 8;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + needleLen * Math.cos(needleAngle),
    cy + needleLen * Math.sin(needleAngle)
  );
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Red needle tip
  const tipStart = needleLen * 0.85;
  ctx.beginPath();
  ctx.moveTo(
    cx + tipStart * Math.cos(needleAngle),
    cy + tipStart * Math.sin(needleAngle)
  );
  ctx.lineTo(
    cx + needleLen * Math.cos(needleAngle),
    cy + needleLen * Math.sin(needleAngle)
  );
  ctx.strokeStyle = "#cc2020";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Needle pivot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#222";
  ctx.fill();

  ctx.restore();
}
