"use client";

import { useStore } from "../lib/store";

export default function DownloadButton() {
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const isExporting = useStore((s) => s.isExporting);
  const download = useStore((s) => s.download);

  return (
    <button
      onClick={download}
      disabled={!sourceBuffer || isExporting}
      className="tactical-button disabled:opacity-50"
      style={{ fontFamily: "var(--font-tech)" }}
    >
      {isExporting ? "EXPORTING..." : "DOWNLOAD WAV"}
    </button>
  );
}
