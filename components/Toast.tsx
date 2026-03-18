"use client";

import { useEffect } from "react";
import { useStore } from "../lib/store";

export default function Toast() {
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 zone-inset border-2 border-[var(--led-red-on)] px-4 py-3 text-xs uppercase tracking-wider max-w-sm" style={{ color: "var(--led-red-on)", fontFamily: "var(--font-tech)" }}>
      <div className="flex justify-between gap-4">
        <span>{error}</span>
        <button onClick={clearError} style={{ color: "var(--panel-light)" }}>
          X
        </button>
      </div>
    </div>
  );
}
