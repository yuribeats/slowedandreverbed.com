"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useStore } from "../lib/store";

export default function Uploader() {
  const loadFile = useStore((s) => s.loadFile);
  const isLoading = useStore((s) => s.isLoading);
  const sourceBuffer = useStore((s) => s.sourceBuffer);

  const [dragOver, setDragOver] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sourceBuffer && !isLoading) {
      setOpen(true);
    }
  }, [sourceBuffer, isLoading]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        loadFile(file);
        setOpen(false);
      }
    },
    [loadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        loadFile(file);
        setOpen(false);
      }
    },
    [loadFile]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="dark-faceplate border border-[#444] shadow-[0_8px_32px_rgba(0,0,0,0.6)] w-full max-w-lg mx-4">
        <div className="brushed-aluminum border-b border-[#666] px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] text-[#333] uppercase tracking-[0.2em] font-bold">
            LOAD TRACK
          </span>
          {sourceBuffer && (
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] text-[#555] hover:text-[#333] uppercase tracking-[0.15em] font-mono"
            >
              X
            </button>
          )}
        </div>
        <div className="p-6">
          <div
            className={`border-2 border-dashed ${
              dragOver ? "border-dw-amber" : "border-[#555]"
            } p-12 text-center transition-colors`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {isLoading ? (
              <p className="text-dw-amber uppercase tracking-[0.15em] text-xs">
                LOADING...
              </p>
            ) : (
              <p className="text-dw-muted uppercase tracking-[0.15em] text-xs">
                DROP AUDIO FILE HERE OR CLICK TO BROWSE
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
