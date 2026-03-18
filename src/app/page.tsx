"use client";

import Uploader from "../../components/Uploader";
import SpectrumAnalyzer from "../../components/SpectrumAnalyzer";
import Controls from "../../components/Controls";
import Transport from "../../components/Transport";
import DownloadButton from "../../components/DownloadButton";
import ProgressBar from "../../components/ProgressBar";
import Playlist from "../../components/Playlist";
import Toast from "../../components/Toast";
import { useStore } from "../../lib/store";

const btnClass =
  "bg-gradient-to-b from-[#222] to-[#111] border border-[#333] border-b-2 border-b-black text-dw-btn-label px-4 py-3 text-[8px] uppercase tracking-[0.08em] font-mono shadow-[0_1px_0_rgba(255,255,255,0.08),inset_0_1px_2px_rgba(0,0,0,0.6)] hover:text-dw-btn-active active:bg-gradient-to-b active:from-[#111] active:to-[#1a1a1a] active:border-b active:translate-y-px disabled:opacity-50";

export default function Home() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const randomize = useStore((s) => s.randomize);

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "#060606" }}>
      <div className="flex max-w-[960px] w-full">
        {/* Left wood panel */}
        <div className="wood-left hidden sm:block" />

        {/* Main panel face */}
        <div className="flex-1 flex flex-col relative" style={{ background: "var(--panel-face)", border: "1px solid var(--panel-border)" }}>
          {/* Corner screws */}
          <div className="screw absolute top-2 left-2" style={{ zIndex: 10 }} />
          <div className="screw absolute top-2 right-2" style={{ zIndex: 10 }} />

          {/* Header strip */}
          <div className="px-4 py-2 flex items-center justify-between border-b border-dw-panel-border">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] text-white uppercase tracking-[0.15em] font-bold font-mono">KENWOOD</span>
                <span className="text-[8px] text-dw-muted font-mono tracking-wider">KRC-859W</span>
              </div>
            </div>
            <Uploader />
            {/* Red triangle indicator */}
            <div className="ml-2" style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid var(--vfd-red)" }} />
          </div>

          <SpectrumAnalyzer />
          <div className="panel-seam" />
          <Controls />
          <div className="panel-seam" />

          {/* Transport bar */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Transport />
              <ProgressBar />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={randomize} disabled={!sourceBuffer} className={btnClass}>
                RDM
              </button>
              <div className="flex-1" />
              <DownloadButton />
            </div>
          </div>

          <div className="panel-seam" />
          <Playlist />

          {/* Bottom screws */}
          <div className="screw absolute bottom-2 left-2" style={{ zIndex: 10 }} />
          <div className="screw absolute bottom-2 right-2" style={{ zIndex: 10 }} />
          <div className="h-4" />
        </div>

        {/* Right wood panel */}
        <div className="wood-right hidden sm:block" />
      </div>
      <Toast />
    </main>
  );
}
