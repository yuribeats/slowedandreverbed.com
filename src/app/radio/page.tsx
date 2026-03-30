"use client";

import { useEffect, useRef, useState } from "react";

interface Track {
  id: string;
  url: string;
  artist: string;
  title: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const F = "Helvetica, Arial, sans-serif";

export default function RadioPage() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const startPosRef = useRef(0);

  const track = queue.length > 0 ? queue[idx] : null;

  // Fetch gallery, shuffle, and optionally resume from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const startId = params.get("id") || "";
    startPosRef.current = parseInt(params.get("t") || "0", 10) || 0;

    fetch("/api/gallery")
      .then((r) => r.json())
      .then((data) => {
        const items: Track[] = (data.items || []).map((i: { id: string; url: string; artist: string; title: string }) => ({
          id: i.id, url: i.url, artist: i.artist, title: i.title,
        }));
        if (startId) {
          const startIdx = items.findIndex((t) => t.id === startId);
          if (startIdx >= 0) {
            // Put the starting track first, shuffle the rest
            const rest = [...items.slice(0, startIdx), ...items.slice(startIdx + 1)];
            setQueue([items[startIdx], ...shuffle(rest)]);
          } else {
            setQueue(shuffle(items));
          }
        } else {
          setQueue(shuffle(items));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-play when queue loads
  useEffect(() => {
    if (queue.length > 0 && !playing) {
      setPlaying(true);
    }
  }, [queue.length]);

  // Load and play track
  useEffect(() => {
    if (!audioRef.current || !track) return;
    audioRef.current.src = track.url;
    audioRef.current.load();
    // Resume from position if first track from gallery handoff
    if (startPosRef.current > 0) {
      audioRef.current.currentTime = startPosRef.current;
      startPosRef.current = 0;
    }
    if (playing) audioRef.current.play().catch(() => {});
  }, [track?.id]);

  // Play/pause sync
  useEffect(() => {
    if (!audioRef.current || !track) return;
    if (playing) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [playing]);

  // MediaSession for iOS lock screen
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "SLOWED + REVERBED RADIO",
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => goTo(idx > 0 ? idx - 1 : queue.length - 1));
    navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
  }, [track?.id, idx, queue.length]);

  const nextTrack = () => {
    if (queue.length === 0) return;
    setIdx(Math.floor(Math.random() * queue.length));
    setPlaying(true);
  };

  const prevTrack = () => {
    if (queue.length === 0) return;
    setIdx(idx > 0 ? idx - 1 : queue.length - 1);
    setPlaying(true);
  };

  const goTo = (i: number) => {
    setIdx(i);
    setPlaying(true);
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const neg = s < 0;
    const abs = Math.abs(s);
    const m = Math.floor(abs / 60);
    const sec = Math.floor(abs % 60);
    return `${neg ? "-" : ""}${m}:${sec.toString().padStart(2, "0")}`;
  };

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  if (loading) {
    return (
      <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)" }}>
        <span style={{ fontFamily: F, fontWeight: 700, fontSize: 11, color: "#666", letterSpacing: "0.15em" }}>LOADING...</span>
      </div>
    );
  }

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#222",
    }}>
    <div style={{
      width: 240,
      maxWidth: 240,
      height: 400,
      maxHeight: 400,
      display: "flex",
      flexDirection: "column",
      background: "linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)",
      overflow: "hidden",
      userSelect: "none",
      borderRadius: 12,
      boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    }}>
      <audio
        ref={audioRef}
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={nextTrack}
      />

      {/* Screen */}
      <div style={{
        margin: "12px 12px 0 12px",
        background: "linear-gradient(180deg, #b8cfe0 0%, #96b4c8 50%, #7da0b8 100%)",
        border: "2px solid #555",
        padding: "8px 10px",
        flex: "0 0 auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, borderBottom: "1px solid rgba(0,0,0,0.15)", paddingBottom: 4 }}>
          <span style={{ fontSize: 9, fontFamily: F, fontWeight: 700, color: "#222" }}>
            {playing ? "NOW PLAYING" : "PAUSED"}
          </span>
          <span style={{ fontSize: 8, fontFamily: F, fontWeight: 700, color: "#444" }}>
            {queue.length > 0 ? `${idx + 1} OF ${queue.length}` : "EMPTY"}
          </span>
        </div>

        {track ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontFamily: F, fontWeight: 700, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {track.title.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {track.artist.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, fontFamily: F, fontWeight: 700, color: "#555", letterSpacing: "0.1em" }}>
                SLOWED + REVERBED RADIO
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{ height: 8, background: "rgba(0,0,0,0.12)", marginBottom: 4 }}
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

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, fontFamily: F, fontWeight: 700, color: "#333" }}>
                {fmt(progress)}
              </span>
              <span style={{ fontSize: 10, fontFamily: F, fontWeight: 700, color: "#333" }}>
                {fmt(progress - duration)}
              </span>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 11, fontFamily: F, fontWeight: 700, color: "#555" }}>NO TRACKS</span>
        )}
      </div>

      {/* Click wheel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
        <div style={{
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #d8d8d8 0%, #b8b8b8 100%)",
          border: "1px solid #999",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 2px 4px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.2)",
        }}>
          {/* Center - play/pause */}
          <button
            onClick={() => setPlaying(!playing)}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "linear-gradient(180deg, #eee 0%, #ccc 100%)",
              border: "1px solid #aaa",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontFamily: F,
              fontWeight: 700,
              color: "#333",
              zIndex: 2,
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          >
            {playing ? "| |" : ">"}
          </button>

          {/* MENU - top */}
          <button
            onClick={() => window.close()}
            style={{
              position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
              background: "transparent", border: "none",
              fontSize: 10, fontFamily: F, fontWeight: 700, color: "#555",
              letterSpacing: "0.1em",
            }}
          >
            MENU
          </button>

          {/* Prev - left */}
          <button
            onClick={prevTrack}
            style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: "none",
              fontSize: 16, fontFamily: F, fontWeight: 700, color: "#555",
            }}
          >
            |&lt;
          </button>

          {/* Next - right */}
          <button
            onClick={nextTrack}
            style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: "none",
              fontSize: 16, fontFamily: F, fontWeight: 700, color: "#555",
            }}
          >
            &gt;|
          </button>

          {/* Shuffle - bottom */}
          <span
            style={{
              position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, fontFamily: F, fontWeight: 700, color: "#555",
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
