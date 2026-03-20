"use client";

import { useState } from "react";
import { generateCover } from "../lib/cover-generator";

interface Props {
  audioBlob: Blob;
  defaultFilename: string;
  onClose: () => void;
}

export default function ExportVideoModalRemix({ audioBlob, defaultFilename, onClose }: Props) {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!artist.trim() || !title.trim()) return;

    setExporting(true);

    try {
      setStatus("GENERATING COVER...");
      console.log("[EXPORT] Step 1: generating cover...");
      const coverBlob = await generateCover(artist.trim(), title.trim());
      console.log("[EXPORT] Cover generated:", coverBlob.size, "bytes");

      setStatus("GENERATING VIDEO...");
      console.log("[EXPORT] Step 2: sending to /api/generate-video...");
      console.log("[EXPORT] Audio blob:", audioBlob.size, "bytes, type:", audioBlob.type);
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.wav");
      formData.append("image", coverBlob, "cover.png");
      formData.append("artist", artist.trim());
      formData.append("title", title.trim());

      const res = await fetch("/api/generate-video", {
        method: "POST",
        body: formData,
      });

      console.log("[EXPORT] Response status:", res.status);
      const text = await res.text();
      console.log("[EXPORT] Response body:", text.substring(0, 500));
      if (!res.ok) {
        throw new Error(`SERVER ${res.status}: ${text.substring(0, 100)}`);
      }
      const data = JSON.parse(text);

      setStatus("DOWNLOADING...");
      console.log("[EXPORT] Step 3: downloading from", data.url);
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `${defaultFilename}.mp4`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus("DONE");
      console.log("[EXPORT] Complete");
      setTimeout(() => onClose(), 2000);
    } catch (e) {
      console.error("[EXPORT] Error:", e);
      setStatus("ERROR: " + (e instanceof Error ? e.message : "FAILED"));
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !exporting) onClose(); }}
    >
      <div className="console w-full max-w-[440px] mx-4 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span
            className="text-sm tracking-[2px] uppercase"
            style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}
          >
            EXPORT MP4
          </span>
          {!exporting && (
            <button
              onClick={onClose}
              className="text-[10px] uppercase tracking-wider border border-[#333] px-2 py-1"
              style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", background: "transparent" }}
            >
              CLOSE
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
            ARTIST
          </span>
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            disabled={exporting}
            placeholder="ARTIST NAME"
            className="bg-transparent border border-[#333] px-3 py-2 text-[13px] uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", outline: "none" }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
            TITLE
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={exporting}
            placeholder="TRACK TITLE"
            className="bg-transparent border border-[#333] px-3 py-2 text-[13px] uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", outline: "none" }}
          />
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || !artist.trim() || !title.trim()}
          className="border-2 border-[var(--accent-gold)] px-4 py-3 text-[12px] uppercase tracking-wider disabled:opacity-30"
          style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", background: "transparent" }}
        >
          {exporting ? status : "EXPORT MP4"}
        </button>

        {!exporting && status && (
          <div className="text-[10px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: status.startsWith("ERROR") ? "#c82828" : "var(--accent-gold)" }}>
            {status}
          </div>
        )}

        <div className="text-[9px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
          GENERATES A VIDEO WITH YOUR RECORDED MIX + RANDOM COVER ART
        </div>
      </div>
    </div>
  );
}
