"use client";

import Uploader from "../../components/Uploader";
import VUMeter from "../../components/VUMeter";
import TapeWindow from "../../components/TapeWindow";
import SpectrumAnalyzer from "../../components/SpectrumAnalyzer";
import Controls from "../../components/Controls";
import Transport from "../../components/Transport";
import DownloadButton from "../../components/DownloadButton";
import ProgressBar from "../../components/ProgressBar";
import Playlist from "../../components/Playlist";
import Toast from "../../components/Toast";
import { useStore } from "../../lib/store";

const btnClass =
  "transport-btn px-3 py-2 text-[9px] text-[#333] uppercase tracking-[0.1em] font-mono disabled:opacity-50";

export default function Home() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const randomize = useStore((s) => s.randomize);
  const isPlaying = useStore((s) => s.isPlaying);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative vignette">
      {/* === MAIN UNIT: horizontal cassette deck === */}
      <div className="flex w-full max-w-[960px]">
        {/* Left rosewood panel */}
        <div className="wood-panel-left hidden sm:block" />

        {/* Central brushed aluminum panel */}
        <div className="flex-1 brushed-aluminum border border-[#666] shadow-[0_4px_20px_rgba(0,0,0,0.6)] min-w-0">
          {/* Top strip: brand + display + status */}
          <div className="flex items-stretch border-b border-[#777]">
            {/* Brand / source section (left) */}
            <div className="flex flex-col justify-center px-4 py-2 border-r border-[#777] min-w-[140px]">
              <h1 className="text-[10px] text-[#333] uppercase tracking-[0.15em] font-bold whitespace-nowrap">
                SLOWED + REVERB
              </h1>
              <span className="text-[7px] text-[#888] uppercase tracking-[0.2em]">MACHINE</span>
              <div className="mt-2">
                <Uploader />
              </div>
              {/* LED status */}
              <div className="flex items-center gap-2 mt-2">
                <div className={`led ${isPlaying ? "led-on-green" : "led-off"}`} />
                <span className="text-[7px] text-[#777] uppercase">{isPlaying ? "PLAY" : "STOP"}</span>
                <div className={`led ${sourceBuffer ? "led-on-amber" : "led-off"}`} />
                <span className="text-[7px] text-[#777] uppercase">TAPE</span>
              </div>
            </div>

            {/* Center display area: VU meters + tape window */}
            <div className="flex-1 p-3 flex flex-col gap-2 min-w-0">
              <VUMeter />
              <TapeWindow />
            </div>

            {/* Right: spectrum bars (compact) */}
            <div className="hidden md:block w-[200px] border-l border-[#777] p-2">
              <SpectrumAnalyzer compact />
            </div>
          </div>

          {/* Bottom strip: knobs + transport + actions */}
          <div className="flex items-center border-t border-[#555]">
            {/* Knob controls */}
            <div className="flex-1 min-w-0">
              <Controls />
            </div>

            {/* Divider */}
            <div className="w-[1px] self-stretch bg-[#777] shadow-[1px_0_0_rgba(255,255,255,0.08)]" />

            {/* Transport + actions */}
            <div className="flex flex-col gap-2 px-4 py-3">
              <Transport />
              <ProgressBar />
              <div className="flex items-center gap-2">
                <button onClick={randomize} disabled={!sourceBuffer} className={btnClass}>
                  RDM
                </button>
                <DownloadButton />
              </div>
            </div>
          </div>
        </div>

        {/* Right rosewood panel */}
        <div className="wood-panel-right hidden sm:block" />
      </div>

      {/* Playlist sits below the unit */}
      <div className="w-full max-w-[960px] mt-2">
        <Playlist />
      </div>

      <Toast />
    </main>
  );
}
