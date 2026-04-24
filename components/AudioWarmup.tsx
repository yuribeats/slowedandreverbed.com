"use client";

import { useEffect } from "react";
import { getAudioContext } from "../lib/audio-context";

// Build a ~0.1s silent WAV as a blob URL. Must have real duration so <audio loop>
// keeps the iOS audio session alive (a 44-byte zero-duration WAV would not).
function makeSilentWavUrl(): string {
  const sampleRate = 8000;
  const seconds = 0.1;
  const numSamples = Math.floor(sampleRate * seconds);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true);
  v.setUint16(32, bytesPerSample, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, dataSize, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

let silentAudioEl: HTMLAudioElement | null = null;

function startSilentLoop() {
  if (silentAudioEl) return;
  const el = document.createElement("audio");
  el.setAttribute("playsinline", "");
  el.loop = true;
  el.volume = 0.0001;
  el.src = makeSilentWavUrl();
  el.style.display = "none";
  document.body.appendChild(el);
  el.play().catch(() => {});
  silentAudioEl = el;
}

export default function AudioWarmup() {
  useEffect(() => {
    // Prefer modern API when available (iOS 17+, desktop Safari)
    const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (audioSession) {
      try { audioSession.type = "playback"; } catch { /* ignore */ }
    }

    const handler = () => {
      startSilentLoop();
      const ctx = getAudioContext();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    document.addEventListener("touchstart", handler, { once: true });
    document.addEventListener("click", handler, { once: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        if (silentAudioEl && silentAudioEl.paused) silentAudioEl.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("click", handler);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
