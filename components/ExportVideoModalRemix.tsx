"use client";

import { useState } from "react";
import { generateCover } from "../lib/cover-generator";

interface Props {
  audioBlob: Blob;
  defaultFilename: string;
  onClose: () => void;
}

async function uploadToPinata(blob: Blob, filename: string): Promise<string> {
  // Get signed upload URL from our server
  const urlRes = await fetch("/api/pinata-upload-url", { method: "POST" });
  if (!urlRes.ok) throw new Error("Failed to get upload URL");
  const { url } = await urlRes.json();

  // Upload directly to Pinata using signed URL
  const formData = new FormData();
  formData.append("file", blob, filename);

  const uploadRes = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Pinata upload failed: ${uploadRes.status} ${text.substring(0, 100)}`);
  }

  const data = await uploadRes.json();
  return data.data?.cid || data.cid;
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
      // Step 1: Generate cover image
      setStatus("GENERATING COVER...");
      console.log("[EXPORT] Generating cover...");
      const coverBlob = await generateCover(artist.trim(), title.trim());
      console.log("[EXPORT] Cover:", coverBlob.size, "bytes");

      // Step 2: Upload audio and image to Pinata directly
      setStatus("UPLOADING AUDIO...");
      console.log("[EXPORT] Uploading audio:", audioBlob.size, "bytes");
      const audioCid = await uploadToPinata(audioBlob, "audio.wav");
      console.log("[EXPORT] Audio CID:", audioCid);

      setStatus("UPLOADING COVER...");
      console.log("[EXPORT] Uploading cover...");
      const imageCid = await uploadToPinata(coverBlob, "cover.png");
      console.log("[EXPORT] Image CID:", imageCid);

      // Step 3: Generate video (server downloads from Pinata, runs ffmpeg)
      setStatus("GENERATING VIDEO...");
      console.log("[EXPORT] Generating video...");
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioCid,
          imageCid,
          artist: artist.trim(),
          title: title.trim(),
        }),
      });

      const text = await res.text();
      console.log("[EXPORT] Response:", res.status, text.substring(0, 200));
      if (!res.ok) {
        throw new Error(`SERVER ${res.status}: ${text.substring(0, 100)}`);
      }
      const data = JSON.parse(text);

      // Step 4: Download
      setStatus("DOWNLOADING...");
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `${defaultFilename}.mp4`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus("DONE");
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
