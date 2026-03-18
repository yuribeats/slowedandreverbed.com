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

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[96px] h-[96px] knob-ring" ref={knobRef}>
        {/* Knob body */}
        <div
          className="absolute inset-[8px] rounded-full knob-body"
          style={{ transform: `rotate(${angle}deg)` }}
          onMouseDown={handleMouseDown}
        >
          {/* Dark face */}
          <div className="absolute inset-[6px] rounded-full knob-face">
            <div className="knob-indicator" />
          </div>
        </div>
      </div>
      <div className="label">{label}</div>
      <span className="text-[11px] font-mono tracking-wider" style={{ color: "var(--crt-bright)", textShadow: "0 0 6px var(--crt-dim)" }}>
        {valueDisplay}
      </span>
    </div>
  );
}
