"use client";

import { useRef, useState } from "react";
import { generateCover } from "../lib/cover-generator";
import { encodeMP3 } from "@yuribeats/audio-utils";
import { getAudioContext } from "../lib/audio-context";

interface Props {
  audioBlob: Blob;
  defaultFilename: string;
  initialArtist?: string;
  initialTitle?: string;
  onClose: () => void;
}

const STEPS = [
  "PREPARING AUDIO...",
  "UPLOADING AUDIO...",
  "GENERATING VIDEO...",
  "DOWNLOADING...",
  "DONE",
] as const;

async function blobToMP3(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = getAudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
  return encodeMP3(decoded, 128);
}

export default function ExportVideoModalRemix({ audioBlob, defaultFilename, initialArtist = "", initialTitle = "", onClose }: Props) {
  const [artist, setArtist] = useState(initialArtist);
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customImageName, setCustomImageName] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const pointerDownOnBackdrop = useRef(false);

  const progress = step < 0 ? 0 : Math.min(((step + 1) / STEPS.length) * 100, 100);
  const status = step >= 0 && step < STEPS.length ? STEPS[step] : "";

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomImage(URL.createObjectURL(file));
    setCustomImageName(file.name);
  };

  const handleExport = async () => {
    if (!artist.trim() || !title.trim()) return;

    setExporting(true);
    setError("");

    try {
      // Step 0: encode audio to MP3 and generate cover in parallel
      setStep(0);
      const artistUpper = artist.trim().toUpperCase();
      const titleUpper = title.trim().toUpperCase();
      const [mp3Blob, coverBlob] = await Promise.all([
        blobToMP3(audioBlob),
        generateCover(artistUpper, titleUpper, customImage || undefined),
      ]);

      // Step 1: upload MP3 directly to Pinata via a signed URL. Sidesteps Vercel's
      // 4.5MB serverless body limit — full songs routinely exceed that inline.
      setStep(1);
      const urlRes = await fetch("/api/pinata-upload-url", { method: "POST" });
      if (!urlRes.ok) throw new Error("FAILED TO GET UPLOAD URL");
      const { url: uploadUrl } = await urlRes.json();
      const uploadForm = new FormData();
      uploadForm.append("file", mp3Blob, "audio.mp3");
      const uploadRes = await fetch(uploadUrl, { method: "POST", body: uploadForm });
      if (!uploadRes.ok) throw new Error("AUDIO UPLOAD FAILED");
      const uploadData = await uploadRes.json();
      const audioCid = uploadData.data?.cid || uploadData.cid;
      if (!audioCid) throw new Error("UPLOAD RETURNED NO CID");

      // Step 2: Generate video — pass CID instead of audio bytes
      setStep(2);
      const formData = new FormData();
      formData.append("audioCid", audioCid);
      formData.append("image", coverBlob, "cover.png");
      formData.append("artist", artistUpper);
      formData.append("title", titleUpper);
      formData.append("watermark", "true");

      const res = await fetch("/api/generate-video", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const json = JSON.parse(text);
          msg = json.error || text;
        } catch {}
        throw new Error(msg.substring(0, 200) || `SERVER ${res.status}`);
      }

      // Step 3: save the video bytes returned in the response
      setStep(3);
      const videoBlob = await res.blob();
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${defaultFilename.toUpperCase()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Step 4: Done
      setStep(4);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      console.error("[EXPORT] Error:", e);
      setError(e instanceof Error ? e.message : "FAILED");
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onPointerDown={(e) => { pointerDownOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pointerDownOnBackdrop.current && e.target === e.currentTarget && !exporting) onClose(); }}
    >
      <div className="console w-full max-w-[440px] mx-4 p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
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
              className="text-[13px] uppercase tracking-wider border border-[#333] px-2 py-1"
              style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", background: "transparent" }}
            >
              CLOSE
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[13px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
            ARTIST
          </span>
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            disabled={exporting}
            placeholder="ARTIST NAME"
            className="bg-transparent border border-[#333] px-3 py-2 text-[16px] uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", outline: "none" }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[13px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
            TITLE
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={exporting}
            placeholder="TRACK TITLE"
            className="bg-transparent border border-[#333] px-3 py-2 text-[16px] uppercase tracking-wider"
            style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", outline: "none" }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[13px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
            COVER IMAGE (OPTIONAL)
          </span>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={exporting}
            className="bg-transparent border border-[#333] px-3 py-2 text-[14px] uppercase tracking-wider text-left"
            style={{ fontFamily: "var(--font-tech)", color: customImage ? "var(--accent-gold)" : "var(--text-dark)", outline: "none" }}
          >
            {customImage ? customImageName.toUpperCase() : "RANDOM (CLICK TO UPLOAD)"}
          </button>
          {customImage && (
            <button
              onClick={() => { setCustomImage(null); setCustomImageName(""); }}
              className="text-[12px] uppercase tracking-wider self-start"
              style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", opacity: 0.5, background: "transparent", border: "none", padding: 0 }}
            >
              CLEAR
            </button>
          )}
        </div>

        {/* Progress bar */}
        {exporting && (
          <div className="flex flex-col gap-2">
            <div
              className="relative h-[6px] w-full"
              style={{ background: "#1a1a1a", boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.6)" }}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${progress}%`,
                  background: "var(--accent-gold)",
                  transition: "width 0.4s ease-out",
                }}
              />
            </div>
            <span
              className="text-[13px] uppercase tracking-wider text-center"
              style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)" }}
            >
              {status}
            </span>
          </div>
        )}

        {!exporting && (
          <button
            onClick={handleExport}
            disabled={!artist.trim() || !title.trim()}
            className="border-2 border-[var(--accent-gold)] px-4 py-3 text-[15px] uppercase tracking-wider disabled:opacity-30"
            style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", background: "transparent" }}
          >
            EXPORT MP4
          </button>
        )}

        {error && (
          <div className="text-[13px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "#c82828" }}>
            ERROR: {error}
          </div>
        )}

        <div className="text-[12px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>
          GENERATES A VIDEO WITH YOUR MIX + COVER ART
        </div>
      </div>
    </div>
  );
}
