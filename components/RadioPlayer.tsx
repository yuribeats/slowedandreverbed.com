"use client";

import { useEffect, useRef, useState } from "react";
import { useRadioStore } from "../lib/radio-store";

export default function RadioPlayer() {
  const queue = useRadioStore((s) => s.queue);
  const currentIndex = useRadioStore((s) => s.currentIndex);
  const isPlaying = useRadioStore((s) => s.isPlaying);
  const pause = useRadioStore((s) => s.pause);
  const resume = useRadioStore((s) => s.resume);
  const next = useRadioStore((s) => s.next);
  const prev = useRadioStore((s) => s.prev);
  const close = useRadioStore((s) => s.close);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const track = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  useEffect(() => {
    if (!audioRef.current || !track) return;
    audioRef.current.src = track.url;
    audioRef.current.load();
    if (isPlaying) audioRef.current.play().catch(() => {});
  }, [track?.id]);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  if (!track) return null;

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.floor(Math.abs(s) % 60);
    return `${s < 0 ? "-" : ""}${m}:${sec.toString().padStart(2, "0")}`;
  };

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  // Minimized: thin bar at bottom
  if (!expanded) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[100]"
        style={{ background: "#f0f0f0", borderTop: "1px solid #ccc" }}
        onMouseEnter={() => setExpanded(true)}
        onClick={() => setExpanded(true)}
      >
        <audio
          ref={audioRef}
          onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onEnded={() => next()}
        />
        {/* Progress line */}
        <div style={{ height: 2, background: "#ccc" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#3a7bd5" }} />
        </div>
        <div className="flex items-center gap-3 px-4 py-1.5">
          <span style={{ color: isPlaying ? "#111" : "#999", fontSize: 10, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, letterSpacing: "0.15em" }}>
            {isPlaying ? "NOW PLAYING" : "PAUSED"}
          </span>
          <span className="truncate" style={{ color: "#555", fontSize: 10, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, letterSpacing: "0.1em", flex: 1 }}>
            {track.artist} — {track.title}
          </span>
          <span style={{ color: "#999", fontSize: 10, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}>
            {currentIndex + 1}/{queue.length}
          </span>
        </div>
      </div>
    );
  }

  // Expanded: iPod-inspired player
  return (
    <div
      className="fixed bottom-0 right-0 z-[100]"
      style={{ margin: 16 }}
      onMouseLeave={() => setExpanded(false)}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => next()}
      />

      <div style={{
        width: 220,
        background: "linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)",
        border: "2px solid #999",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}>
        {/* Screen */}
        <div style={{
          margin: "10px 10px 0 10px",
          background: "linear-gradient(180deg, #b8cfe0 0%, #96b4c8 50%, #7da0b8 100%)",
          border: "2px solid #555",
          padding: "6px 8px",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, borderBottom: "1px solid rgba(0,0,0,0.15)", paddingBottom: 3 }}>
            <span style={{ fontSize: 9, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#222" }}>
              NOW PLAYING
            </span>
            <span style={{ fontSize: 8, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#444" }}>
              {currentIndex + 1} OF {queue.length}
            </span>
          </div>

          {/* Track info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {track.title.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {track.artist.toUpperCase()}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: "rgba(0,0,0,0.15)", marginBottom: 3 }}
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
            }}
          >
            <div style={{
              width: `${pct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #3a7bd5, #5a9be5)",
            }} />
          </div>

          {/* Times */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#333" }}>
              {fmt(progress)}
            </span>
            <span style={{ fontSize: 9, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#333" }}>
              {fmt(progress - duration)}
            </span>
          </div>
        </div>

        {/* Click wheel */}
        <div style={{ padding: "12px 10px 14px 10px", display: "flex", justifyContent: "center" }}>
          <div style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #d8d8d8 0%, #b8b8b8 100%)",
            border: "1px solid #999",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.2)",
          }}>
            {/* Center button - play/pause */}
            <button
              onClick={() => isPlaying ? pause() : resume()}
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "linear-gradient(180deg, #eee 0%, #ccc 100%)",
                border: "1px solid #aaa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 700,
                color: "#333",
                zIndex: 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            >
              {isPlaying ? "| |" : ">"}
            </button>

            {/* MENU - top */}
            <button
              onClick={close}
              style={{
                position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
                background: "transparent", border: "none",
                fontSize: 9, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#555",
                letterSpacing: "0.1em",
              }}
            >
              MENU
            </button>

            {/* Prev - left */}
            <button
              onClick={prev}
              style={{
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none",
                fontSize: 14, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#555",
              }}
            >
              |&lt;
            </button>

            {/* Next - right */}
            <button
              onClick={next}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none",
                fontSize: 14, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#555",
              }}
            >
              &gt;|
            </button>

            {/* Shuffle indicator - bottom */}
            <span
              style={{
                position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
                fontSize: 8, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#555",
                letterSpacing: "0.1em",
              }}
            >
              SHUFFLE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
