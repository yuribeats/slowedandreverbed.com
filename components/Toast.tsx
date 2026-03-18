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
    <div className="fixed bottom-4 left-4 z-50 bg-surface border border-danger px-4 py-3 text-danger text-xs uppercase tracking-wider max-w-sm">
      <div className="flex justify-between gap-4">
        <span>{error}</span>
        <button onClick={clearError} className="text-text-muted hover:text-text-primary">
          X
        </button>
      </div>
    </div>
  );
}
