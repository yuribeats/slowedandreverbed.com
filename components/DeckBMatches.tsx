"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRemixStore } from "../lib/remix-store";
import { getAudioContext } from "../lib/audio-context";
import { noteIndexToKeyName, getCompatibleKeys, camelotCode } from "../lib/camelot";
import MatchRow, { type MatchTrack } from "./MatchRow";

type SortMode = "popularity" | "bpm" | "random";

export default function DeckBMatches() {
  const deckA = useRemixStore((s) => s.deckA);
  const loadDeck = useRemixStore((s) => s.loadDeck);

  const [tracks, setTracks] = useState<MatchTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("popularity");
  const [bpmWindow, setBpmWindow] = useState(8);
  const [deckBLoading, setDeckBLoading] = useState(false);
  const [deckBError, setDeckBError] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const fetchedRef = useRef(false);

  const sourceKey = deckA.baseKey !== null && deckA.baseMode
    ? noteIndexToKeyName(deckA.baseKey, deckA.baseMode)
    : null;
  const sourceBPM = deckA.calculatedBPM;
  const sourceCamelot = sourceKey ? camelotCode(sourceKey) : "";

  // Fetch matches when Deck A key/BPM are known
  const fetchMatches = useCallback(async (pageNum: number, append: boolean) => {
    if (!sourceKey) return;
    setLoading(true);
    setError("");

    const compatKeys = getCompatibleKeys(sourceKey);

    const params = new URLSearchParams({
      keys: compatKeys.join(","),
      limit: "100",
      page: String(pageNum),
      sort: sortMode === "random" ? "popularity" : sortMode,
      dir: "desc",
      excludeArtist: deckA.artist,
      excludeTitle: deckA.title,
    });
    if (sourceBPM) {
      params.set("bpmMin", String(Math.round(sourceBPM - bpmWindow)));
      params.set("bpmMax", String(Math.round(sourceBPM + bpmWindow)));
    }

    try {
      const res = await fetch(`/api/everysong/match?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      let newTracks = (data.tracks ?? []) as MatchTrack[];

      // De-duplicate on artist+title
      const seen = new Set<string>();
      if (append) {
        tracks.forEach((t) => seen.add(`${t.artist.toLowerCase()}|${t.title.toLowerCase()}`));
      }
      newTracks = newTracks.filter((t) => {
        const k = `${t.artist.toLowerCase()}|${t.title.toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (sortMode === "random") {
        for (let i = newTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newTracks[i], newTracks[j]] = [newTracks[j], newTracks[i]];
        }
      }

      setTracks(append ? [...tracks, ...newTracks] : newTracks);
      setHasMore(data.hasMore ?? false);
      setPage(pageNum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "MATCH SEARCH FAILED");
    }
    setLoading(false);
  }, [sourceKey, sourceBPM, bpmWindow, sortMode, deckA.artist, deckA.title, tracks]);

  // Initial fetch
  useEffect(() => {
    if (sourceKey && sourceBPM && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchMatches(0, false);
    }
  }, [sourceKey, sourceBPM]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on sort/bpm change
  const handleRefetch = useCallback(() => {
    fetchedRef.current = true;
    fetchMatches(0, false);
  }, [fetchMatches]);

  const handleLoadDeckB = useCallback(async () => {
    if (selectedIdx === null) return;
    const track = tracks[selectedIdx];
    if (!track) return;
    setDeckBLoading(true);
    setDeckBError("");
    try {
      getAudioContext();
      await loadDeck("B", track.artist, track.title);
    } catch (e) {
      setDeckBError(e instanceof Error ? e.message : "LOAD FAILED");
      setTimeout(() => setDeckBError(""), 4000);
    }
    setDeckBLoading(false);
  }, [selectedIdx, tracks, loadDeck]);

  const selectedTrack = selectedIdx !== null ? tracks[selectedIdx] : null;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Deck A summary */}
      <div className="console flex flex-col gap-3 boot-stagger boot-delay-1">
        <div className="flex items-center gap-4 px-3">
          <div className="w-6 h-6 border-[3px] border-[var(--text-dark)] rounded-[4px] relative">
            <div className="absolute inset-[4px] bg-[var(--text-dark)]" />
          </div>
          <span className="text-lg sm:text-xl tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}>
            SLOWED AND REVERBED MACHINE
          </span>
        </div>
        <div className="zone-inset">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", fontWeight: 700 }}>
                DECK A
              </span>
              <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>
                ARTIST: {deckA.artist}
              </span>
              <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>
                TITLE: {deckA.title}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>
                BPM: {sourceBPM ? Math.round(sourceBPM) : "—"}
              </span>
              <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>
                KEY: {sourceKey ? sourceKey.toUpperCase() : "—"} {sourceCamelot && `(${sourceCamelot})`}
              </span>
              <div className="flex gap-1">
                {deckA.stemBuffers && (
                  <span className="text-[10px] tracking-[0.5px] uppercase px-1.5 py-0.5" style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)", border: "1px solid var(--crt-dim)" }}>
                    STEMS
                  </span>
                )}
                {deckA.downbeatGrid && (
                  <span className="text-[10px] tracking-[0.5px] uppercase px-1.5 py-0.5" style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)", border: "1px solid var(--crt-dim)" }}>
                    DOWNBEAT
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deck B match browser */}
      <div className="console flex flex-col gap-4 boot-stagger boot-delay-2">
        <div className="zone-inset flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", fontWeight: 700 }}>
              DECK B — SELECT A MATCH
            </span>
            <span className="text-[11px] tracking-[0.5px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>
              {tracks.length} RESULTS
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>SORT:</span>
              {(["popularity", "bpm", "random"] as SortMode[]).map((s) => (
                <button
                  key={s}
                  onClick={() => { setSortMode(s); setTimeout(handleRefetch, 0); }}
                  className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border"
                  style={{
                    fontFamily: "var(--font-tech)",
                    color: "var(--text-dark)",
                    background: sortMode === s ? "rgba(255,115,0,0.15)" : "transparent",
                    borderColor: sortMode === s ? "#333" : "#777",
                  }}
                >
                  {s === "popularity" ? "POP" : s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>BPM ±</span>
              <input
                type="number"
                value={bpmWindow}
                onChange={(e) => setBpmWindow(Math.max(1, Math.min(30, parseInt(e.target.value) || 8)))}
                onBlur={handleRefetch}
                onKeyDown={(e) => e.key === "Enter" && handleRefetch()}
                className="tactical-input w-[50px] text-center"
                style={{ fontSize: "12px", padding: "4px" }}
              />
            </div>
          </div>

          {/* Track list */}
          <div
            className="flex flex-col overflow-y-auto"
            style={{
              maxHeight: "400px",
              background: "rgba(0,0,0,0.05)",
              borderRadius: "4px",
              border: "1px solid rgba(0,0,0,0.15)",
            }}
          >
            {/* Header row */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgba(0,0,0,0.2)]" style={{ background: "rgba(0,0,0,0.05)" }}>
              <span className="flex-1 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>ARTIST — TITLE</span>
              <span className="text-[10px] uppercase tracking-[0.1em] w-[40px] text-right" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>BPM</span>
              <span className="text-[10px] uppercase tracking-[0.1em] w-[70px] text-right" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>KEY</span>
              <span className="text-[10px] uppercase tracking-[0.1em] w-[24px] text-center" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>CAM</span>
              <span className="text-[10px] uppercase tracking-[0.1em] w-[80px] text-right hidden sm:block" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>WHY</span>
            </div>

            {loading && tracks.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[12px] tracking-[2px] uppercase" style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)", animation: "pulse 1.5s infinite" }}>
                  SEARCHING MATCHES...
                </span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>
                  NO MATCHES FOUND
                </span>
              </div>
            ) : (
              <>
                {tracks.map((t, i) => (
                  <MatchRow
                    key={`${t.artist}-${t.title}-${i}`}
                    track={t}
                    sourceKey={sourceKey ?? ""}
                    selected={selectedIdx === i}
                    onClick={() => setSelectedIdx(i)}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={() => fetchMatches(page + 1, true)}
                    disabled={loading}
                    className="py-2 text-center text-[11px] uppercase tracking-[1px]"
                    style={{
                      color: "var(--text-dark)",
                      fontFamily: "var(--font-tech)",
                      background: "transparent",
                      border: "none",
                      opacity: loading ? 0.3 : 0.6,
                    }}
                  >
                    {loading ? "LOADING..." : "LOAD MORE"}
                  </button>
                )}
              </>
            )}
          </div>

          {error && (
            <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--led-red-on, #c82828)", fontFamily: "var(--font-tech)" }}>
              {error}
            </span>
          )}

          {/* Load to Deck B */}
          <div className="flex items-center justify-between">
            {selectedTrack ? (
              <span className="text-[12px] tracking-[0.5px] uppercase truncate flex-1 mr-3" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>
                {selectedTrack.artist} — {selectedTrack.title}
              </span>
            ) : (
              <span className="text-[12px] tracking-[0.5px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.4 }}>
                SELECT A TRACK ABOVE
              </span>
            )}
            <button
              onClick={handleLoadDeckB}
              disabled={selectedIdx === null || deckBLoading}
              className="tactical-button shrink-0"
              style={{ opacity: selectedIdx === null ? 0.3 : 1 }}
            >
              {deckBLoading ? "LOADING..." : "LOAD → DECK B"}
            </button>
          </div>

          {deckBError && (
            <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--led-red-on, #c82828)", fontFamily: "var(--font-tech)" }}>
              {deckBError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
