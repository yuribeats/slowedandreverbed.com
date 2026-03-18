"use client";

import { useRef, useCallback } from "react";
import { useStore } from "../lib/store";

export default function Uploader() {
  const loadFile = useStore((s) => s.loadFile);
  const isLoading = useStore((s) => s.isLoading);
  const sourceFilename = useStore((s) => s.sourceFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
        className="text-[10px] uppercase tracking-[0.1em] font-medium font-mono disabled:opacity-50"
        style={{
          color: sourceFilename ? "var(--vfd-teal-dim)" : "var(--vfd-teal)",
          textShadow: sourceFilename ? "none" : "0 0 8px rgba(0,229,204,0.4)",
        }}
      >
        {isLoading ? "LOADING..." : sourceFilename || "LOAD SONG"}
      </button>
    </>
  );
}
