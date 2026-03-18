"use client";

import { useEffect } from "react";
import { getAudioContext } from "../lib/audio-context";

// Force iOS out of "sound effects" category into "playback" category
// so audio plays through speakers even when silent mode switch is on
function unlockIOSAudio() {
  const audio = document.createElement("audio");
  audio.setAttribute("playsinline", "");
  // Tiny silent WAV (44 bytes)
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  audio.volume = 0.01;
  audio.play().catch(() => {});
  // Clean up after it plays
  audio.onended = () => audio.remove();
}

export default function AudioWarmup() {
  useEffect(() => {
    const handler = () => {
      unlockIOSAudio();
      getAudioContext();
    };
    document.addEventListener("touchstart", handler, { once: true });
    document.addEventListener("click", handler, { once: true });

    // Re-resume AudioContext when page returns from background
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          ctx.resume();
        }
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
