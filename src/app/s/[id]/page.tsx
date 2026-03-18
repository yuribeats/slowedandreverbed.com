"use client";

import { useEffect } from "react";
import { useStore } from "../../../../lib/store";
import SpectrumAnalyzer from "../../../../components/SpectrumAnalyzer";
import Transport from "../../../../components/Transport";
import ProgressBar from "../../../../components/ProgressBar";
import Toast from "../../../../components/Toast";

const faderStyle: React.CSSProperties = {
  writingMode: "vertical-lr",
  direction: "rtl",
  WebkitAppearance: "none",
  appearance: "none",
  background: "transparent",
  width: "40px",
  top: 0,
  left: "50%",
  transform: "translateX(-50%)",
};

export default function SharePage({ params }: { params: { id: string } }) {
  const loadShare = useStore((s) => s.loadShare);
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const sourceFilename = useStore((s) => s.sourceFilename);
  const isLoading = useStore((s) => s.isLoading);
  const storeParams = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const isPlaying = useStore((s) => s.isPlaying);

  const rate = 1.0 + storeParams.speed;
  const reverbPct = Math.round(storeParams.reverb * 100);
  const toneLabel = storeParams.tone === 0 ? "FLAT" : storeParams.tone < 0 ? "DARK" : "BRIGHT";

  useEffect(() => {
    loadShare(params.id);
  }, [params.id, loadShare]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[1000px] flex flex-col gap-5">
        <div className="console flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-4 px-3 boot-stagger boot-delay-1">
            <div className="w-6 h-6 border-[3px] border-[var(--text-dark)] rounded-[4px] relative">
              <div className="absolute inset-[4px] bg-[var(--text-dark)]" />
            </div>
            <a
              href="/"
              className="text-lg sm:text-xl tracking-[2px] uppercase"
              style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}
            >
              SLOWED AND REVERBED MACHINE
            </a>
            {sourceFilename && (
              <span className="text-[10px] uppercase tracking-[0.1em] ml-auto" style={{ color: "var(--text-dark)" }}>
                {sourceFilename}
              </span>
            )}
          </div>

          {isLoading && (
            <div className="zone-inset text-center py-10">
              <p className="text-xs uppercase tracking-[0.15em]" style={{ color: "var(--text-dark)" }}>
                LOADING SHARED TRACK...
              </p>
            </div>
          )}

          {/* Display panel */}
          <div className="display-bezel grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-5 boot-stagger boot-delay-2">
            {/* Status CRT */}
            <div className="crt flex flex-col" style={{ height: "180px" }}>
              <div
                className="px-2 py-1 flex justify-between text-[10px] border-b z-10"
                style={{ color: "var(--crt-bright)", borderColor: "var(--crt-grid)", fontFamily: "var(--font-crt)", fontSize: "13px" }}
              >
                <span>SYS STATUS</span>
                {isPlaying && <span>PLAYING</span>}
              </div>
              <div
                className="crt-grid flex-1 p-2 leading-[2] z-10 crt-text"
                style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)", fontSize: "15px" }}
              >
                <div><span style={{ color: "var(--crt-dim)", display: "inline-block", width: "80px" }}>SPEED:</span> {rate.toFixed(2)}X</div>
                <div><span style={{ color: "var(--crt-dim)", display: "inline-block", width: "80px" }}>REVERB:</span> {reverbPct}%</div>
                <div><span style={{ color: "var(--crt-dim)", display: "inline-block", width: "80px" }}>TONE:</span> {toneLabel}</div>
              </div>
            </div>

            {/* Visualizer CRT */}
            <SpectrumAnalyzer />
          </div>

          {/* Control deck */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 boot-stagger boot-delay-3">
            {/* Transport */}
            <div className="zone-inset">
              <Transport />
              <div className="label" style={{ fontSize: "14px", color: "var(--text-dark)" }}>TRANSPORT</div>
            </div>

            {/* Effects */}
            <div className="zone-engraved relative">
              <div className="grid grid-cols-3 gap-4 pt-2" style={{ justifyItems: "center" }}>
                {/* Speed slider */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[140px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="-0.5"
                      max="0.5"
                      step="0.01"
                      value={storeParams.speed}
                      onChange={(e) => setParam("speed", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">SPEED</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{rate.toFixed(2)}X</span>
                </div>

                {/* Reverb slider */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[140px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={storeParams.reverb}
                      onChange={(e) => setParam("reverb", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">REVERB</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{reverbPct}%</span>
                </div>

                {/* Tone slider */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[140px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={storeParams.tone}
                      onChange={(e) => setParam("tone", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">TONE</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{toneLabel}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {sourceBuffer && (
            <div className="zone-inset">
              <ProgressBar />
            </div>
          )}
        </div>

        <Toast />
      </div>
    </main>
  );
}
