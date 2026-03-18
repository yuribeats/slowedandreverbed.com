"use client";

import { useState } from "react";
import { expandParams } from "@yuribeats/audio-utils";
import SpectrumAnalyzer from "../../components/SpectrumAnalyzer";
import Transport from "../../components/Transport";
import ProgressBar from "../../components/ProgressBar";
import Playlist from "../../components/Playlist";
import Toast from "../../components/Toast";
import { useStore } from "../../lib/store";

function snapToSemitone(speed: number): number {
  const rate = 1.0 + speed;
  const semitones = 12 * Math.log2(rate);
  const snapped = Math.round(semitones);
  return Math.pow(2, snapped / 12) - 1.0;
}

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

const detailBtnClass = (active: boolean) =>
  `text-[8px] uppercase tracking-[0.15em] px-2 py-0.5 border ${
    active ? "border-[#333] bg-[rgba(255,115,0,0.15)]" : "border-[#777]"
  }`;

const detailBtnStyle: React.CSSProperties = { fontFamily: "var(--font-tech)", color: "var(--text-dark)" };

export default function Home() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const sourceFilename = useStore((s) => s.sourceFilename);
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const [stepMode, setStepMode] = useState(false);
  const [reverbDetail, setReverbDetail] = useState(false);
  const [toneDetail, setToneDetail] = useState(false);

  const rate = 1.0 + params.speed;
  const semitones = 12 * Math.log2(rate);
  const reverbPct = Math.round(params.reverb * 100);
  const toneLabel = params.tone === 0 ? "FLAT" : params.tone < 0 ? "DARK" : "BRIGHT";

  const expanded = expandParams(params);

  const handleSpeed = (v: number) => {
    if (stepMode) {
      setParam("speed", snapToSemitone(v));
    } else {
      setParam("speed", v);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[1000px] flex flex-col gap-5">
        <div className="console flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-4 px-3 boot-stagger boot-delay-1">
            <div className="w-6 h-6 border-[3px] border-[var(--text-dark)] rounded-[4px] relative">
              <div className="absolute inset-[4px] bg-[var(--text-dark)]" />
            </div>
            <span
              className="text-lg sm:text-xl tracking-[2px] uppercase"
              style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}
            >
              SLOWED AND REVERBED MACHINE
            </span>
          </div>

          {/* Display panel */}
          <div className="display-bezel grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-5 boot-stagger boot-delay-2">
            {/* Status CRT */}
            <div className="crt flex flex-col" style={{ height: "180px" }}>
              <div
                className="px-2 py-1 flex justify-between text-[10px] border-b z-10"
                style={{ color: "var(--crt-bright)", borderColor: "var(--crt-grid)", fontFamily: "var(--font-crt)", fontSize: "13px" }}
              >
                <span>{sourceFilename ? sourceFilename.toUpperCase() : "SYS STATUS"}</span>
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

          {/* Control deck — 2 columns on desktop, stacked on mobile */}
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
                      step={stepMode ? 0.001 : 0.01}
                      value={params.speed}
                      onChange={(e) => handleSpeed(parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">SPEED</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{rate.toFixed(2)}X / {semitones >= 0 ? "+" : ""}{semitones.toFixed(1)}ST</span>
                  <button
                    onClick={() => setStepMode(!stepMode)}
                    className={detailBtnClass(stepMode)}
                    style={detailBtnStyle}
                  >
                    STEP
                  </button>
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
                      value={params.reverb}
                      onChange={(e) => setParam("reverb", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">REVERB</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{reverbPct}%</span>
                  <button
                    onClick={() => setReverbDetail(!reverbDetail)}
                    className={detailBtnClass(reverbDetail)}
                    style={detailBtnStyle}
                  >
                    DETAIL
                  </button>
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
                      value={params.tone}
                      onChange={(e) => setParam("tone", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">TONE</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{toneLabel}</span>
                  <button
                    onClick={() => setToneDetail(!toneDetail)}
                    className={detailBtnClass(toneDetail)}
                    style={detailBtnStyle}
                  >
                    DETAIL
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Reverb Detail Panel */}
          {reverbDetail && (
            <div className="zone-inset boot-stagger">
              <div className="label" style={{ fontSize: "12px", marginBottom: "12px", marginTop: 0 }}>REVERB DETAIL</div>
              <div className="grid grid-cols-3 gap-6" style={{ justifyItems: "center" }}>
                {/* Wet/Dry */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={params.reverbWetOverride ?? expanded.reverbWet}
                      onChange={(e) => setParam("reverbWetOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">WET/DRY</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{Math.round((params.reverbWetOverride ?? expanded.reverbWet) * 100)}%</span>
                </div>

                {/* Duration */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="0.5"
                      max="8"
                      step="0.1"
                      value={params.reverbDurationOverride ?? expanded.reverbDuration}
                      onChange={(e) => setParam("reverbDurationOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">SIZE</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.reverbDurationOverride ?? expanded.reverbDuration).toFixed(1)}S</span>
                </div>

                {/* Decay */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="0.5"
                      max="6"
                      step="0.1"
                      value={params.reverbDecayOverride ?? expanded.reverbDecay}
                      onChange={(e) => setParam("reverbDecayOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">DECAY</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.reverbDecayOverride ?? expanded.reverbDecay).toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Tone Detail Panel — Multiband EQ */}
          {toneDetail && (
            <div className="zone-inset boot-stagger">
              <div className="label" style={{ fontSize: "12px", marginBottom: "12px", marginTop: 0 }}>PARAMETRIC EQ</div>
              <div className="grid grid-cols-5 gap-4" style={{ justifyItems: "center" }}>
                {/* Low Shelf */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={params.eqLowOverride ?? expanded.eqLow}
                      onChange={(e) => setParam("eqLowOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">LOW</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqLowOverride ?? expanded.eqLow).toFixed(1)}DB</span>
                </div>

                {/* Mid */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={params.eqMidOverride ?? expanded.eqMid}
                      onChange={(e) => setParam("eqMidOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">MID</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqMidOverride ?? expanded.eqMid).toFixed(1)}DB</span>
                </div>

                {/* High Shelf */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={params.eqHighOverride ?? expanded.eqHigh}
                      onChange={(e) => setParam("eqHighOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">HIGH</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqHighOverride ?? expanded.eqHigh).toFixed(1)}DB</span>
                </div>

                {/* Bump Freq */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="100"
                      max="10000"
                      step="50"
                      value={params.eqBumpFreqOverride ?? expanded.eqBumpFreq}
                      onChange={(e) => setParam("eqBumpFreqOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">FREQ</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{Math.round(params.eqBumpFreqOverride ?? expanded.eqBumpFreq)}HZ</span>
                </div>

                {/* Bump Gain */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range"
                      min="0"
                      max="15"
                      step="0.5"
                      value={params.eqBumpGainOverride ?? expanded.eqBumpGain}
                      onChange={(e) => setParam("eqBumpGainOverride", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label">PEAK</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqBumpGainOverride ?? expanded.eqBumpGain).toFixed(1)}DB</span>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {sourceBuffer && (
            <div className="zone-inset boot-stagger boot-delay-4">
              <ProgressBar />
            </div>
          )}
        </div>

        <Playlist />
        <Toast />
      </div>
    </main>
  );
}
