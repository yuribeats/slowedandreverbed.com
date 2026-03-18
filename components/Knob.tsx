"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  valueDisplay: string;
  onChange: (value: number) => void;
  ticks?: number;
}

const MIN_ANGLE = -135;
const MAX_ANGLE = 135;

export default function Knob({
  value,
  min,
  max,
  step = 0.01,
  label,
  valueDisplay,
  onChange,
  ticks = 11,
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const normalized = (localValue - min) / (max - min);
  const angle = MIN_ANGLE + normalized * (MAX_ANGLE - MIN_ANGLE);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startValue.current = localValue;
      document.body.style.userSelect = "none";
    },
    [localValue]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      const sensitivity = 200;
      let newValue = startValue.current + (deltaY / sensitivity) * range;
      newValue = Math.round(newValue / step) * step;
      newValue = Math.max(min, Math.min(max, newValue));
      setLocalValue(newValue);
      onChange(newValue);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [min, max, step, onChange]);

  // Touch support
  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.touches[0].clientY;
      startValue.current = localValue;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const deltaY = startY.current - e.touches[0].clientY;
      const range = max - min;
      const sensitivity = 200;
      let newValue = startValue.current + (deltaY / sensitivity) * range;
      newValue = Math.round(newValue / step) * step;
      newValue = Math.max(min, Math.min(max, newValue));
      setLocalValue(newValue);
      onChange(newValue);
    };

    const handleTouchEnd = () => {
      dragging.current = false;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [localValue, min, max, step, onChange]);

  const tickMarks = [];
  for (let i = 0; i < ticks; i++) {
    const t = i / (ticks - 1);
    const tickAngle = MIN_ANGLE + t * (MAX_ANGLE - MIN_ANGLE);
    const rad = ((tickAngle - 90) * Math.PI) / 180;
    const r = 34;
    const x = 40 + r * Math.cos(rad);
    const y = 40 + r * Math.sin(rad);
    tickMarks.push(
      <div
        key={i}
        className="absolute w-[2px] h-[6px] bg-dw-muted"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          transform: `translate(-50%, -50%) rotate(${tickAngle}deg)`,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-dw-muted uppercase tracking-[0.15em]">
        {label}
      </span>
      <div className="relative w-[80px] h-[80px]" ref={knobRef}>
        {tickMarks}
        <div
          className="absolute inset-[8px] rounded-full bg-gradient-to-b from-[#6a6a6a] via-[#4a4a4a] to-[#2a2a2a] shadow-[0_2px_8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)]"
          style={{ transform: `rotate(${angle}deg)` }}
          onMouseDown={handleMouseDown}
        >
          {/* Pointer notch */}
          <div className="absolute top-[4px] left-1/2 -translate-x-1/2 w-[2px] h-[12px] bg-[#e8e0d0]" />
          {/* Center cap */}
          <div className="absolute inset-[10px] rounded-full bg-gradient-to-b from-[#555] to-[#333] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]" />
        </div>
      </div>
      <span className="text-[11px] text-dw-accent font-mono tracking-wider">
        {valueDisplay}
      </span>
    </div>
  );
}
