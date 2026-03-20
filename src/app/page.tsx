"use client";

import { useState } from "react";
import { expandParams } from "@yuribeats/audio-utils";
import WaveformDisplay from "../../components/WaveformDisplay";
import Transport from "../../components/Transport";
import Playlist from "../../components/Playlist";
import Toast from "../../components/Toast";
import ExportVideoModal from "../../components/ExportVideoModal";
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
  width: "36px",
  top: 0,
  left: "50%",
  transform: "translateX(-50%)",
};

const detailBtnClass = (active: boolean) =>
  `text-[8px] uppercase tracking-[0.15em] px-2 py-0.5 border ${
    active ? "border-[#333] bg-[rgba(255,115,0,0.15)]" : "border-[#777]"
  }`;

const detailBtnStyle: React.CSSProperties = { fontFamily: "var(--font-tech)", color: "var(--text-dark)", background: "transparent" };

export default function Home() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isPlaying = useStore((s) => s.isPlaying);
  const sourceFilename = useStore((s) => s.sourceFilename);
  const startedAt = useStore((s) => s.startedAt);
  const pauseOffset = useStore((s) => s.pauseOffset);
  const seek = useStore((s) => s.seek);
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const [stepMode, setStepMode] = useState(true);
  const [reverbDetail, setReverbDetail] = useState(false);
  const [toneDetail, setToneDetail] = useState(false);
  const [satDetail, setSatDetail] = useState(false);
  const [showVideoExport, setShowVideoExport] = useState(false);

  const rate = 1.0 + params.speed;
  const pitchSemitones = params.pitch ?? 0;
  const linked = params.pitchSpeedLinked ?? true;
  const speedSemitones = 12 * Math.log2(rate);
  const displaySemitones = linked ? speedSemitones : pitchSemitones;
  const reverbPct = Math.round(params.reverb * 100);
  const satPct = Math.round((params.saturation ?? 0) * 100);
  const toneLabel = params.tone === 0 ? "FLAT" : params.tone < 0 ? "DARK" : "BRIGHT";

  const expanded = expandParams(params);

  const handleSpeed = (v: number) => {
    if (linked) {
      if (stepMode) {
        const snapped = snapToSemitone(v);
        setParam("speed", snapped);
        setParam("pitch", 12 * Math.log2(1.0 + snapped));
      } else {
        setParam("speed", v);
        setParam("pitch", 12 * Math.log2(1.0 + v));
      }
    } else {
      setParam("speed", v);
    }
  };

  const handlePitch = (v: number) => {
    if (stepMode) v = Math.round(v);
    if (linked) {
      const newRate = Math.pow(2, v / 12);
      setParam("pitch", v);
      setParam("speed", newRate - 1.0);
    } else {
      setParam("pitch", v);
    }
  };

  const toggleLink = () => {
    setParam("pitchSpeedLinked", !linked);
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

          {/* CRT status + Waveform */}
          <div className="display-bezel flex flex-col gap-2 p-3 boot-stagger boot-delay-2">
            <div className="flex items-center justify-between">
              <div
                className="text-[10px] truncate crt-text"
                style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)", fontSize: "13px" }}
              >
                {sourceFilename ? sourceFilename.toUpperCase() : "NO TRACK"}
                {isPlaying && " — PLAYING"}
              </div>
              {sourceBuffer && (
                <div className="flex gap-3 text-[10px]" style={{ color: "var(--crt-dim)", fontFamily: "var(--font-crt)", fontSize: "12px" }}>
                  <span style={{ color: "var(--crt-bright)" }}>PITCH: {displaySemitones >= 0 ? "+" : ""}{displaySemitones.toFixed(1)}ST</span>
                </div>
              )}
            </div>
          </div>

          {/* Waveform */}
          <WaveformDisplay
            audioBuffer={sourceBuffer}
            isPlaying={isPlaying}
            pauseOffset={pauseOffset}
            startedAt={startedAt}
            playbackRate={rate}
            regionStart={0}
            regionEnd={0}
            onRegionChange={() => {}}
            onSeek={(pos) => seek(pos)}
            onScrub={() => {}}
          />

          {/* Transport + Effects side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 boot-stagger boot-delay-3">
            {/* Transport */}
            <div className="zone-inset">
              <Transport onExportVideo={() => setShowVideoExport(true)} />
              <div className="label" style={{ fontSize: "14px", color: "var(--text-dark)" }}>TRANSPORT</div>
            </div>

            {/* Effects */}
            <div className="zone-engraved relative">
              <div className="grid grid-cols-3 gap-2" style={{ justifyItems: "center" }}>
                {/* Speed */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative h-[100px] w-[36px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range" min="-0.5" max="0.5" step={stepMode && linked ? 0.001 : 0.01}
                      value={params.speed}
                      onChange={(e) => handleSpeed(parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label" style={{ fontSize: "9px", marginTop: "4px" }}>SPEED</div>
                  <span className="text-[9px]" style={{ color: "var(--text-dark)" }}>{rate.toFixed(2)}X</span>
                  <button onClick={toggleLink} className={detailBtnClass(linked)} style={detailBtnStyle}>LINK</button>
                </div>

                {/* Pitch */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative h-[100px] w-[36px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range" min="-12" max="12" step={stepMode ? 1 : 0.1}
                      value={linked ? speedSemitones : pitchSemitones}
                      onChange={(e) => handlePitch(parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label" style={{ fontSize: "9px", marginTop: "4px" }}>PITCH</div>
                  <span className="text-[9px]" style={{ color: "var(--text-dark)" }}>{displaySemitones >= 0 ? "+" : ""}{displaySemitones.toFixed(1)}ST</span>
                  <button onClick={() => setStepMode(!stepMode)} className={detailBtnClass(stepMode)} style={detailBtnStyle}>STEP</button>
                </div>

                {/* Reverb */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative h-[100px] w-[36px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range" min="0" max="1" step="0.01"
                      value={params.reverb}
                      onChange={(e) => setParam("reverb", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label" style={{ fontSize: "9px", marginTop: "4px" }}>REVERB</div>
                  <span className="text-[9px]" style={{ color: "var(--text-dark)" }}>{reverbPct}%</span>
                  <button onClick={() => setReverbDetail(!reverbDetail)} className={detailBtnClass(reverbDetail)} style={detailBtnStyle}>DETAIL</button>
                </div>
              </div>

              {/* Second row */}
              <div className="grid grid-cols-2 gap-2 mt-3" style={{ justifyItems: "center" }}>
                {/* Tone */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative h-[100px] w-[36px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range" min="-1" max="1" step="0.01"
                      value={params.tone}
                      onChange={(e) => setParam("tone", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label" style={{ fontSize: "9px", marginTop: "4px" }}>TONE</div>
                  <span className="text-[9px]" style={{ color: "var(--text-dark)" }}>{toneLabel}</span>
                  <button onClick={() => setToneDetail(!toneDetail)} className={detailBtnClass(toneDetail)} style={detailBtnStyle}>DETAIL</button>
                </div>

                {/* Saturation */}
                <div className="flex flex-col items-center gap-1">
                  <div className="relative h-[100px] w-[36px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input
                      type="range" min="0" max="1" step="0.01"
                      value={params.saturation ?? 0}
                      onChange={(e) => setParam("saturation", parseFloat(e.target.value))}
                      className="absolute h-full"
                      style={faderStyle}
                    />
                  </div>
                  <div className="label" style={{ fontSize: "9px", marginTop: "4px" }}>SATURATE</div>
                  <span className="text-[9px]" style={{ color: "var(--text-dark)" }}>{satPct}%</span>
                  <button onClick={() => setSatDetail(!satDetail)} className={detailBtnClass(satDetail)} style={detailBtnStyle}>DETAIL</button>
                </div>
              </div>
            </div>
          </div>

          {/* Reverb Detail Panel */}
          {reverbDetail && (
            <div className="zone-inset boot-stagger">
              <div className="label" style={{ fontSize: "12px", marginBottom: "12px", marginTop: 0 }}>REVERB DETAIL</div>
              <div className="grid grid-cols-3 gap-6" style={{ justifyItems: "center" }}>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="0" max="1" step="0.01" value={params.reverbWetOverride ?? expanded.reverbWet} onChange={(e) => setParam("reverbWetOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">WET/DRY</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{Math.round((params.reverbWetOverride ?? expanded.reverbWet) * 100)}%</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="0.5" max="8" step="0.1" value={params.reverbDurationOverride ?? expanded.reverbDuration} onChange={(e) => setParam("reverbDurationOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">SIZE</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.reverbDurationOverride ?? expanded.reverbDuration).toFixed(1)}S</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="0.5" max="6" step="0.1" value={params.reverbDecayOverride ?? expanded.reverbDecay} onChange={(e) => setParam("reverbDecayOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">DECAY</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.reverbDecayOverride ?? expanded.reverbDecay).toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Tone Detail Panel */}
          {toneDetail && (
            <div className="zone-inset boot-stagger">
              <div className="label" style={{ fontSize: "12px", marginBottom: "12px", marginTop: 0 }}>PARAMETRIC EQ</div>
              <div className="grid grid-cols-5 gap-4" style={{ justifyItems: "center" }}>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="-20" max="20" step="0.5" value={params.eqLowOverride ?? expanded.eqLow} onChange={(e) => setParam("eqLowOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">LOW</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqLowOverride ?? expanded.eqLow).toFixed(1)}DB</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="-20" max="20" step="0.5" value={params.eqMidOverride ?? expanded.eqMid} onChange={(e) => setParam("eqMidOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">MID</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqMidOverride ?? expanded.eqMid).toFixed(1)}DB</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="-20" max="20" step="0.5" value={params.eqHighOverride ?? expanded.eqHigh} onChange={(e) => setParam("eqHighOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">HIGH</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqHighOverride ?? expanded.eqHigh).toFixed(1)}DB</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="100" max="10000" step="50" value={params.eqBumpFreqOverride ?? expanded.eqBumpFreq} onChange={(e) => setParam("eqBumpFreqOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">FREQ</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{Math.round(params.eqBumpFreqOverride ?? expanded.eqBumpFreq)}HZ</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="0" max="15" step="0.5" value={params.eqBumpGainOverride ?? expanded.eqBumpGain} onChange={(e) => setParam("eqBumpGainOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">PEAK</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.eqBumpGainOverride ?? expanded.eqBumpGain).toFixed(1)}DB</span>
                </div>
              </div>
            </div>
          )}

          {/* Saturation Detail Panel */}
          {satDetail && (
            <div className="zone-inset boot-stagger">
              <div className="label" style={{ fontSize: "12px", marginBottom: "12px", marginTop: 0 }}>SATURATION DETAIL</div>
              <div className="grid grid-cols-3 gap-6" style={{ justifyItems: "center" }}>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="1" max="50" step="0.5" value={params.satDriveOverride ?? expanded.satDrive} onChange={(e) => setParam("satDriveOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">DRIVE</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{(params.satDriveOverride ?? expanded.satDrive).toFixed(1)}</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="0" max="1" step="0.01" value={params.satMixOverride ?? expanded.satMix} onChange={(e) => setParam("satMixOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">MIX</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{Math.round((params.satMixOverride ?? expanded.satMix) * 100)}%</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="relative h-[100px] w-[40px] flex justify-center">
                    <div className="slider-track h-full" />
                    <input type="range" min="1000" max="20000" step="100" value={params.satToneOverride ?? expanded.satTone} onChange={(e) => setParam("satToneOverride", parseFloat(e.target.value))} className="absolute h-full" style={faderStyle} />
                  </div>
                  <div className="label">TONE</div>
                  <span className="text-[10px]" style={{ color: "var(--text-dark)" }}>{Math.round((params.satToneOverride ?? expanded.satTone) / 1000)}KHZ</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <Playlist />
        <Toast />
      </div>

      {showVideoExport && (
        <ExportVideoModal onClose={() => setShowVideoExport(false)} />
      )}
    </main>
  );
}
