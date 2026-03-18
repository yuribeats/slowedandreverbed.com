"use client";

import { useStore } from "../lib/store";

export default function DownloadButton() {
  const processedBuffer = useStore((s) => s.processedBuffer);
  const download = useStore((s) => s.download);

  if (!processedBuffer) return null;

  return (
    <button
      onClick={download}
      className="bg-surface-2 border border-accent text-accent px-4 py-3 text-sm uppercase tracking-widest hover:bg-accent hover:text-bg"
    >
      DOWNLOAD WAV
    </button>
  );
}
