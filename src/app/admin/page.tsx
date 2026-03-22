"use client";

import { useState } from "react";
import Link from "next/link";

interface Track {
  videoId: string;
  title: string;
  status: "pending" | "downloading" | "done" | "error";
  error?: string;
}

const textStyle: React.CSSProperties = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 700,
  color: "#000",
};

export default function AdminPage() {
  const [url, setUrl] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [fetching, setFetching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");

  async function fetchPlaylist() {
    if (!url.trim()) return;
    setFetching(true);
    setError("");
    setTracks([]);

    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "FAILED");
      setTracks(
        data.items.map((item: { videoId: string; title: string }) => ({
          ...item,
          status: "pending",
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "FAILED TO FETCH PLAYLIST");
    }
    setFetching(false);
  }

  async function downloadAll() {
    setDownloading(true);
    const total = tracks.filter((t) => t.status !== "done").length;
    setProgress({ current: 0, total });

    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].status === "done") continue;

      setTracks((prev) =>
        prev.map((t, idx) => (idx === i ? { ...t, status: "downloading" } : t))
      );

      try {
        const res = await fetch("/api/cobalt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${tracks[i].videoId}`,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const title = res.headers.get("X-Audio-Title") || tracks[i].title;
        const safeName = title.replace(/[^\w\s-]/g, "").trim() || "track";

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${safeName}.mp3`;
        a.click();
        URL.revokeObjectURL(a.href);

        setTracks((prev) =>
          prev.map((t, idx) => (idx === i ? { ...t, status: "done" } : t))
        );
        setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "DOWNLOAD FAILED";
        setTracks((prev) =>
          prev.map((t, idx) =>
            idx === i ? { ...t, status: "error", error: msg } : t
          )
        );
        setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }
    }

    setDownloading(false);
  }

  async function retrySingle(index: number) {
    const track = tracks[index];
    setTracks((prev) =>
      prev.map((t, idx) => (idx === index ? { ...t, status: "downloading", error: undefined } : t))
    );

    try {
      const res = await fetch("/api/cobalt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${track.videoId}`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const title = res.headers.get("X-Audio-Title") || track.title;
      const safeName = title.replace(/[^\w\s-]/g, "").trim() || "track";

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.mp3`;
      a.click();
      URL.revokeObjectURL(a.href);

      setTracks((prev) =>
        prev.map((t, idx) => (idx === index ? { ...t, status: "done" } : t))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "DOWNLOAD FAILED";
      setTracks((prev) =>
        prev.map((t, idx) =>
          idx === index ? { ...t, status: "error", error: msg } : t
        )
      );
    }
  }

  const doneCount = tracks.filter((t) => t.status === "done").length;
  const errorCount = tracks.filter((t) => t.status === "error").length;

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 sm:p-8"
      style={{ background: "#fff" }}
    >
      <div className="w-full max-w-[700px] flex flex-col gap-5">
        <div className="flex items-center gap-4 px-3">
          <span
            className="text-lg sm:text-xl tracking-[2px] uppercase"
            style={textStyle}
          >
            PLAYLIST DOWNLOADER
          </span>
          <div className="ml-auto">
            <Link
              href="/"
              className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black"
              style={{ ...textStyle, fontSize: "10px", background: "transparent" }}
            >
              BACK
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPlaylist()}
              placeholder="PASTE YOUTUBE PLAYLIST URL"
              className="flex-1 px-3 py-2 border-2 border-black text-[11px] uppercase tracking-wider outline-none"
              style={{ ...textStyle, fontSize: "11px", background: "transparent" }}
            />
            <button
              onClick={fetchPlaylist}
              disabled={fetching || !url.trim()}
              className="px-4 py-2 border-2 border-black text-[11px] uppercase tracking-wider"
              style={{
                ...textStyle,
                fontSize: "11px",
                background: fetching ? "#000" : "transparent",
                color: fetching ? "#fff" : "#000",
                opacity: !url.trim() ? 0.3 : 1,
              }}
            >
              {fetching ? "LOADING..." : "FETCH"}
            </button>
          </div>

          {error && (
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ ...textStyle, fontSize: "10px", color: "#c82828" }}
            >
              {error}
            </span>
          )}
        </div>

        {tracks.length > 0 && (
          <div className="flex flex-col gap-3 px-3">
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ ...textStyle, fontSize: "11px", opacity: 0.5 }}
              >
                {tracks.length} TRACKS
                {doneCount > 0 && ` / ${doneCount} DONE`}
                {errorCount > 0 && ` / ${errorCount} FAILED`}
              </span>
              <button
                onClick={downloadAll}
                disabled={downloading || doneCount === tracks.length}
                className="ml-auto px-4 py-2 border-2 border-black text-[11px] uppercase tracking-wider"
                style={{
                  ...textStyle,
                  fontSize: "11px",
                  background: downloading ? "#000" : "transparent",
                  color: downloading ? "#fff" : "#000",
                  opacity: doneCount === tracks.length ? 0.3 : 1,
                }}
              >
                {downloading
                  ? `DOWNLOADING ${progress.current}/${progress.total}`
                  : doneCount > 0 && doneCount < tracks.length
                  ? "DOWNLOAD REMAINING"
                  : "DOWNLOAD ALL"}
              </button>
            </div>

            <div className="flex flex-col border-2 border-black divide-y-2 divide-black">
              {tracks.map((track, i) => (
                <div
                  key={track.videoId}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{
                    background:
                      track.status === "done"
                        ? "#f0f0f0"
                        : track.status === "error"
                        ? "#fff5f5"
                        : "transparent",
                  }}
                >
                  <span
                    className="text-[10px] uppercase tracking-wider shrink-0 w-6 text-right"
                    style={{ ...textStyle, fontSize: "10px", opacity: 0.3 }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[11px] uppercase tracking-wider truncate flex-1"
                    style={{
                      ...textStyle,
                      fontSize: "11px",
                      opacity: track.status === "done" ? 0.4 : 1,
                    }}
                  >
                    {track.title}
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-wider shrink-0"
                    style={{
                      ...textStyle,
                      fontSize: "9px",
                      color:
                        track.status === "done"
                          ? "#228B22"
                          : track.status === "error"
                          ? "#c82828"
                          : track.status === "downloading"
                          ? "#000"
                          : "transparent",
                    }}
                  >
                    {track.status === "downloading"
                      ? "..."
                      : track.status === "done"
                      ? "DONE"
                      : track.status === "error"
                      ? track.error || "FAILED"
                      : ""}
                  </span>
                  {track.status === "error" && !downloading && (
                    <button
                      onClick={() => retrySingle(i)}
                      className="text-[9px] uppercase tracking-wider border border-black px-2 py-0.5 shrink-0"
                      style={{ ...textStyle, fontSize: "9px", background: "transparent" }}
                    >
                      RETRY
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
