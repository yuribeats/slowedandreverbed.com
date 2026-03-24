"use client";

import { useRef, useState, useCallback } from "react";
import { useStore } from "../lib/store";
import { getAudioContext } from "../lib/audio-context";

const btnBase = "rocker-switch";

export default function Transport({ onExportVideo }: { onExportVideo?: () => void }) {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const isExporting = useStore((s) => s.isExporting);
  const isLoading = useStore((s) => s.isLoading);
  const error = useStore((s) => s.error);
  const play = useStore((s) => s.play);
  const stop = useStore((s) => s.stop);
  const eject = useStore((s) => s.eject);
  const loadFile = useStore((s) => s.loadFile);
  const loadFromYouTube = useStore((s) => s.loadFromYouTube);
  const randomize = useStore((s) => s.randomize);
  const download = useStore((s) => s.download);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ytUrl, setYtUrl] = useState("");

  const off = !sourceBuffer;

  const handleLoad = useCallback(() => {
    getAudioContext();
    if (sourceBuffer) {
      eject();
    }
    inputRef.current?.click();
  }, [sourceBuffer, eject]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const ctx = getAudioContext();
      await ctx.resume();
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [loadFile]
  );

  const handleYouTube = useCallback(async () => {
    if (!ytUrl.trim()) return;
    const ctx = getAudioContext();
    await ctx.resume();
    await loadFromYouTube(ytUrl.trim());
    setYtUrl("");
  }, [ytUrl, loadFromYouTube]);

  return (
    <div className="flex flex-col gap-3">
    <div className="flex items-center gap-4 flex-wrap justify-center">
      <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />

      {/* Load */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="label" style={{ margin: 0, fontSize: "13px" }}>LOAD</span>
          <div className="led-cutout">
            <div className={`led-rect ${isLoading ? "led-green-on" : sourceBuffer ? "led-green-on" : "led-green"}`} />
          </div>
        </div>
        <button
          onClick={handleLoad}
          disabled={isLoading}
          className={btnBase}
        >
          <div className="w-2 h-2 rounded-full border-2 border-[#555]" />
        </button>
      </div>

      {/* Play/Stop */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="label" style={{ margin: 0, fontSize: "13px" }}>{isPlaying ? "STOP" : "PLAY"}</span>
          <div className="led-cutout">
            <div className={`led-rect ${isPlaying ? "led-green-on" : "led-green"}`} />
          </div>
        </div>
        <button
          onClick={async () => { const ctx = getAudioContext(); await ctx.resume(); if (isPlaying) { stop(); } else { play(); } }}
          disabled={!isPlaying && off}
          className={btnBase}
        >
          <div className="w-2 h-2 rounded-full border-2 border-[#555]" />
        </button>
      </div>

      {/* RDM */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="label" style={{ margin: 0, fontSize: "13px" }}>RANDOM</span>
          <div className="led-cutout">
            <div className="led-rect led-green" />
          </div>
        </div>
        <button onClick={randomize} disabled={off} className={btnBase}>
          <div className="w-2 h-2 rounded-full border-2 border-[#555]" />
        </button>
      </div>

      {/* Download WAV */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="label" style={{ margin: 0, fontSize: "13px" }}>{isExporting ? "WAIT" : "WAV"}</span>
          <div className="led-cutout">
            <div className={`led-rect ${isExporting ? "led-green-on" : "led-green"}`} />
          </div>
        </div>
        <button onClick={download} disabled={off || isExporting} className={btnBase}>
          <div className="w-2 h-2 rounded-full border-2 border-[#555]" />
        </button>
      </div>

      {/* Export MP4 */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className="label" style={{ margin: 0, fontSize: "13px" }}>MP4</span>
          <div className="led-cutout">
            <div className="led-rect led-green" />
          </div>
        </div>
        <button onClick={onExportVideo} disabled={off || isExporting} className={btnBase}>
          <div className="w-2 h-2 rounded-full border-2 border-[#555]" />
        </button>
      </div>
    </div>

    {/* YouTube URL input */}
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={ytUrl}
        onChange={(e) => setYtUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleYouTube(); }}
        placeholder="PASTE YOUTUBE URL"
        disabled={isLoading}
        className="flex-1 bg-transparent border border-[#333] px-2 py-1 text-[14px] uppercase tracking-wider"
        style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", outline: "none" }}
      />
      <button
        onClick={handleYouTube}
        disabled={isLoading || !ytUrl.trim()}
        className="border border-[#333] px-3 py-1 text-[13px] uppercase tracking-wider disabled:opacity-30"
        style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}
      >
        {isLoading ? "LOADING..." : "LOAD"}
      </button>
    </div>
    {error && (
      <div className="text-[13px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "#ff4444" }}>
        {error}
      </div>
    )}
    </div>
  );
}
