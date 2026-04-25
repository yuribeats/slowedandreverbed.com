import { create } from "zustand";
// No persist middleware — every session starts with default controls.
import {
  SimpleParams,
  SIMPLE_DEFAULTS,
  expandParams,
  renderOffline,
  encodeWAV,
  encodeMP3,
} from "@yuribeats/audio-utils";
import { BatchStyle, BATCH_PRESETS } from "./batch-presets";
import { decodeFile, decodeArrayBuffer } from "./file-decoder";
import { getAudioContext, resumeAudioContext, ensurePitchWorklet, isPitchWorkletReady } from "./audio-context";

/* ─── Saturation curve ─── */
function makeSaturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 512;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  // Normalize so the output ceiling stays at 1.0 regardless of drive
  const norm = drive > 0 ? 1 / Math.tanh(drive) : 1;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive) * norm;
  }
  return curve;
}

/* ─── Impulse response ─── */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateIR(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  const seedBase = Math.round(duration * 1000) * 7919 + Math.round(decay * 1000) * 104729 + ctx.sampleRate;
  // Independent seeds per channel for stereo width
  const seeds = [seedBase, seedBase ^ 0x5A3C9F1B];
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    const rand = seededRandom(seeds[c]);
    let prev = 0;
    for (let i = 0; i < length; i++) {
      // Exponential decay — plate-style tight tail
      const env = Math.exp(-decay * 4 * i / length);
      const noise = rand() * 2 - 1;
      // First-order highpass differentiation: brightens the reverb (plate character)
      const sample = noise - prev * 0.82;
      prev = noise;
      data[i] = sample * env;
    }
  }
  return ir;
}

/* ─── Automation interpolation ─── */
function getAutomationValue(points: AutomationPoint[], time: number): number {
  if (points.length === 0) return 1;
  // Before first point: interpolate from 1.0 to first point
  if (time <= points[0].time) {
    // At or before the first point, ramp from unity
    return 1;
  }
  // After last point: return 1.0 (back to unity)
  if (time >= points[points.length - 1].time) return 1;
  for (let i = 0; i < points.length - 1; i++) {
    if (time >= points[i].time && time <= points[i + 1].time) {
      const t = (time - points[i].time) / (points[i + 1].time - points[i].time);
      return points[i].value + t * (points[i + 1].value - points[i].value);
    }
  }
  return 1;
}

/* ─── Crossfader math: center = both full, edges = one cuts ─── */
function getCrossfaderGains(cf: number): { a: number; b: number } {
  return {
    a: cf <= 0 ? 1 : 1 - cf,
    b: cf >= 0 ? 1 : 1 + cf,
  };
}

/* ─── Types ─── */
interface DeckNodes {
  source: AudioBufferSourceNode;
  pitchShifter: AudioWorkletNode | null;
  lowShelf: BiquadFilterNode;
  peaking: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  bump: BiquadFilterNode;
  waveshaper: WaveShaperNode;
  satFilter: BiquadFilterNode;
  convolver: ConvolverNode;
  dryGain: GainNode;
  wetGain: GainNode;
  analyser: AnalyserNode;
  fadeGain: GainNode;
  deckGain: GainNode;
  wallEndTime?: number;
}

function disconnectDeckNodes(nodes: DeckNodes) {
  try { nodes.source.onended = null; } catch { /* ok */ }
  try { nodes.source.stop(); } catch { /* ok */ }
  for (const n of Object.values(nodes)) {
    if (n && typeof (n as AudioNode).disconnect === "function") {
      try { (n as AudioNode).disconnect(); } catch { /* ok */ }
    }
  }
}

type StemType = "vocals" | "drums" | "bass" | "other" | "instrumental";

function mixStemBuffers(stems: StemType[], stemBuffers: Partial<Record<StemType, AudioBuffer>>): AudioBuffer | null {
  const bufs = stems.map((s) => stemBuffers[s]).filter((b): b is AudioBuffer => !!b);
  if (bufs.length === 0) return null;
  if (bufs.length === 1) return bufs[0];
  const ctx = getAudioContext();
  const maxLen = Math.max(...bufs.map((b) => b.length));
  const channels = bufs[0].numberOfChannels;
  const mixed = ctx.createBuffer(channels, maxLen, bufs[0].sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const out = mixed.getChannelData(ch);
    for (const buf of bufs) {
      if (ch >= buf.numberOfChannels) continue;
      const src = buf.getChannelData(ch);
      for (let i = 0; i < src.length; i++) out[i] += src[i];
    }
  }
  return mixed;
}

interface AutomationPoint {
  time: number;   // seconds into source buffer
  value: number;  // 0–1 volume
}

interface DeckState {
  sourceBuffer: AudioBuffer | null;
  sourceFilename: string | null;
  sourceFile: File | null;
  sourceUrl: string | null;
  sourceCdnUrl: string | null;
  artist: string;
  title: string;
  baseKey: number | null;
  baseMode: "major" | "minor" | null;
  params: SimpleParams;
  isLoading: boolean;
  isPlaying: boolean;
  error: string | null;
  nodes: DeckNodes | null;
  startedAt: number;
  pauseOffset: number;
  volume: number;
  stemError: string | null;
  calculatedBPM: number | null;
  regionStart: number;  // seconds into source buffer
  regionEnd: number;    // seconds into source buffer (0 = full track)
  activeStem: StemType | null;  // derived: first of activeStems, kept for compat
  activeStems: StemType[];       // multiple stems can be selected
  mixedStemBuffer: AudioBuffer | null; // mixed buffer of selected stems
  stemBuffers: Partial<Record<StemType, AudioBuffer>> | null;
  stemUrls: Partial<Record<string, string>> | null;
  isStemLoading: boolean;
  automationEnabled: boolean;
  automationPoints: AutomationPoint[];
  firstDownbeatMs: number | null;
  downbeatGrid: number[] | null;  // detected downbeat positions in seconds
  downbeatDetecting: boolean;
  downbeatError: string | null;
  manualUpload: boolean;           // true for local file / YouTube URL / session restore, false for match-list picks
}

type DeckId = "A" | "B";

const defaultDeck = (): DeckState => ({
  sourceBuffer: null,
  sourceFilename: null,
  sourceFile: null,
  sourceUrl: null,
  sourceCdnUrl: null,
  artist: "",
  title: "",
  baseKey: null,
  baseMode: null,
  params: { ...SIMPLE_DEFAULTS, speed: 0, reverb: 0, tone: 0, saturation: 0, pitch: 0, pitchSpeedLinked: false },
  isLoading: false,
  isPlaying: false,
  error: null,
  nodes: null,
  startedAt: 0,
  pauseOffset: 0,
  volume: 0.6,
  stemError: null,
  calculatedBPM: null,
  regionStart: 0,
  regionEnd: 0,
  activeStem: null,
  activeStems: [],
  mixedStemBuffer: null,
  stemBuffers: null,
  stemUrls: null,
  isStemLoading: false,
  automationEnabled: false,
  automationPoints: [],
  firstDownbeatMs: null,
  downbeatGrid: null,
  downbeatDetecting: false,
  downbeatError: null,
  manualUpload: false,
});

export interface MasterBusParams {
  eqLow: number;       // -20 to +20 dB
  eqMid: number;       // -20 to +20 dB
  eqHigh: number;      // -20 to +20 dB
  compAmount: number;   // 0–1 single knob
  // Compressor detail overrides
  compThreshold?: number;  // -60 to 0 dB
  compRatio?: number;      // 1 to 20
  compAttack?: number;     // 0.001 to 0.5 s
  compRelease?: number;    // 0.01 to 1 s
  compKnee?: number;       // 0 to 40 dB
  compMakeup?: number;     // 0 to 24 dB
  // Limiter
  limiterAmount: number;   // 0–1 single knob
  // Limiter detail overrides
  limiterThreshold?: number;  // -20 to 0 dB
  limiterRelease?: number;    // 0.001 to 0.3 s
  limiterKnee?: number;       // 0 to 6 dB
}

function expandCompressor(m: MasterBusParams) {
  const amt = m.compAmount;
  return {
    threshold: m.compThreshold ?? (amt * -40),
    ratio: m.compRatio ?? (1 + amt * 11),
    attack: m.compAttack ?? 0.01,
    release: m.compRelease ?? 0.15,
    knee: m.compKnee ?? 10,
    makeup: m.compMakeup ?? (amt * 12),
  };
}

function expandLimiter(m: MasterBusParams) {
  const amt = m.limiterAmount;
  return {
    threshold: m.limiterThreshold ?? (-0.5 - amt * 8), // -0.5 to -8.5 dB (gentler at low settings)
    ratio: 20,       // brick wall
    attack: 0.001,   // 1ms — fast attack
    release: m.limiterRelease ?? (0.08 + amt * 0.12), // slower release = more transparent, less pump
    knee: m.limiterKnee ?? (4 - amt * 4),             // soft knee at low settings, hard at high
  };
}

const defaultMasterBus: MasterBusParams = {
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compAmount: 0.15,
  limiterAmount: 0.1,
};

interface RemixStore {
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number;
  masterBus: MasterBusParams;

  isExporting: boolean;
  recordArmed: boolean;
  isRecording: boolean;
  isConvertingWav: boolean;
  isConvertingMp3: boolean;
  pendingRecording: Blob | null;
  pendingVideoExport: Blob | null;
  clearPendingRecording: () => void;
  clearPendingExport: () => void;
  downloadRecordingWAV: () => Promise<void>;
  downloadRecordingMP3: () => Promise<void>;
  downloadDeckMP3: (deck: DeckId) => Promise<void>;
  exportRecordingMP4: () => void;


  loadFile: (deck: DeckId, file: File) => Promise<void>;
  loadFromYouTube: (deck: DeckId, url: string) => Promise<void>;
  loadFromAudioUrl: (deck: DeckId, url: string, filename: string) => Promise<void>;
  setDeckMeta: (deck: DeckId, meta: { artist?: string; title?: string; baseKey?: number | null; baseMode?: "major" | "minor" | null }) => void;
  restoreSession: (sessionId: string) => Promise<void>;
  restoreSessionFromData: (session: Record<string, unknown>) => Promise<void>;
  lookupEverysong: (deck: DeckId, artist: string, title: string) => Promise<void>;
  loadDeck: (deck: DeckId, artist: string, title: string, opts?: { autoStem?: boolean; pitchShift?: number }) => Promise<void>;
  detectDownbeat: (deck: DeckId) => Promise<void>;
  snapToDownbeat: (deck: DeckId) => Promise<void>;
  autoMatchDeckBSpeed: () => void;
  play: (deck: DeckId, forceLoop?: boolean) => Promise<void>;
  stop: (deck: DeckId) => void;
  pause: (deck: DeckId) => void;
  setParam: (deck: DeckId, key: keyof SimpleParams, value: number | boolean) => void;
  setVolume: (deck: DeckId, volume: number) => void;
  setCrossfader: (value: number) => void;
  eject: (deck: DeckId) => void;
  setMasterBus: <K extends keyof MasterBusParams>(key: K, value: MasterBusParams[K]) => void;
  setStem: (deck: DeckId, stem: StemType | null) => void;
  toggleStem: (deck: DeckId, stem: StemType) => void;
  separateStems: (deck: DeckId) => Promise<void>;
  setRegion: (deck: DeckId, start: number, end: number) => void;
  seek: (deck: DeckId, position: number) => Promise<void>;
  scrub: (deck: DeckId, position: number) => void;
  syncPlay: () => Promise<void>;
  applyStylePreset: (style: BatchStyle) => void;
  renderToBlob: () => Promise<Blob | null>;
  download: () => Promise<void>;
  downloadMixMP3: () => Promise<void>;
  exportMP4: () => Promise<void>;
  armRecord: () => void;
  stopRecording: () => void;
  setBPM: (deck: DeckId, bpm: number) => void;
  toggleAutomation: (deck: DeckId) => void;
  addAutomationPoint: (deck: DeckId, time: number, value: number) => void;
  removeAutomationPoint: (deck: DeckId, index: number) => void;
  moveAutomationPoint: (deck: DeckId, index: number, time: number, value: number) => void;
}

/* ─── Shared output bus: merger → EQ → compressor → makeup → limiter → destination ─── */
let sharedMerger: GainNode | null = null;
let masterLow: BiquadFilterNode | null = null;
let masterMid: BiquadFilterNode | null = null;
let masterHigh: BiquadFilterNode | null = null;
let masterComp: DynamicsCompressorNode | null = null;
let masterMakeup: GainNode | null = null;
let masterLimiter: DynamicsCompressorNode | null = null;
let masterStreamDest: MediaStreamAudioDestinationNode | null = null;
let masterAnalyser: AnalyserNode | null = null;

/* ─── Live recording state ─── */
let liveRecorder: MediaRecorder | null = null;
const recordedChunks: Blob[] = [];

function getSharedMerger(): GainNode {
  const ctx = getAudioContext();
  if (!sharedMerger || sharedMerger.context !== ctx) {
    sharedMerger = ctx.createGain();

    masterLow = ctx.createBiquadFilter();
    masterLow.type = "lowshelf";
    masterLow.frequency.value = 200;
    masterLow.gain.value = 0;

    masterMid = ctx.createBiquadFilter();
    masterMid.type = "peaking";
    masterMid.frequency.value = 2500;
    masterMid.Q.value = 1.0;
    masterMid.gain.value = 0;

    masterHigh = ctx.createBiquadFilter();
    masterHigh.type = "highshelf";
    masterHigh.frequency.value = 8000;
    masterHigh.gain.value = 0;

    masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = 0;
    masterComp.ratio.value = 1;
    masterComp.attack.value = 0.01;
    masterComp.release.value = 0.15;
    masterComp.knee.value = 10;

    masterMakeup = ctx.createGain();
    masterMakeup.gain.value = 1;

    masterLimiter = ctx.createDynamicsCompressor();
    masterLimiter.threshold.value = 0;
    masterLimiter.ratio.value = 1;
    masterLimiter.attack.value = 0.001;
    masterLimiter.release.value = 0.01;
    masterLimiter.knee.value = 0;

    sharedMerger.connect(masterLow);
    masterLow.connect(masterMid);
    masterMid.connect(masterHigh);
    masterHigh.connect(masterComp);
    masterComp.connect(masterMakeup);
    masterMakeup.connect(masterLimiter);
    masterLimiter.connect(ctx.destination);

    masterStreamDest = ctx.createMediaStreamDestination();
    masterLimiter.connect(masterStreamDest);

    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.smoothingTimeConstant = 0.85;
    masterLimiter.connect(masterAnalyser);
  }
  return sharedMerger;
}

export function getMasterAnalyser(): AnalyserNode | null {
  return masterAnalyser;
}

/* ─── Extract a region from an AudioBuffer as raw channel data ─── */
function extractRegion(buffer: AudioBuffer, start: number, end: number) {
  const sr = buffer.sampleRate;
  const s0 = Math.floor(start * sr);
  const s1 = Math.ceil(end * sr);
  const length = s1 - s0;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channelData.push(buffer.getChannelData(c).slice(s0, s1));
  }
  return { channelData, sampleRate: sr, numberOfChannels: buffer.numberOfChannels, length };
}

/* ─── Build audio graph for a single deck ─── */
function buildDeckGraph(
  ctx: AudioContext,
  sourceBuffer: AudioBuffer,
  params: SimpleParams,
  offset: number,
  duration: number | undefined,
  volume: number,
  crossfaderGain: number,
  onEnded: () => void,
  loopRegion?: { loopStart: number; loopEnd: number },
  automationPoints?: AutomationPoint[],
): DeckNodes {
  const expanded = expandParams(params);

  const source = ctx.createBufferSource();
  source.buffer = sourceBuffer;
  source.playbackRate.value = expanded.rate;

  // EQ
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 200;
  lowShelf.gain.value = expanded.eqLow;

  const peaking = ctx.createBiquadFilter();
  peaking.type = "peaking";
  peaking.frequency.value = 2500;
  peaking.Q.value = 0.5;
  peaking.gain.value = expanded.eqMid;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 8000;
  highShelf.gain.value = expanded.eqHigh;

  const bump = ctx.createBiquadFilter();
  bump.type = "peaking";
  bump.frequency.value = expanded.eqBumpFreq;
  bump.Q.value = 0.7;
  bump.gain.value = expanded.eqBumpGain;

  // Saturation — series routing (no dry/wet split avoids phase comb filtering)
  const waveshaper = ctx.createWaveShaper();
  waveshaper.curve = makeSaturationCurve(expanded.satDrive);
  waveshaper.oversample = "4x";

  const satFilter = ctx.createBiquadFilter();
  satFilter.type = "lowpass";
  satFilter.frequency.value = expanded.satTone;
  satFilter.Q.value = 0.707;

  // Reverb
  const convolver = ctx.createConvolver();
  convolver.buffer = generateIR(ctx, expanded.reverbDuration, expanded.reverbDecay);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1.0; // always full dry — reverb is additive

  const wetGain = ctx.createGain();
  wetGain.gain.value = expanded.reverbWet;

  const reverbMerger = ctx.createGain();

  // Analyser (pre-fader)
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;

  // Deck output gain (volume × crossfader)
  const deckGain = ctx.createGain();
  deckGain.gain.value = volume * crossfaderGain;

  // Automation gain (separate node so volume fader still works independently)
  // Line starts and ends at 1.0 (unity), points dip/boost in between
  const autoGain = ctx.createGain();
  if (automationPoints && automationPoints.length > 0) {
    const rate = expanded.rate;
    const now = ctx.currentTime;
    // Start at unity (or interpolated value if resuming mid-automation)
    const autoVal = getAutomationValue(automationPoints, offset);
    autoGain.gain.setValueAtTime(autoVal, now);
    // Ramp to first point from unity if we're before it
    if (offset < automationPoints[0].time) {
      const when = now + (automationPoints[0].time - offset) / rate;
      autoGain.gain.linearRampToValueAtTime(automationPoints[0].value, when);
    }
    // Schedule ramps between points
    for (let i = 0; i < automationPoints.length; i++) {
      if (automationPoints[i].time <= offset) continue;
      const when = now + (automationPoints[i].time - offset) / rate;
      autoGain.gain.linearRampToValueAtTime(automationPoints[i].value, when);
    }
    // Return to unity after last point
    const lastPt = automationPoints[automationPoints.length - 1];
    if (lastPt.time > offset) {
      const returnTime = now + (lastPt.time - offset) / rate;
      autoGain.gain.setValueAtTime(lastPt.value, returnTime);
      autoGain.gain.linearRampToValueAtTime(1.0, returnTime + 0.01);
    }
  }

  // Pitch shifter worklet — always present when worklet is ready
  let pitchShifter: AudioWorkletNode | null = null;
  if (isPitchWorkletReady()) {
    pitchShifter = new AudioWorkletNode(ctx, "rubberband-processor");
    const netShift = expanded.pitchFactor / expanded.rate;
    pitchShifter.port.postMessage(JSON.stringify(["pitch", netShift]));
  }

  // Connect: source → [pitchShifter?] → EQ → sat → reverb → analyser → deckGain → shared output
  if (pitchShifter) {
    source.connect(pitchShifter);
    pitchShifter.connect(lowShelf);
  } else {
    source.connect(lowShelf);
  }
  lowShelf.connect(peaking);
  peaking.connect(highShelf);
  highShelf.connect(bump);

  bump.connect(waveshaper);
  waveshaper.connect(satFilter);

  satFilter.connect(dryGain);
  satFilter.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(reverbMerger);
  wetGain.connect(reverbMerger);

  // Fade-out gain node (scheduled to ramp to 0 over last 5 seconds of non-looping playback)
  const fadeGain = ctx.createGain();
  fadeGain.gain.value = 1.0;

  reverbMerger.connect(analyser);
  analyser.connect(autoGain);
  autoGain.connect(fadeGain);
  fadeGain.connect(deckGain);
  deckGain.connect(getSharedMerger());

  const safeOffset = Math.max(0, offset);
  source.onended = onEnded;
  if (loopRegion) {
    source.loop = true;
    source.loopStart = loopRegion.loopStart;
    source.loopEnd = loopRegion.loopEnd;
    source.start(0, safeOffset);
  } else if (duration && duration > 0) {
    source.start(0, safeOffset, duration);
    // Schedule 5-second fade out (wall-clock time = source duration / playback rate)
    const FADE_SECS = 5;
    const wallDuration = duration / expanded.rate;
    const now = ctx.currentTime;
    const fadeStart = now + Math.max(0, wallDuration - FADE_SECS);
    const fadeEnd = now + wallDuration;
    fadeGain.gain.setValueAtTime(1.0, fadeStart);
    fadeGain.gain.linearRampToValueAtTime(0, fadeEnd);
  } else {
    source.start(0, safeOffset);
  }

  const wallEndTime = duration && duration > 0 && !loopRegion
    ? ctx.currentTime + duration / expanded.rate
    : undefined;

  return {
    source, pitchShifter, lowShelf, peaking, highShelf, bump,
    waveshaper, satFilter,
    convolver, dryGain, wetGain, analyser, fadeGain, deckGain,
    wallEndTime,
  };
}

/* ─── Cross-deck fade: when one deck ends, fade the other so the mix goes silent together ─── */
function scheduleCrossDeckFade(ctx: AudioContext, a: DeckNodes | null, b: DeckNodes | null) {
  if (!a || !b || a.wallEndTime === undefined || b.wallEndTime === undefined) return;
  const FADE_SECS = 5;
  const earlier = a.wallEndTime <= b.wallEndTime ? a : b;
  const later = earlier === a ? b : a;
  const earlierEnd = earlier.wallEndTime!;
  const fadeStart = Math.max(ctx.currentTime + 0.01, earlierEnd - FADE_SECS);
  later.fadeGain.gain.cancelScheduledValues(ctx.currentTime);
  later.fadeGain.gain.setValueAtTime(later.fadeGain.gain.value, ctx.currentTime);
  later.fadeGain.gain.setValueAtTime(1.0, fadeStart);
  later.fadeGain.gain.linearRampToValueAtTime(0, earlierEnd);
}

/* ─── Helper to get/set deck state ─── */
function getDeck(state: RemixStore, id: DeckId): DeckState {
  return id === "A" ? state.deckA : state.deckB;
}

function deckKey(id: DeckId): "deckA" | "deckB" {
  return id === "A" ? "deckA" : "deckB";
}

/* ─── Compact 16-bit PCM WAV for video export (much smaller than 32-bit float) ─── */
function encodeWAV16(rendered: AudioBuffer, targetSR: number): Blob {
  const nch = rendered.numberOfChannels;
  const srcSR = rendered.sampleRate;
  const ratio = srcSR / targetSR;
  const numSamples = Math.floor(rendered.length / ratio);
  const dataSize = numSamples * nch * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); w(8, "WAVE");
  w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, nch, true); view.setUint32(24, targetSR, true);
  view.setUint32(28, targetSR * nch * 2, true); view.setUint16(32, nch * 2, true);
  view.setUint16(34, 16, true); w(36, "data"); view.setUint32(40, dataSize, true);
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < nch; c++) channels.push(rendered.getChannelData(c));
  for (let i = 0; i < numSamples; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    for (let c = 0; c < nch; c++) {
      const ch = channels[c];
      const s = idx + 1 < ch.length ? ch[idx] * (1 - frac) + ch[idx + 1] * frac : ch[idx];
      view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true);
      offset += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

/* ─── Offline render: mix both decks → master bus → normalized WAV ─── */
async function renderMixToWAV(get: () => RemixStore, forVideo = false): Promise<Blob | null> {
  const { deckA, deckB, crossfader, masterBus } = get();
  const hasA = !!deckA.sourceBuffer;
  const hasB = !!deckB.sourceBuffer;
  if (!hasA && !hasB) return null;

  const cfGains = getCrossfaderGains(crossfader);
  interface RenderResult {
    data: Float32Array[];
    gain: number;
    sr: number;
    nch: number;
    autoPoints: AutomationPoint[];
    rStart: number;
    rEnd: number;
    rate: number;
  }
  const renders: RenderResult[] = [];

  for (const [deck, cfGain] of [
    [deckA, cfGains.a],
    [deckB, cfGains.b],
  ] as [DeckState, number][]) {
    if (!deck.sourceBuffer) continue;

    const buf = deck.mixedStemBuffer || (deck.activeStem && deck.stemBuffers?.[deck.activeStem]) || deck.sourceBuffer;
    const rStart = deck.regionStart;
    const rEnd = deck.regionEnd > 0 ? deck.regionEnd : buf.duration;
    const region = extractRegion(buf, rStart, rEnd);
    const expanded = expandParams(deck.params);

    const result = await renderOffline({
      ...region,
      params: expanded,
    });

    renders.push({
      data: result.channelData,
      gain: deck.volume * cfGain,
      sr: result.sampleRate,
      nch: result.numberOfChannels,
      autoPoints: deck.automationEnabled ? deck.automationPoints : [],
      rStart,
      rEnd,
      rate: expanded.rate,
    });
  }

  if (renders.length === 0) return null;

  // Per-deck gated RMS leveling. Plain RMS over the whole buffer is biased
  // low for vocal stems (lots of silent gaps between phrases) — that boosted
  // vocals louder than instrumentals. Instead, find each deck's peak, set a
  // gate at peak × 0.1 (-20 dB), compute RMS only over samples above the
  // gate. That captures "loudness when audible", which matches perception.
  if (renders.length === 2) {
    const TARGET_RMS = 0.18;
    const MAX_GAIN_BOOST = 6;
    for (const r of renders) {
      const ch = r.data[0];
      let peak = 0;
      for (let i = 0; i < ch.length; i += 100) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
      }
      const gate = peak * 0.1;
      let sumSq = 0;
      let n = 0;
      for (let i = 0; i < ch.length; i += 100) {
        const a = Math.abs(ch[i]);
        if (a >= gate) {
          sumSq += ch[i] * ch[i];
          n++;
        }
      }
      const rms = Math.sqrt(sumSq / Math.max(n, 1));
      if (rms > 1e-6) {
        r.gain *= Math.min(TARGET_RMS / rms, MAX_GAIN_BOOST);
      }
    }
    // After gated leveling, give the instrumental side (Deck A) +4 dB so the
    // foundation sits clearly present and the vocals don't drown it.
    // renders[0] is always Deck A here because the deck render loop iterates
    // [deckA, deckB] in order, and we only enter this block when both rendered.
    renders[0].gain *= Math.pow(10, 4 / 20);
  }

  const sr = renders[0].sr;
  const nch = Math.max(...renders.map((r) => r.nch));
  // Shorter deck dictates the mix length. The longer deck fades out over the
  // last FADE_SEC seconds before that point, so the mix ends together cleanly.
  const FADE_SEC = 4;
  const fadeSamples = Math.floor(FADE_SEC * sr);
  const minLen = Math.min(...renders.map((r) => r.data[0].length));
  const maxLen = minLen;

  const mixed: Float32Array[] = [];
  for (let c = 0; c < nch; c++) mixed.push(new Float32Array(maxLen));
  for (const r of renders) {
    const hasAuto = r.autoPoints.length > 0;
    const rLen = r.data[0].length;
    const isLonger = rLen > minLen;
    for (let c = 0; c < nch; c++) {
      const ch = c < r.data.length ? r.data[c] : r.data[0];
      for (let i = 0; i < maxLen; i++) {
        if (i >= rLen) break;
        let autoVal = 1;
        if (hasAuto) {
          const realTime = i / r.sr;
          const sourceTime = r.rStart + realTime * r.rate;
          autoVal = getAutomationValue(r.autoPoints, sourceTime);
        }
        // Linear fade-out on the longer deck during the last FADE_SEC seconds.
        let fadeMul = 1;
        if (isLonger) {
          const fadeStart = maxLen - fadeSamples;
          if (i >= fadeStart) fadeMul = Math.max(0, 1 - (i - fadeStart) / fadeSamples);
        }
        mixed[c][i] += ch[i] * r.gain * autoVal * fadeMul;
      }
    }
  }

  // Apply master bus (EQ → compressor → makeup → limiter) via OfflineAudioContext
  const offCtx = new OfflineAudioContext(nch, maxLen, sr);
  const mixBuf = offCtx.createBuffer(nch, maxLen, sr);
  for (let c = 0; c < nch; c++) mixBuf.getChannelData(c).set(mixed[c]);

  const src = offCtx.createBufferSource();
  src.buffer = mixBuf;

  const mLow = offCtx.createBiquadFilter();
  mLow.type = "lowshelf"; mLow.frequency.value = 200; mLow.gain.value = masterBus.eqLow;
  const mMid = offCtx.createBiquadFilter();
  mMid.type = "peaking"; mMid.frequency.value = 2500; mMid.Q.value = 1.0; mMid.gain.value = masterBus.eqMid;
  const mHigh = offCtx.createBiquadFilter();
  mHigh.type = "highshelf"; mHigh.frequency.value = 8000; mHigh.gain.value = masterBus.eqHigh;

  const comp = expandCompressor(masterBus);
  const mComp = offCtx.createDynamicsCompressor();
  mComp.threshold.value = comp.threshold;
  mComp.ratio.value = comp.ratio;
  mComp.attack.value = comp.attack;
  mComp.release.value = comp.release;
  mComp.knee.value = comp.knee;

  const mMakeup = offCtx.createGain();
  mMakeup.gain.value = Math.pow(10, comp.makeup / 20);

  const lim = expandLimiter(masterBus);
  const mLim = offCtx.createDynamicsCompressor();
  mLim.threshold.value = lim.threshold;
  mLim.ratio.value = lim.ratio;
  mLim.attack.value = lim.attack;
  mLim.release.value = lim.release;
  mLim.knee.value = lim.knee;

  src.connect(mLow);
  mLow.connect(mMid);
  mMid.connect(mHigh);
  mHigh.connect(mComp);
  mComp.connect(mMakeup);
  mMakeup.connect(mLim);
  mLim.connect(offCtx.destination);

  src.start(0);
  const rendered = await offCtx.startRendering();

  // Normalize peaks
  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const ch = rendered.getChannelData(c);
    for (let i = 0; i < ch.length; i++) {
      const abs = Math.abs(ch[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak > 1) {
    const scale = 0.99 / peak;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const ch = rendered.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] *= scale;
    }
  }

  // 5-second fade out at the end
  const fadeSamples = Math.min(rendered.sampleRate * 5, rendered.length);
  const fadeStart = rendered.length - fadeSamples;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const ch = rendered.getChannelData(c);
    for (let i = 0; i < fadeSamples; i++) {
      ch[fadeStart + i] *= 1 - i / fadeSamples;
    }
  }

  // For video export: 16-bit 22050Hz (~8x smaller than 32-bit 44100Hz)
  // ffmpeg re-encodes to AAC anyway so full quality isn't needed
  if (forVideo) return encodeWAV16(rendered, 22050);
  return encodeWAV(rendered);
}

/* ─── Generation counters to prevent stale onEnded callbacks ─── */
const deckGeneration: Record<string, number> = { A: 0, B: 0 };

/* ─── Store ─── */

/* ─── Persist whitelist ─── */
// Only the identity + tuning fields that let us re-fetch the track. AudioBuffers,
// Files, Blobs, MediaRecorder refs, playback flags, and anything else transient
// stays out of localStorage — the store is large and iOS Safari discards tabs
// regularly, so we only persist what's needed to cold-restart to the same state.
type PersistedDeck = Pick<
  DeckState,
  | "artist"
  | "title"
  | "sourceFilename"
  | "sourceUrl"
  | "sourceCdnUrl"
  | "baseKey"
  | "baseMode"
  | "calculatedBPM"
  | "params"
  | "regionStart"
  | "regionEnd"
  | "firstDownbeatMs"
  | "downbeatGrid"
  | "manualUpload"
>;
interface PersistedState {
  deckA: PersistedDeck;
  deckB: PersistedDeck;
  crossfader: number;
  masterBus: MasterBusParams;
}
function pickDeck(d: DeckState): PersistedDeck {
  return {
    artist: d.artist,
    title: d.title,
    sourceFilename: d.sourceFilename,
    sourceUrl: d.sourceUrl,
    sourceCdnUrl: d.sourceCdnUrl,
    baseKey: d.baseKey,
    baseMode: d.baseMode,
    calculatedBPM: d.calculatedBPM,
    params: d.params,
    regionStart: d.regionStart,
    regionEnd: d.regionEnd,
    firstDownbeatMs: d.firstDownbeatMs,
    downbeatGrid: d.downbeatGrid,
    manualUpload: d.manualUpload,
  };
}

export const useRemixStore = create<RemixStore>()((set, get) => ({
  deckA: defaultDeck(),
  deckB: defaultDeck(),
  crossfader: 0,
  masterBus: { ...defaultMasterBus },
  isExporting: false,
  recordArmed: false,
  isRecording: false,
  isConvertingWav: false,
  isConvertingMp3: false,
  pendingRecording: null,
  pendingVideoExport: null,
  clearPendingRecording: () => set({ pendingRecording: null }),
  clearPendingExport: () => set({ pendingVideoExport: null }),

  downloadRecordingWAV: async () => {
    const { pendingRecording } = get();
    if (!pendingRecording) return;
    set({ isConvertingWav: true });
    try {
      const arrayBuf = await pendingRecording.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      // Normalize if clipping
      let peak = 0;
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const abs = Math.abs(ch[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 1) {
        const scale = 0.99 / peak;
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const ch = decoded.getChannelData(c);
          for (let i = 0; i < ch.length; i++) ch[i] *= scale;
        }
      }
      const wavBlob = encodeWAV(decoded);
      const url = URL.createObjectURL(wavBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "automash-recording.wav";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("WAV conversion failed:", e);
    } finally {
      set({ isConvertingWav: false });
    }
  },

  exportRecordingMP4: () => {
    const { pendingRecording } = get();
    if (!pendingRecording) return;
    set({ pendingVideoExport: pendingRecording, pendingRecording: null });
  },

  downloadRecordingMP3: async () => {
    const { pendingRecording } = get();
    if (!pendingRecording) return;
    set({ isConvertingMp3: true });
    try {
      const arrayBuf = await pendingRecording.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      let peak = 0;
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const abs = Math.abs(ch[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 1) {
        const scale = 0.99 / peak;
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const ch = decoded.getChannelData(c);
          for (let i = 0; i < ch.length; i++) ch[i] *= scale;
        }
      }
      const mp3Blob = encodeMP3(decoded, 192);
      const url = URL.createObjectURL(mp3Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "AUTOMASH-MIX.mp3";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("MP3 conversion failed:", e);
    } finally {
      set({ isConvertingMp3: false });
    }
  },

  downloadDeckMP3: async (id) => {
    const dk = deckKey(id);
    const deck = get()[dk];
    if (!deck.sourceBuffer) return;
    set({ isConvertingMp3: true });
    try {
      const safeArtist = (deck.artist || "").replace(/[^\w\s-]/g, "").trim().toUpperCase();
      const safeTitle = (deck.title || deck.sourceFilename || `deck-${id.toLowerCase()}`).replace(/[^\w\s-]/g, "").trim().toUpperCase();
      const base = [safeArtist, safeTitle].filter(Boolean).join(" - ") || `DECK-${id}`;

      const sourceForRender = deck.mixedStemBuffer
        || (deck.activeStem && deck.stemBuffers?.[deck.activeStem])
        || deck.sourceBuffer;
      const rStart = deck.regionStart;
      const rEnd = deck.regionEnd > 0 ? deck.regionEnd : sourceForRender.duration;
      const region = extractRegion(sourceForRender, rStart, rEnd);
      const expanded = expandParams(deck.params);
      const result = await renderOffline({ ...region, params: expanded });

      const ctx = getAudioContext();
      const rendered = ctx.createBuffer(result.numberOfChannels, result.channelData[0].length, result.sampleRate);
      for (let c = 0; c < result.numberOfChannels; c++) {
        rendered.getChannelData(c).set(result.channelData[c]);
      }

      let peak = 0;
      for (let c = 0; c < rendered.numberOfChannels; c++) {
        const ch = rendered.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const abs = Math.abs(ch[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 1) {
        const scale = 0.99 / peak;
        for (let c = 0; c < rendered.numberOfChannels; c++) {
          const ch = rendered.getChannelData(c);
          for (let i = 0; i < ch.length; i++) ch[i] *= scale;
        }
      }

      const mp3Blob = encodeMP3(rendered, 192);
      const url = URL.createObjectURL(mp3Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${base}.mp3`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Deck MP3 conversion failed:", e);
    } finally {
      set({ isConvertingMp3: false });
    }
  },
  loadFile: async (id, file) => {
    const dk = deckKey(id);
    get().stop(id);
    set((s) => ({ [dk]: { ...s[dk], isLoading: true, pauseOffset: 0, calculatedBPM: null, activeStem: null, activeStems: [], mixedStemBuffer: null, stemBuffers: null, stemError: null, sourceFile: file, sourceUrl: null, manualUpload: true } }));
    try {
      const audioBuffer = await decodeFile(file);
      set((s) => ({
        [dk]: {
          ...s[dk],
          sourceBuffer: audioBuffer,
          sourceFilename: file.name.replace(/\.[^/.]+$/, ""),
          isLoading: false,
          regionStart: 0,
          regionEnd: 0,
        },
      }));
    } catch {
      set((s) => ({ [dk]: { ...s[dk], isLoading: false } }));
    }
  },

  loadFromYouTube: async (id, url) => {
    const dk = deckKey(id);
    get().stop(id);
    set((s) => ({ [dk]: { ...s[dk], isLoading: true, error: null, pauseOffset: 0, calculatedBPM: null, baseKey: null, baseMode: null, artist: "", title: "", activeStem: null, activeStems: [], mixedStemBuffer: null, stemBuffers: null, stemError: null, sourceCdnUrl: null, manualUpload: true } }));
    try {
      const { fetchYouTubeAudio } = await import("./rapid");
      const { buffer, title, cdnUrl } = await fetchYouTubeAudio(url);
      const audioBuffer = await decodeArrayBuffer(buffer);
      set((s) => ({
        [dk]: {
          ...s[dk],
          sourceBuffer: audioBuffer,
          sourceFilename: title,
          sourceFile: null,
          sourceUrl: url,
          sourceCdnUrl: cdnUrl,
          isLoading: false,
          regionStart: 0,
          regionEnd: 0,
        },
      }));
      // Downbeat detection runs on the isolated drum stem after separateStems finishes
      // (see separateStems). Stems kick off here in the background.
      get().separateStems(id);
    } catch (err) {
      set((s) => ({ [dk]: { ...s[dk], isLoading: false, error: err instanceof Error ? err.message : "Failed to fetch YouTube audio" } }));
    }
  },

  setDeckMeta: (id, meta) => {
    const dk = deckKey(id);
    set((s) => ({ [dk]: { ...s[dk], ...meta } }));
  },

  loadFromAudioUrl: async (id, url, filename) => {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      return get().loadFromYouTube(id, url);
    }
    const dk = deckKey(id);
    get().stop(id);
    set((s) => ({ [dk]: { ...s[dk], isLoading: true, sourceFilename: filename, sourceUrl: url, sourceFile: null, calculatedBPM: null, baseKey: null, baseMode: null, artist: "", title: "" } }));
    try {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      const buffer = await decodeArrayBuffer(ab);
      set((s) => ({ [dk]: { ...s[dk], sourceBuffer: buffer, isLoading: false, regionStart: 0, regionEnd: 0 } }));
    } catch (err) {
      set((s) => ({ [dk]: { ...s[dk], isLoading: false, error: err instanceof Error ? err.message : "Load failed" } }));
    }
  },

  restoreSession: async (sessionId) => {
    try {
      const res = await fetch(`/api/session?id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const session = await res.json();
      if (session.error) return;

      const applyDeck = async (id: DeckId, d: Record<string, unknown> | null) => {
        if (!d?.audioUrl) return;
        await get().loadFromAudioUrl(id, d.audioUrl as string, (d.filename as string) || "shared-track");
        const params = (d.params as Record<string, unknown>) || {};
        for (const [k, v] of Object.entries(params)) {
          get().setParam(id, k as keyof SimpleParams, v as number | boolean);
        }
        get().setVolume(id, (d.volume as number) ?? 0.6);
        get().setRegion(id, (d.regionStart as number) ?? 0, (d.regionEnd as number) ?? 0);
        get().setDeckMeta(id, {
          artist: (d.artist as string) || "",
          title: (d.title as string) || "",
          baseKey: (d.baseKey as number | null) ?? null,
        });
        const dk = deckKey(id);
        if (d.calculatedBPM) {
          set((s) => ({ [dk]: { ...s[dk], calculatedBPM: d.calculatedBPM as number } }));
        }
        if (d.stemUrls && typeof d.stemUrls === "object") {
          const urls = d.stemUrls as Partial<Record<string, string>>;
          const ctx = getAudioContext();
          const stemNames = ["vocals", "drums", "bass", "other"] as const;
          const stems: Partial<Record<StemType, AudioBuffer>> = {};
          await Promise.all(stemNames.map(async (name) => {
            const url = urls[name]; if (!url) return;
            try {
              const ab = await (await fetch(url)).arrayBuffer();
              stems[name] = await ctx.decodeAudioData(ab);
            } catch { /* skip */ }
          }));
          const instSrc = (["drums", "bass", "other"] as const).map(n => stems[n]).filter((b): b is AudioBuffer => !!b);
          if (instSrc.length > 0) {
            const maxLen = Math.max(...instSrc.map(b => b.length));
            const nCh = Math.max(...instSrc.map(b => b.numberOfChannels));
            const inst = ctx.createBuffer(nCh, maxLen, instSrc[0].sampleRate);
            for (let c = 0; c < nCh; c++) {
              const out = inst.getChannelData(c);
              for (const s of instSrc) { if (c < s.numberOfChannels) { const inp = s.getChannelData(c); for (let i = 0; i < inp.length; i++) out[i] += inp[i]; } }
              for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
            }
            stems.instrumental = inst;
          }
          set((s) => ({ [dk]: { ...s[dk], stemBuffers: stems, stemUrls: urls } }));
        }
        if (d.activeStem) {
          get().setStem(id, d.activeStem as StemType);
        }
      };

      await applyDeck("A", (session.deckA as Record<string, unknown>) ?? null);
      await applyDeck("B", (session.deckB as Record<string, unknown>) ?? null);
      if (typeof session.crossfader === "number") get().setCrossfader(session.crossfader);
    } catch (err) {
      console.error("restoreSession error:", err);
    }
  },

  restoreSessionFromData: async (session) => {
    try {
      const applyDeck = async (id: DeckId, d: Record<string, unknown> | null) => {
        if (!d?.audioUrl) return;
        await get().loadFromAudioUrl(id, d.audioUrl as string, (d.filename as string) || "track");
        const params = (d.params as Record<string, unknown>) || {};
        for (const [k, v] of Object.entries(params)) {
          get().setParam(id, k as keyof SimpleParams, v as number | boolean);
        }
        get().setVolume(id, (d.volume as number) ?? 0.6);
        get().setRegion(id, (d.regionStart as number) ?? 0, (d.regionEnd as number) ?? 0);
        get().setDeckMeta(id, {
          artist: (d.artist as string) || "",
          title: (d.title as string) || "",
          baseKey: (d.baseKey as number | null) ?? null,
        });
        const dk2 = deckKey(id);
        if (d.calculatedBPM) {
          set((s) => ({ [dk2]: { ...s[dk2], calculatedBPM: d.calculatedBPM as number } }));
        }
        if (d.stemUrls && typeof d.stemUrls === "object") {
          const urls = d.stemUrls as Partial<Record<string, string>>;
          const ctx = getAudioContext();
          const stemNames = ["vocals", "drums", "bass", "other"] as const;
          const stems: Partial<Record<StemType, AudioBuffer>> = {};
          await Promise.all(stemNames.map(async (name) => {
            const url = urls[name]; if (!url) return;
            try {
              const ab = await (await fetch(url)).arrayBuffer();
              stems[name] = await ctx.decodeAudioData(ab);
            } catch { /* skip */ }
          }));
          const instSrc = (["drums", "bass", "other"] as const).map(n => stems[n]).filter((b): b is AudioBuffer => !!b);
          if (instSrc.length > 0) {
            const maxLen = Math.max(...instSrc.map(b => b.length));
            const nCh = Math.max(...instSrc.map(b => b.numberOfChannels));
            const inst = ctx.createBuffer(nCh, maxLen, instSrc[0].sampleRate);
            for (let c = 0; c < nCh; c++) {
              const out = inst.getChannelData(c);
              for (const s of instSrc) { if (c < s.numberOfChannels) { const inp = s.getChannelData(c); for (let i = 0; i < inp.length; i++) out[i] += inp[i]; } }
              for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
            }
            stems.instrumental = inst;
          }
          set((s) => ({ [dk2]: { ...s[dk2], stemBuffers: stems, stemUrls: urls } }));
        }
        if (d.activeStem) {
          get().setStem(id, d.activeStem as StemType);
        }
      };

      await applyDeck("A", (session.deckA as Record<string, unknown>) ?? null);
      await applyDeck("B", (session.deckB as Record<string, unknown>) ?? null);
      if (typeof session.crossfader === "number") get().setCrossfader(session.crossfader);

      if (session.masterBus && typeof session.masterBus === "object") {
        const mb = session.masterBus as Record<string, unknown>;
        for (const [k, v] of Object.entries(mb)) {
          get().setMasterBus(k as keyof MasterBusParams, v as number);
        }
      }
    } catch (err) {
      console.error("restoreSessionFromData error:", err);
    }
  },

  lookupEverysong: async (id, artist, title) => {
    if (!artist && !title) return;
    console.log(`[lookupEverysong:${id}] querying Everysong for artist="${artist}" title="${title}"`);
    try {
      const params = new URLSearchParams();
      if (artist) params.set("artist", artist);
      if (title) params.set("title", title);
      const res = await fetch(`/api/everysong?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log(`[lookupEverysong:${id}] response:`, data);
      if (data.found) {
        if (data.noteIndex !== null && data.noteIndex !== undefined) {
          get().setDeckMeta(id, { baseKey: data.noteIndex, baseMode: data.mode ?? null });
        }
        if (data.bpm) {
          get().setBPM(id, data.bpm);
        }
      }
    } catch (e) {
      console.error(`[lookupEverysong:${id}] error:`, e);
    }
    get().setDeckMeta(id, { artist, title });
  },

  loadDeck: async (id, artist, title, opts) => {
    const searchQuery = `${artist} ${title}`;
    console.log(`[loadDeck:${id}] starting — searching YouTube for "${searchQuery}"`);

    const searchQ = encodeURIComponent(searchQuery);
    let candidates: { url: string; title: string }[] = [];
    try {
      const res = await fetch(`/api/youtube/search?q=${searchQ}`);
      if (!res.ok) throw new Error(`YouTube search HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      candidates = Array.isArray(data.candidates) && data.candidates.length > 0
        ? data.candidates
        : data.url ? [{ url: data.url, title: data.title || "" }] : [];
      if (candidates.length === 0) throw new Error("No YouTube results");
      console.log(`[loadDeck:${id}] ${candidates.length} candidate(s), first: ${candidates[0].url}`);
    } catch (e) {
      console.error(`[loadDeck:${id}] YouTube search failed:`, e);
      throw e;
    }

    let lastErr: unknown = null;
    let loaded = false;
    for (let i = 0; i < candidates.length; i++) {
      const { url } = candidates[i];
      try {
        console.log(`[loadDeck:${id}] trying candidate ${i + 1}/${candidates.length}: ${url}`);
        await get().loadFromYouTube(id, url);
        const dk = deckKey(id);
        const state = get() as unknown as Record<string, { sourceBuffer?: unknown; error?: string | null }>;
        const deckState = state[dk];
        if (deckState?.sourceBuffer && !deckState?.error) {
          console.log(`[loadDeck:${id}] audio loaded from candidate ${i + 1}`);
          loaded = true;
          break;
        }
        lastErr = new Error(deckState?.error || "extraction returned no buffer");
        console.warn(`[loadDeck:${id}] candidate ${i + 1} failed: ${deckState?.error}`);
      } catch (e) {
        lastErr = e;
        console.warn(`[loadDeck:${id}] candidate ${i + 1} threw:`, e);
      }
    }

    if (!loaded) {
      const msg = lastErr instanceof Error ? lastErr.message : "all candidates failed";
      console.error(`[loadDeck:${id}] all ${candidates.length} candidates failed`);
      throw new Error(msg);
    }

    // Match-list picks override the manualUpload flag that loadFromYouTube set, so auto-BPM-match runs
    set((s) => ({ [deckKey(id)]: { ...s[deckKey(id)], manualUpload: false } }));

    try {
      await get().lookupEverysong(id, artist, title);
      console.log(`[loadDeck:${id}] metadata loaded`);
    } catch (e) {
      console.error(`[loadDeck:${id}] metadata lookup failed:`, e);
    }

    // Pitch-matched picks come with a non-zero `pitchShift` (semitones). Apply it FIRST with
    // speed+pitch linked so the track lands at the compatible key (and its speed shifts with
    // pitch naturally). Then unlink so the following BPM match only moves speed and leaves
    // pitch at the compatible key.
    if (opts?.pitchShift && opts.pitchShift !== 0) {
      const shift = opts.pitchShift;
      get().setParam(id, "pitchSpeedLinked", true);
      get().setParam(id, "speed", Math.pow(2, shift / 12) - 1);
      get().setParam(id, "pitchSpeedLinked", false);
    }

    // Once both decks have a BPM, nudge deck B's speed so it matches deck A's effective BPM.
    // This runs whichever deck was just loaded — if the other side isn't ready yet, it's a no-op
    // and the next load will trigger the match.
    get().autoMatchDeckBSpeed();

    console.log(`[loadDeck:${id}] complete`);
  },

  detectDownbeat: async (id) => {
    const dk = deckKey(id);
    const deck = getDeck(get(), id);
    if (!deck.sourceBuffer) return;

    set((s) => ({ [dk]: { ...s[dk], downbeatDetecting: true, downbeatError: null } }));

    const fail = (msg: string) => {
      set((s) => ({ [dk]: { ...s[dk], downbeatDetecting: false, downbeatError: msg } }));
    };

    try {
      // Strict: only run on the isolated drum stem. ML transient detection
      // against the full mix is materially less accurate, so refuse to run
      // until stems have separated. Callers must wait for drums first.
      if (!deck.stemUrls?.drums) {
        return fail("Drum stem not ready — wait for stems before requesting downbeat");
      }
      const requestBody: Record<string, unknown> = { audioUrl: deck.stemUrls.drums };

      const res = await fetch("/api/downbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        return fail(`Downbeat service unavailable (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.error) return fail(data.error);

      if (data.first_downbeat_ms == null) return fail("No downbeat returned from Modal");

      const firstDownbeatMs = data.first_downbeat_ms as number;
      // Store downbeat grid (seconds)
      const downbeatGrid = ((data.downbeats_ms as number[] | null) ?? []).map((ms) => ms / 1000);

      // In-point is the first drum-derived downbeat. No first-loud heuristic.
      const inPoint = firstDownbeatMs / 1000;

      set((s) => ({
        [dk]: {
          ...s[dk],
          firstDownbeatMs,
          downbeatGrid: downbeatGrid.length > 0 ? downbeatGrid : null,
          downbeatDetecting: false,
          downbeatError: null,
        },
      }));
      // Set in-point to the first downbeat
      get().setRegion(id, inPoint, 0);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Unexpected error");
    }
  },

  snapToDownbeat: async (id) => {
    const deck = getDeck(get(), id);
    if (!deck.sourceBuffer) return;
    if (deck.firstDownbeatMs === null && (!deck.downbeatGrid || deck.downbeatGrid.length === 0)) {
      await get().detectDownbeat(id);
      return;
    }
    const grid = deck.downbeatGrid;
    const current = deck.regionStart;
    let target: number;
    if (grid && grid.length > 0) {
      target = grid[0];
      let best = Math.abs(grid[0] - current);
      for (const d of grid) {
        const dist = Math.abs(d - current);
        if (dist < best) { best = dist; target = d; }
      }
    } else if (deck.firstDownbeatMs !== null) {
      target = deck.firstDownbeatMs / 1000;
    } else {
      return;
    }
    get().setRegion(id, target, deck.regionEnd);
  },

  autoMatchDeckBSpeed: () => {
    const { deckA, deckB } = get();
    if (!deckA.sourceBuffer || !deckB.sourceBuffer) return;
    if (!deckA.calculatedBPM || !deckB.calculatedBPM) return;
    // Skip auto BPM match when either deck was loaded manually (local file / YouTube URL)
    if (deckA.manualUpload || deckB.manualUpload) return;
    const rateA = 1.0 + deckA.params.speed;
    const targetRateB = (deckA.calculatedBPM * rateA) / deckB.calculatedBPM;
    const newSpeed = Math.max(-0.5, Math.min(0.5, targetRateB - 1.0));
    get().setParam("B", "speed", newSpeed);
    if (deckB.params.pitchSpeedLinked ?? true) {
      get().setParam("B", "pitch", 12 * Math.log2(1.0 + newSpeed));
    }
  },

  play: async (id, forceLoop) => {
    const key = deckKey(id);
    const deck = getDeck(get(), id);
    if (!deck.sourceBuffer) return;

    // Bump generation — any previous onEnded callback becomes stale
    deckGeneration[id] = (deckGeneration[id] || 0) + 1;
    const gen = deckGeneration[id];

    // Kill existing source and disconnect all nodes to free WASM memory
    if (deck.nodes) {
      disconnectDeckNodes(deck.nodes);
    }
    set((s) => ({ [key]: { ...s[key], isPlaying: false, nodes: null } }));

    const ctx = await resumeAudioContext();
    await ensurePitchWorklet();

    // Re-read deck state after async gap
    const freshDeck = getDeck(get(), id);
    if (!freshDeck.sourceBuffer) return;

    const cfGains = getCrossfaderGains(get().crossfader);
    const cfGain = id === "A" ? cfGains.a : cfGains.b;

    const playBuffer = freshDeck.mixedStemBuffer || (freshDeck.activeStem && freshDeck.stemBuffers?.[freshDeck.activeStem]) || freshDeck.sourceBuffer;

    const rStart = freshDeck.regionStart;
    const rEnd = freshDeck.regionEnd > 0 ? freshDeck.regionEnd : playBuffer.duration;
    const shouldLoop = !get().isExporting && !!forceLoop;
    const playOffset = freshDeck.pauseOffset >= rStart ? freshDeck.pauseOffset : rStart;
    const remaining = rEnd - playOffset;
    const playDuration = remaining > 0 ? remaining : undefined;

    const nodes = buildDeckGraph(
      ctx,
      playBuffer,
      freshDeck.params,
      playOffset,
      shouldLoop ? undefined : playDuration,
      freshDeck.volume,
      cfGain,
      () => {
        // Only fires for non-looping playback (native loop never triggers onEnded)
        if (deckGeneration[id] !== gen) return;
        const currentDeck = getDeck(get(), id);
        if (!currentDeck.isPlaying) return;
        if (currentDeck.nodes) disconnectDeckNodes(currentDeck.nodes);
        set((s) => ({
          [key]: { ...s[key], isPlaying: false, nodes: null, pauseOffset: rStart },
        }));
      },
      shouldLoop ? { loopStart: rStart, loopEnd: rEnd } : undefined,
      freshDeck.automationEnabled ? freshDeck.automationPoints : undefined,
    );

    set((s) => ({
      [key]: {
        ...s[key],
        isPlaying: true,
        nodes,
        startedAt: ctx.currentTime - (playOffset - rStart) / expandParams(freshDeck.params).rate,
      },
    }));

    // Schedule the "other" deck to fade out when whichever deck ends first, so the mix ends together.
    const otherId: DeckId = id === "A" ? "B" : "A";
    const otherDeck = getDeck(get(), otherId);
    if (otherDeck.isPlaying && otherDeck.nodes && nodes.wallEndTime !== undefined && otherDeck.nodes.wallEndTime !== undefined) {
      scheduleCrossDeckFade(ctx, nodes, otherDeck.nodes);
      // Stop the later-ending deck shortly after the earlier one ends — no need to keep playing silent audio.
      // Skip the auto-stop during export: exportMP4 manages deck stops + recorder stop on its own timer.
      if (!get().isExporting) {
        const thisEnd = nodes.wallEndTime;
        const otherEnd = otherDeck.nodes.wallEndTime;
        const earlierEnd = Math.min(thisEnd, otherEnd);
        const laterId: DeckId = thisEnd > otherEnd ? id : otherId;
        const laterGen = deckGeneration[laterId] || 0;
        const delayMs = (earlierEnd - ctx.currentTime) * 1000 + 150;
        if (delayMs > 0) {
          setTimeout(() => {
            if (deckGeneration[laterId] === laterGen) get().stop(laterId);
          }, delayMs);
        }
      }
    }
  },

  stop: (id) => {
    const key = deckKey(id);
    const deck = getDeck(get(), id);
    // Bump generation first so onEnded is ignored
    deckGeneration[id] = (deckGeneration[id] || 0) + 1;
    // Set state before stopping source (onEnded will check generation and bail)
    set((s) => ({
      [key]: { ...s[key], pauseOffset: s[key].regionStart, isPlaying: false, nodes: null },
    }));
    if (deck.nodes) {
      disconnectDeckNodes(deck.nodes);
    }

  },

  pause: (id) => {
    const key = deckKey(id);
    const deck = getDeck(get(), id);
    if (!deck.nodes || !deck.isPlaying) return;
    // Bump generation first
    deckGeneration[id] = (deckGeneration[id] || 0) + 1;
    const ctx = getAudioContext();
    const rStart = deck.regionStart;
    const elapsed = rStart + (ctx.currentTime - deck.startedAt) * expandParams(deck.params).rate;
    // Set state before stopping source
    set((s) => ({
      [key]: { ...s[key], pauseOffset: elapsed, isPlaying: false, nodes: null },
    }));
    disconnectDeckNodes(deck.nodes);
  },

  setParam: (id, paramKey, value) => {
    const key = deckKey(id);

    // In linked mode, speed and pitch always move together.
    // Build a single atomic state update so expanded params are always consistent.
    const currentLinked = getDeck(get(), id).params.pitchSpeedLinked ?? true;
    const extraParams: Partial<SimpleParams> = {};
    if (paramKey === "speed" && currentLinked) {
      extraParams.pitch = 12 * Math.log2(1 + Number(value));
    }

    set((s) => ({
      [key]: {
        ...s[key],
        params: { ...s[key].params, [paramKey]: value, ...extraParams },
      },
    }));

    const deck = getDeck(get(), id);
    if (!deck.nodes) return;

    const expanded = expandParams(deck.params);

    if (paramKey === "speed") {
      deck.nodes.source.playbackRate.value = expanded.rate;
    }

    // Update pitch shifter compensation when speed or pitch changes
    if (deck.nodes.pitchShifter && (paramKey === "speed" || paramKey === "pitch")) {
      const netShift = expanded.pitchFactor / expanded.rate;
      deck.nodes.pitchShifter.port.postMessage(JSON.stringify(["pitch", netShift]));
    }

    const toneKeys: (keyof SimpleParams)[] = ["tone", "eqLowOverride", "eqMidOverride", "eqHighOverride", "eqBumpFreqOverride", "eqBumpGainOverride"];
    if (toneKeys.includes(paramKey)) {
      deck.nodes.lowShelf.gain.value = expanded.eqLow;
      deck.nodes.peaking.gain.value = expanded.eqMid;
      deck.nodes.highShelf.gain.value = expanded.eqHigh;
      deck.nodes.bump.frequency.value = expanded.eqBumpFreq;
      deck.nodes.bump.gain.value = expanded.eqBumpGain;
    }

    const reverbKeys: (keyof SimpleParams)[] = ["reverb", "reverbWetOverride", "reverbDurationOverride", "reverbDecayOverride"];
    if (reverbKeys.includes(paramKey)) {
      deck.nodes.dryGain.gain.value = 1.0; // always full dry — reverb is additive
      deck.nodes.wetGain.gain.value = expanded.reverbWet;
      const ctx = getAudioContext();
      deck.nodes.convolver.buffer = generateIR(ctx, expanded.reverbDuration, expanded.reverbDecay);
    }

    const satKeys: (keyof SimpleParams)[] = ["saturation", "satDriveOverride", "satMixOverride", "satToneOverride"];
    if (satKeys.includes(paramKey)) {
      deck.nodes.waveshaper.curve = makeSaturationCurve(expanded.satDrive);
      deck.nodes.satFilter.frequency.value = expanded.satTone;
    }

  },

  setVolume: (id, volume) => {
    const key = deckKey(id);
    set((s) => ({ [key]: { ...s[key], volume } }));

    const deck = getDeck(get(), id);
    if (!deck.nodes) return;

    const cfGains = getCrossfaderGains(get().crossfader);
    const cfGain = id === "A" ? cfGains.a : cfGains.b;
    deck.nodes.deckGain.gain.value = volume * cfGain;
  },

  setCrossfader: (value) => {
    set({ crossfader: value });
    const { deckA, deckB } = get();
    const cfGains = getCrossfaderGains(value);

    if (deckA.nodes) {
      deckA.nodes.deckGain.gain.value = deckA.volume * cfGains.a;
    }
    if (deckB.nodes) {
      deckB.nodes.deckGain.gain.value = deckB.volume * cfGains.b;
    }
  },

  eject: (id) => {
    const key = deckKey(id);
    get().stop(id);
    set(() => ({
      [key]: {
        ...defaultDeck(),
      },
    }));
  },

  setRegion: (id, start, end) => {
    const dk = deckKey(id);
    set((s) => ({ [dk]: { ...s[dk], regionStart: start, regionEnd: end, pauseOffset: start } }));

    // Update live source node loop boundaries
    const deck = getDeck(get(), id);
    if (deck.nodes?.source && deck.isPlaying) {
      deck.nodes.source.loopStart = start;
      deck.nodes.source.loopEnd = end > 0 ? end : (deck.sourceBuffer?.duration ?? 0);
    }
  },

  seek: async (id, position) => {
    const dk = deckKey(id);
    const deck = getDeck(get(), id);
    if (!deck.sourceBuffer) return;
    const wasPlaying = deck.isPlaying;
    if (wasPlaying) get().pause(id);
    set((s) => ({ [dk]: { ...s[dk], pauseOffset: position } }));
    if (wasPlaying) await get().play(id);
  },

  scrub: (id, position) => {
    const dk = deckKey(id);
    set((s) => ({ [dk]: { ...s[dk], pauseOffset: position } }));
  },

  syncPlay: async () => {
    const { deckA, deckB, recordArmed } = get();
    const hasA = !!deckA.sourceBuffer;
    const hasB = !!deckB.sourceBuffer;
    if (!hasA && !hasB) return;

    // Stop both first
    if (hasA) get().stop("A");
    if (hasB) get().stop("B");

    await resumeAudioContext();

    // Start recording if armed
    if (recordArmed && masterStreamDest) {
      getSharedMerger(); // ensure bus is built
      recordedChunks.length = 0;
      liveRecorder = new MediaRecorder(masterStreamDest.stream);
      liveRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      liveRecorder.start();
      set({ isRecording: true, recordArmed: false });
    }

    // Start both — play() is async but the actual source.start() inside
    // happens on the same AudioContext so they'll be sample-aligned
    // Force looping when recording so both tracks play for the full duration
    const loop = get().isRecording;
    if (hasA) get().play("A", loop);
    if (hasB) get().play("B", loop);
  },

  setBPM: (id, bpm) => {
    const dk = deckKey(id);
    if (bpm <= 0) return;
    set((s) => ({ [dk]: { ...s[dk], calculatedBPM: bpm } }));
  },

  setStem: (id, stem) => {
    // Legacy single-stem set — wraps toggleStem for compat
    const dk = deckKey(id);
    const deck = getDeck(get(), id);
    if (!stem) {
      const wasPlaying = deck.isPlaying;
      if (wasPlaying) get().pause(id);
      set((s) => ({ [dk]: { ...s[dk], activeStem: null, activeStems: [], mixedStemBuffer: null, stemError: null } }));
      if (wasPlaying) get().play(id);
      return;
    }
    get().toggleStem(id, stem);
  },

  toggleStem: (id, stem) => {
    const dk = deckKey(id);
    const deck = getDeck(get(), id);

    // If stems aren't loaded yet, toggle the selection and trigger separation
    if (!deck.stemBuffers) {
      const current = deck.activeStems;
      const next = current.includes(stem) ? current.filter((s) => s !== stem) : [...current, stem];
      const alreadySeparating = deck.isStemLoading;
      set((s) => ({ [dk]: { ...s[dk], activeStem: next[0] ?? null, activeStems: next, mixedStemBuffer: null, stemError: null } }));
      if (next.length > 0 && !alreadySeparating) get().separateStems(id);
      return;
    }

    const wasPlaying = deck.isPlaying;
    if (wasPlaying) get().pause(id);

    const current = deck.activeStems;
    let next: StemType[];
    if (current.includes(stem)) {
      next = current.filter((s) => s !== stem);
    } else {
      // If selecting an individual stem while "instrumental" is active (or vice versa), handle conflicts
      if (stem === "instrumental") {
        // "instrumental" = drums+bass+other, deselect those individuals
        next = [...current.filter((s) => s !== "drums" && s !== "bass" && s !== "other"), stem];
      } else if (["drums", "bass", "other"].includes(stem) && current.includes("instrumental")) {
        // Selecting individual while instrumental is on — remove instrumental, add the individual
        next = [...current.filter((s) => s !== "instrumental"), stem];
      } else {
        next = [...current, stem];
      }
    }

    const mixed = next.length > 0 && deck.stemBuffers ? mixStemBuffers(next, deck.stemBuffers) : null;
    set((s) => ({ [dk]: { ...s[dk], activeStem: next[0] ?? null, activeStems: next, mixedStemBuffer: mixed, stemError: null } }));
    if (wasPlaying) get().play(id);
  },

  separateStems: async (id) => {
    const dk = deckKey(id);
    const deck = getDeck(get(), id);
    if ((!deck.sourceFile && !deck.sourceBuffer) || deck.isStemLoading) return;

    const wasPlaying = deck.isPlaying;
    if (wasPlaying) get().pause(id);

    set((s) => ({ [dk]: { ...s[dk], isStemLoading: true, stemError: null } }));

    try {
      let res: Response;
      if (deck.sourceUrl) {
        // YouTube — server fetches fresh CDN URL from RapidAPI, passes to Modal
        res = await fetch("/api/stems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: deck.sourceUrl }),
        });
      } else if (deck.sourceFile) {
        // Local file
        const formData = new FormData();
        formData.append("audio", deck.sourceFile, (deck.sourceFilename || "audio") + ".mp3");
        res = await fetch("/api/stems", { method: "POST", body: formData });
      } else {
        throw new Error("No audio source available");
      }

      if (!res.ok) {
        let msg = "Stem separation failed";
        try {
          const text = await res.text();
          try { const d = JSON.parse(text); msg = d.error || msg; } catch { msg = text.slice(0, 200) || msg; }
        } catch { /* ok */ }
        throw new Error(msg);
      }

      const data = await res.json();
      const ctx = getAudioContext();

      // Fetch and decode each stem audio from Replicate CDN
      const stemNames = ["vocals", "drums", "bass", "other"] as const;
      const stems: Partial<Record<StemType, AudioBuffer>> = {};

      await Promise.all(
        stemNames.map(async (name) => {
          const url = data[name];
          if (!url) return;
          const audioRes = await fetch(url);
          const arrayBuf = await audioRes.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(arrayBuf);
          stems[name] = audioBuf;
        })
      );

      // Build instrumental = drums + bass + other (no vocals)
      const instSources = (["drums", "bass", "other"] as const)
        .map((n) => stems[n])
        .filter((b): b is AudioBuffer => !!b);
      if (instSources.length > 0) {
        const maxLen = Math.max(...instSources.map((b) => b.length));
        const nCh = Math.max(...instSources.map((b) => b.numberOfChannels));
        const instBuf = ctx.createBuffer(nCh, maxLen, instSources[0].sampleRate);
        for (let c = 0; c < nCh; c++) {
          const out = instBuf.getChannelData(c);
          for (const src of instSources) {
            if (c >= src.numberOfChannels) continue;
            const inp = src.getChannelData(c);
            for (let i = 0; i < inp.length; i++) out[i] += inp[i];
          }
          for (let i = 0; i < out.length; i++) {
            if (out[i] > 1) out[i] = 1;
            else if (out[i] < -1) out[i] = -1;
          }
        }
        stems.instrumental = instBuf;
      }

      // Save Pinata URLs so sessions can restore stems without re-running Modal
      const stemUrlMap: Partial<Record<string, string>> = {};
      for (const name of stemNames) {
        if (data[name]) stemUrlMap[name] = data[name];
      }

      // Use previously requested stems if any, otherwise default
      const pending = getDeck(get(), id).activeStems;
      const stemTarget: StemType[] = pending.length > 0 ? pending : [id === "A" ? "instrumental" : "vocals"];
      const mixed = stemTarget.length > 0 ? mixStemBuffers(stemTarget, stems) : null;

      set((s) => ({
        // Release the raw File — the original bytes were only needed to POST to /api/stems
        // and can be 10–50MB of otherwise-idle heap per deck.
        [dk]: { ...s[dk], stemBuffers: stems, stemUrls: stemUrlMap, isStemLoading: false, activeStem: stemTarget[0] ?? null, activeStems: stemTarget, mixedStemBuffer: mixed, sourceFile: null },
      }));

      // Drum-based downbeat detection. Whatever inPoint detectDownbeat sets is
      // the final value — no second pass.
      get().detectDownbeat(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stem separation failed";
      console.error("[stems] Error:", msg);
      set((s) => ({ [dk]: { ...s[dk], isStemLoading: false, stemError: msg, activeStem: null, activeStems: [], mixedStemBuffer: null } }));
    }
  },

  setMasterBus: (key, value) => {
    set((s) => ({
      masterBus: { ...s.masterBus, [key]: value },
    }));

    const mb = get().masterBus;

    // Update EQ nodes
    if (key === "eqLow" && masterLow) masterLow.gain.value = mb.eqLow;
    if (key === "eqMid" && masterMid) masterMid.gain.value = mb.eqMid;
    if (key === "eqHigh" && masterHigh) masterHigh.gain.value = mb.eqHigh;

    // Update compressor
    const compKeys = ["compAmount", "compThreshold", "compRatio", "compAttack", "compRelease", "compKnee", "compMakeup"];
    if (compKeys.includes(key as string) && masterComp && masterMakeup) {
      const comp = expandCompressor(mb);
      masterComp.threshold.value = comp.threshold;
      masterComp.ratio.value = comp.ratio;
      masterComp.attack.value = comp.attack;
      masterComp.release.value = comp.release;
      masterComp.knee.value = comp.knee;
      masterMakeup.gain.value = Math.pow(10, comp.makeup / 20); // dB to linear
    }

    // Update limiter
    const limKeys = ["limiterAmount", "limiterThreshold", "limiterRelease", "limiterKnee"];
    if (limKeys.includes(key as string) && masterLimiter) {
      const lim = expandLimiter(mb);
      masterLimiter.threshold.value = lim.threshold;
      masterLimiter.ratio.value = lim.ratio;
      masterLimiter.attack.value = lim.attack;
      masterLimiter.release.value = lim.release;
      masterLimiter.knee.value = lim.knee;
    }
  },

  applyStylePreset: (style) => {
    const preset = BATCH_PRESETS[style];
    for (const [k, v] of Object.entries(preset)) {
      if (v !== undefined) {
        get().setParam("A", k as keyof SimpleParams, v as number | boolean);
        get().setParam("B", k as keyof SimpleParams, v as number | boolean);
      }
    }
  },

  renderToBlob: async () => {
    console.log("[renderToBlob] starting offline render");
    try {
      const blob = await renderMixToWAV(get);
      if (!blob) {
        console.warn("[renderToBlob] no audio loaded — returning null");
        return null;
      }
      console.log(`[renderToBlob] complete — ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      return blob;
    } catch (e) {
      console.error("[renderToBlob] offline render failed:", e);
      return null;
    }
  },

  download: async () => {
    const blob = await renderMixToWAV(get);
    if (!blob) return;

    const { deckA, deckB } = get();
    const hasA = !!deckA.sourceBuffer;
    const hasB = !!deckB.sourceBuffer;
    const nameA = deckA.sourceFilename || "deck-a";
    const nameB = deckB.sourceFilename || "deck-b";
    const filename = hasA && hasB
      ? `${nameA}-x-${nameB}-remix.wav`
      : `${hasA ? nameA : nameB}-remix.wav`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  downloadMixMP3: async () => {
    const wavBlob = await renderMixToWAV(get);
    if (!wavBlob) return;
    set({ isConvertingMp3: true });
    try {
      const arrayBuf = await wavBlob.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      let peak = 0;
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          const abs = Math.abs(ch[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 1) {
        const scale = 0.99 / peak;
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const ch = decoded.getChannelData(c);
          for (let i = 0; i < ch.length; i++) ch[i] *= scale;
        }
      }
      const mp3Blob = encodeMP3(decoded, 192);

      const { deckA, deckB } = get();
      const hasA = !!deckA.sourceBuffer;
      const hasB = !!deckB.sourceBuffer;
      const nameA = deckA.sourceFilename || "deck-a";
      const nameB = deckB.sourceFilename || "deck-b";
      const filename = hasA && hasB
        ? `${nameA}-x-${nameB}-remix.mp3`
        : `${hasA ? nameA : nameB}-remix.mp3`;

      const url = URL.createObjectURL(mp3Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("MP3 mix conversion failed:", e);
    } finally {
      set({ isConvertingMp3: false });
    }
  },

  exportMP4: async () => {
    const { deckA, deckB } = get();
    if (!deckA.sourceBuffer && !deckB.sourceBuffer) return;

    // Ensure the shared output bus (and masterStreamDest) is initialised
    getSharedMerger();
    if (!masterStreamDest) return;

    set({ isExporting: true });

    try {
      // Calculate wall-clock seconds per deck: buffer region / playback rate + reverb tail
      const wallSec = (deck: DeckState): number => {
        if (!deck.sourceBuffer) return 0;
        const buf = deck.mixedStemBuffer || (deck.activeStem && deck.stemBuffers?.[deck.activeStem]) || deck.sourceBuffer;
        const rEnd = deck.regionEnd > 0 ? deck.regionEnd : buf.duration;
        const exp = expandParams(deck.params);
        return (rEnd - deck.regionStart) / exp.rate + exp.reverbDuration;
      };
      // Both decks loaded → mix ends when the EARLIER one ends (cross-deck fade brings the other to silence).
      // Only one deck loaded → that deck's duration.
      const aSec = wallSec(deckA);
      const bSec = wallSec(deckB);
      const mixSec = aSec > 0 && bSec > 0 ? Math.min(aSec, bSec) : Math.max(aSec, bSec);
      const totalMs = mixSec * 1000;

      // Stop both decks — resets pauseOffset to regionStart
      get().stop("A");
      get().stop("B");

      // Prefer lossless PCM capture; fall back to high-bitrate Opus
      const pcmMime = "audio/webm;codecs=pcm";
      const recorderOptions: MediaRecorderOptions = MediaRecorder.isTypeSupported(pcmMime)
        ? { mimeType: pcmMime }
        : { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 320000 };

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(masterStreamDest.stream, recorderOptions);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.start(100);

        // Small delay so recorder is running before playback begins
        setTimeout(() => get().syncPlay(), 80);

        // Stop after full wall-clock duration
        setTimeout(() => {
          get().stop("A");
          get().stop("B");
          recorder.stop();
        }, totalMs + 80);
      });

      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      set({ pendingVideoExport: blob });
    } finally {
      set({ isExporting: false });
    }
  },

  armRecord: () => {
    const { recordArmed, isRecording } = get();
    if (isRecording) {
      get().stopRecording();
      return;
    }
    set({ recordArmed: !recordArmed });
  },

  stopRecording: () => {
    if (!liveRecorder || liveRecorder.state === "inactive") {
      set({ isRecording: false });
      return;
    }

    // Stop both decks
    get().stop("A");
    get().stop("B");

    liveRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || "audio/webm" });
      recordedChunks.length = 0;
      liveRecorder = null;
      set({ isRecording: false, pendingRecording: blob });
    };

    liveRecorder.stop();
  },

  toggleAutomation: (id) => {
    const deck = getDeck(get(), id);
    set({ [deckKey(id)]: { ...deck, automationEnabled: !deck.automationEnabled } });
  },

  addAutomationPoint: (id, time, value) => {
    const deck = getDeck(get(), id);
    const points = [...deck.automationPoints, { time, value }].sort((a, b) => a.time - b.time);
    set({ [deckKey(id)]: { ...deck, automationPoints: points } });
  },

  removeAutomationPoint: (id, index) => {
    const deck = getDeck(get(), id);
    const points = deck.automationPoints.filter((_, i) => i !== index);
    set({ [deckKey(id)]: { ...deck, automationPoints: points } });
  },

  moveAutomationPoint: (id, index, time, value) => {
    const deck = getDeck(get(), id);
    const points = [...deck.automationPoints];
    points[index] = { time, value };
    points.sort((a, b) => a.time - b.time);
    set({ [deckKey(id)]: { ...deck, automationPoints: points } });
  },

}));
