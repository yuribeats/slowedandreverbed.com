import { create } from "zustand";
import {
  ProcessingParams,
  DEFAULTS,
  encodeWAV,
  renderOffline,
} from "@yuribeats/audio-utils";
import { decodeFile, decodeArrayBuffer } from "./file-decoder";
import { fetchYouTubeAudio } from "./cobalt";
import { getAudioContext } from "./audio-context";

interface AudioNodes {
  source: AudioBufferSourceNode;
  lowShelf: BiquadFilterNode;
  peaking: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  convolver: ConvolverNode;
  dryGain: GainNode;
  wetGain: GainNode;
}

interface AppStore {
  sourceBuffer: AudioBuffer | null;
  sourceFilename: string | null;
  youtubeUrl: string | null;

  params: ProcessingParams;
  isLoading: boolean;
  isPlaying: boolean;
  isExporting: boolean;
  error: string | null;

  nodes: AudioNodes | null;
  startedAt: number;

  loadFile: (file: File) => Promise<void>;
  loadFromYouTube: (url: string) => Promise<void>;
  setParam: <K extends keyof ProcessingParams>(
    key: K,
    value: ProcessingParams[K]
  ) => void;
  play: () => void;
  stop: () => void;
  download: () => Promise<void>;
  clearError: () => void;
}

function generateIR(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return ir;
}

function normalizeBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = getAudioContext();
  const normalized = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  const gain = peak > 0 ? 1.0 / peak : 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = normalized.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      dst[i] = src[i] * gain;
    }
  }
  return normalized;
}

export const useStore = create<AppStore>((set, get) => ({
  sourceBuffer: null,
  sourceFilename: null,
  youtubeUrl: null,

  params: { ...DEFAULTS },
  isLoading: false,
  isPlaying: false,
  isExporting: false,
  error: null,

  nodes: null,
  startedAt: 0,

  loadFile: async (file: File) => {
    get().stop();
    set({ isLoading: true, error: null, youtubeUrl: null });
    try {
      const audioBuffer = await decodeFile(file);
      set({
        sourceBuffer: audioBuffer,
        sourceFilename: file.name.replace(/\.[^/.]+$/, ""),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, error: "Failed to decode audio file" });
    }
  },

  loadFromYouTube: async (url: string) => {
    get().stop();
    set({ isLoading: true, error: null, youtubeUrl: url });
    try {
      const { buffer, title } = await fetchYouTubeAudio(url);
      const audioBuffer = await decodeArrayBuffer(buffer);
      set({
        sourceBuffer: audioBuffer,
        sourceFilename: title,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch YouTube audio",
      });
    }
  },

  setParam: (key, value) => {
    set((state) => ({
      params: { ...state.params, [key]: value },
    }));

    // Update live audio nodes in real time
    const { nodes, params: currentParams } = get();
    if (!nodes) return;

    const newParams = { ...currentParams, [key]: value };

    // Update playback rate
    if (key === "rate") {
      nodes.source.playbackRate.value = value as number;
    }

    // Update EQ
    if (key === "eqLow") nodes.lowShelf.gain.value = value as number;
    if (key === "eqMid") nodes.peaking.gain.value = value as number;
    if (key === "eqHigh") nodes.highShelf.gain.value = value as number;

    // Update reverb mix
    if (key === "reverbWet") {
      nodes.dryGain.gain.value = 1 - (value as number);
      nodes.wetGain.gain.value = value as number;
    }

    // Rebuild convolver IR if reverb shape changed
    if (key === "reverbDuration" || key === "reverbDecay") {
      const ctx = getAudioContext();
      nodes.convolver.buffer = generateIR(
        ctx,
        newParams.reverbDuration,
        newParams.reverbDecay
      );
    }
  },

  play: () => {
    const { sourceBuffer, params, isPlaying } = get();
    if (!sourceBuffer) return;
    if (isPlaying) get().stop();

    const ctx = getAudioContext();

    const source = ctx.createBufferSource();
    source.buffer = sourceBuffer;
    source.playbackRate.value = params.rate;

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 200;
    lowShelf.gain.value = params.eqLow;

    const peaking = ctx.createBiquadFilter();
    peaking.type = "peaking";
    peaking.frequency.value = 2500;
    peaking.Q.value = 1.0;
    peaking.gain.value = params.eqMid;

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 8000;
    highShelf.gain.value = params.eqHigh;

    const convolver = ctx.createConvolver();
    convolver.buffer = generateIR(ctx, params.reverbDuration, params.reverbDecay);

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - params.reverbWet;

    const wetGain = ctx.createGain();
    wetGain.gain.value = params.reverbWet;

    // Connect chain
    source.connect(lowShelf);
    lowShelf.connect(peaking);
    peaking.connect(highShelf);
    highShelf.connect(dryGain);
    highShelf.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(ctx.destination);
    wetGain.connect(ctx.destination);

    source.onended = () => {
      set({ isPlaying: false, nodes: null });
    };

    source.start(0);

    set({
      isPlaying: true,
      nodes: { source, lowShelf, peaking, highShelf, convolver, dryGain, wetGain },
      startedAt: ctx.currentTime,
    });
  },

  stop: () => {
    const { nodes } = get();
    if (nodes) {
      try { nodes.source.stop(); } catch { /* already stopped */ }
    }
    set({ isPlaying: false, nodes: null });
  },

  download: async () => {
    const { sourceBuffer, params, sourceFilename } = get();
    if (!sourceBuffer) return;

    set({ isExporting: true, error: null });

    try {
      const channelData: Float32Array[] = [];
      for (let c = 0; c < sourceBuffer.numberOfChannels; c++) {
        channelData.push(new Float32Array(sourceBuffer.getChannelData(c)));
      }

      const result = await renderOffline({
        channelData,
        sampleRate: sourceBuffer.sampleRate,
        numberOfChannels: sourceBuffer.numberOfChannels,
        length: sourceBuffer.length,
        params,
      });

      const ctx = getAudioContext();
      const buf = ctx.createBuffer(
        result.numberOfChannels,
        result.length,
        result.sampleRate
      );
      for (let c = 0; c < result.numberOfChannels; c++) {
        buf.getChannelData(c).set(result.channelData[c]);
      }

      const normalized = normalizeBuffer(buf);
      const blob = encodeWAV(normalized);
      const filename = sourceFilename
        ? `${sourceFilename}-driftwave.wav`
        : "driftwave-output.wav";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      set({ isExporting: false });
    } catch (err) {
      set({
        isExporting: false,
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  },

  clearError: () => set({ error: null }),
}));
