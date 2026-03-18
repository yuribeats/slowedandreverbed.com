"use client";

import { useStore } from "../lib/store";

export default function DownloadButton() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isExporting = useStore((s) => s.isExporting);
  const download = useStore((s) => s.download);

  return (
    <button
      onClick={download}
      disabled={!sourceBuffer || isExporting}
      className="bg-gradient-to-b from-[#222] to-[#111] border border-dw-vfd-teal text-dw-vfd-teal px-5 py-3 text-[8px] uppercase tracking-[0.08em] font-mono shadow-[0_1px_0_rgba(255,255,255,0.08),inset_0_1px_2px_rgba(0,0,0,0.6)] hover:text-white active:from-[#111] active:to-[#1a1a1a] active:translate-y-px disabled:opacity-50"
      style={{ textShadow: "0 0 6px rgba(0,229,204,0.4)" }}
    >
      {isExporting ? "EXPORTING..." : "DOWNLOAD WAV"}
    </button>
  );
}
