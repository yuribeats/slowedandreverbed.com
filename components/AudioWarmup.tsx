"use client";

import { useEffect } from "react";
import { warmUpAudio } from "../lib/audio-context";

export default function AudioWarmup() {
  useEffect(() => {
    const handler = () => {
      warmUpAudio();
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("click", handler);
    };
    document.addEventListener("touchstart", handler, { once: true });
    document.addEventListener("click", handler, { once: true });
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("click", handler);
    };
  }, []);

  return null;
}
