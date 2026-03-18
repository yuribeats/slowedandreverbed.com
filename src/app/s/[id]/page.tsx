"use client";

import { useEffect } from "react";
import { useStore } from "../../../../lib/store";
import VUMeter from "../../../../components/VUMeter";
import TapeWindow from "../../../../components/TapeWindow";
import SpectrumAnalyzer from "../../../../components/SpectrumAnalyzer";
import Controls from "../../../../components/Controls";
import Transport from "../../../../components/Transport";
import ProgressBar from "../../../../components/ProgressBar";
import DownloadButton from "../../../../components/DownloadButton";
import Toast from "../../../../components/Toast";

export default function SharePage({ params }: { params: { id: string } }) {
  const loadShare = useStore((s) => s.loadShare);
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const sourceFilename = useStore((s) => s.sourceFilename);
  const isLoading = useStore((s) => s.isLoading);
  const isPlaying = useStore((s) => s.isPlaying);

  useEffect(() => {
    loadShare(params.id);
  }, [params.id, loadShare]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative vignette">
      <div className="flex w-full max-w-[960px]">
        <div className="wood-panel-left hidden sm:block" />

        <div className="flex-1 brushed-aluminum border border-[#666] shadow-[0_4px_20px_rgba(0,0,0,0.6)] min-w-0">
          {/* Top strip */}
          <div className="flex items-stretch border-b border-[#777]">
            <div className="flex flex-col justify-center px-4 py-2 border-r border-[#777] min-w-[140px]">
              <a href="/" className="text-[10px] text-[#333] uppercase tracking-[0.15em] font-bold">
                SLOWED + REVERB
              </a>
              <span className="text-[7px] text-[#888] uppercase tracking-[0.2em]">MACHINE</span>
              {sourceFilename && (
                <span className="text-[8px] text-[#555] uppercase tracking-[0.1em] mt-1 truncate">
                  {sourceFilename}
                </span>
              )}
              <div className="flex items-center gap-2 mt-2">
                <div className={`led ${isPlaying ? "led-on-green" : "led-off"}`} />
                <span className="text-[7px] text-[#777] uppercase">{isPlaying ? "PLAY" : "STOP"}</span>
              </div>
            </div>

            <div className="flex-1 p-3 flex flex-col gap-2 min-w-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-28">
                  <p className="text-[#555] uppercase tracking-[0.15em] text-xs font-bold" style={{ textShadow: "0 1px 0 rgba(255,255,255,0.3)" }}>
                    LOADING SHARED TRACK...
                  </p>
                </div>
              ) : (
                <>
                  <VUMeter />
                  <TapeWindow />
                </>
              )}
            </div>

            <div className="hidden md:block w-[200px] border-l border-[#777] p-2">
              <SpectrumAnalyzer compact />
            </div>
          </div>

          {/* Bottom strip */}
          <div className="flex items-center border-t border-[#555]">
            <div className="flex-1 min-w-0">
              <Controls />
            </div>

            <div className="w-[1px] self-stretch bg-[#777] shadow-[1px_0_0_rgba(255,255,255,0.08)]" />

            {sourceBuffer && (
              <div className="flex flex-col gap-2 px-4 py-3">
                <Transport />
                <ProgressBar />
                <div className="flex items-center justify-end">
                  <DownloadButton />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="wood-panel-right hidden sm:block" />
      </div>
      <Toast />
    </main>
  );
}
