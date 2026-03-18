"use client";

import { useRef, useState, useCallback } from "react";
import { useStore } from "../lib/store";

export default function Uploader() {
  const loadFile = useStore((s) => s.loadFile);
  const loadFromYouTube = useStore((s) => s.loadFromYouTube);
  const isLoading = useStore((s) => s.isLoading);
  const sourceBuffer = useStore((s) => s.sourceBuffer);

  const [ytUrl, setYtUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [ytError, setYtError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleYouTube = useCallback(async () => {
    setYtError("");
    const url = ytUrl.trim();
    if (!url) return;
    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
      setYtError("INVALID YOUTUBE URL");
      return;
    }
    try {
      await loadFromYouTube(url);
      setYtUrl("");
    } catch (err) {
      setYtError(err instanceof Error ? err.message : "FETCH FAILED");
    }
  }, [ytUrl, loadFromYouTube]);

  if (sourceBuffer && !isLoading) return null;

  return (
    <div className="wood-grain p-[6px]">
      <div className="dark-faceplate border border-[#444] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] p-6">
        <div
          className={`border-2 border-dashed ${
            dragOver ? "border-dw-amber" : "border-[#555]"
          } p-10 text-center transition-colors`}
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
              DROP AUDIO FILE / CLICK TO BROWSE
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleYouTube()}
            placeholder="PASTE YOUTUBE URL..."
            disabled={isLoading}
            className="flex-1 bg-[#111] border border-[#444] px-3 py-2 text-xs text-dw-text placeholder:text-dw-muted uppercase tracking-[0.1em] outline-none focus:border-dw-amber disabled:opacity-50 font-mono"
          />
          <button
            onClick={handleYouTube}
            disabled={isLoading || !ytUrl.trim()}
            className="bg-gradient-to-b from-[#c0c0c0] via-[#a0a0a0] to-[#888] border border-[#666] px-5 py-2 text-xs text-[#333] uppercase tracking-[0.15em] hover:from-[#d0d0d0] hover:to-[#999] disabled:opacity-50 font-mono shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.4)]"
          >
            {isLoading ? "..." : "FETCH"}
          </button>
        </div>

        {ytError && (
          <p className="mt-2 text-dw-danger text-[10px] uppercase tracking-[0.1em]">
            {ytError}
          </p>
        )}
      </div>
    </div>
  );
}
