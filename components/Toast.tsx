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
    <div className="fixed bottom-4 left-4 z-50 border border-dw-danger px-4 py-3 text-dw-danger text-[9px] uppercase tracking-wider max-w-sm font-mono" style={{ background: "var(--panel-face)" }}>
      <div className="flex justify-between gap-4">
        <span>{error}</span>
        <button onClick={clearError} className="text-dw-muted hover:text-dw-text">
          X
        </button>
      </div>
    </div>
  );
}
