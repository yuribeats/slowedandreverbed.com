"use client";

import { useEffect } from "react";
import { useStore } from "../../../../lib/store";
import SpectrumAnalyzer from "../../../../components/SpectrumAnalyzer";
import Controls from "../../../../components/Controls";
import Transport from "../../../../components/Transport";
import ProgressBar from "../../../../components/ProgressBar";
import DownloadButton from "../../../../components/DownloadButton";
import Toast from "../../../../components/Toast";

export default function SharePage({ params }: { params: { id: string } }) {
  const loadShare = useStore((s) => s.loadShare);
  const sourceBuffer = useStore((s) => s.sourceBuffer);
  const sourceFilename = useStore((s) => s.sourceFilename);
  const isLoading = useStore((s) => s.isLoading);

  useEffect(() => {
    loadShare(params.id);
  }, [params.id, loadShare]);

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "#060606" }}>
      <div className="flex max-w-[960px] w-full">
        <div className="wood-left hidden sm:block" />

        <div className="flex-1 flex flex-col relative" style={{ background: "var(--panel-face)", border: "1px solid var(--panel-border)" }}>
          <div className="screw absolute top-2 left-2" style={{ zIndex: 10 }} />
          <div className="screw absolute top-2 right-2" style={{ zIndex: 10 }} />

          <div className="px-4 py-2 flex items-center justify-between border-b border-dw-panel-border">
            <a href="/" className="flex flex-col">
              <span className="text-[13px] text-white uppercase tracking-[0.15em] font-bold font-mono">KENWOOD</span>
              <span className="text-[8px] text-dw-muted font-mono tracking-wider">KRC-859W</span>
            </a>
            {sourceFilename && (
              <span className="text-[10px] text-dw-vfd-teal-dim uppercase tracking-[0.1em] font-mono">
                {sourceFilename}
              </span>
            )}
          </div>

          {isLoading && (
            <div className="px-4 py-10 text-center">
              <p className="text-dw-vfd-teal uppercase tracking-[0.15em] text-[9px] font-mono" style={{ textShadow: "0 0 8px rgba(0,229,204,0.4)" }}>
                LOADING SHARED TRACK...
              </p>
            </div>
          )}

          <SpectrumAnalyzer />
          <div className="panel-seam" />
          <Controls />
          <div className="panel-seam" />

          {sourceBuffer && (
            <div className="px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Transport />
                <ProgressBar />
              </div>
              <div className="flex items-center justify-end">
                <DownloadButton />
              </div>
            </div>
          )}

          <div className="screw absolute bottom-2 left-2" style={{ zIndex: 10 }} />
          <div className="screw absolute bottom-2 right-2" style={{ zIndex: 10 }} />
          <div className="h-4" />
        </div>

        <div className="wood-right hidden sm:block" />
      </div>
      <Toast />
    </main>
  );
}
