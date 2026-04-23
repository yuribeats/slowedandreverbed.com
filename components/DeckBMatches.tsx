"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRemixStore } from "../lib/remix-store";
import { getAudioContext } from "../lib/audio-context";
import { noteIndexToKeyName, getCompatibleKeys } from "../lib/camelot";
import MatchRow, { type MatchTrack } from "./MatchRow";

type SortMode = "popularity" | "bpm" | "random";

const ALL_KEYS = [
  "C Major", "Db Major", "D Major", "Eb Major", "E Major", "F Major",
  "Gb Major", "G Major", "Ab Major", "A Major", "Bb Major", "B Major",
  "C Minor", "Db Minor", "D Minor", "Eb Minor", "E Minor", "F Minor",
  "Gb Minor", "G Minor", "Ab Minor", "A Minor", "Bb Minor", "B Minor",
];

export default function DeckBMatches() {
  const deckA = useRemixStore((s) => s.deckA);
  const loadDeck = useRemixStore((s) => s.loadDeck);
  const loadFromYouTube = useRemixStore((s) => s.loadFromYouTube);
  const loadFile = useRemixStore((s) => s.loadFile);

  const [tracks, setTracks] = useState<MatchTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausting, setExhausting] = useState(false);
  const [error, setError] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [sortMode] = useState<SortMode>("popularity");
  const [bpmWindow, setBpmWindow] = useState(10);
  const [semitoneWindow, setSemitoneWindow] = useState(3);
  const [deckBLoading, setDeckBLoading] = useState(false);
  const [deckBError, setDeckBError] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [manualLoadError, setManualLoadError] = useState("");
  const [pitchMatch, setPitchMatch] = useState(false);
  const fetchedRef = useRef(false);
  const exhaustTokenRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable key/BPM — auto-populated from Deck A
  const deckAKey = deckA.baseKey !== null && deckA.baseMode
    ? noteIndexToKeyName(deckA.baseKey, deckA.baseMode)
    : null;
  const [searchKey, setSearchKey] = useState<string>("");
  const [searchBPM, setSearchBPM] = useState<string>("");
  const initializedRef = useRef(false);

  // Auto-populate from Deck A when values arrive
  useEffect(() => {
    if (deckAKey && !initializedRef.current) {
      setSearchKey(deckAKey);
    }
  }, [deckAKey]);
  useEffect(() => {
    if (deckA.calculatedBPM && !initializedRef.current) {
      setSearchBPM(String(Math.round(deckA.calculatedBPM * 10) / 10));
    }
  }, [deckA.calculatedBPM]);

  const sourceKey = searchKey || null;
  const sourceBPM = parseFloat(searchBPM) || null;

  const fetchPage = useCallback(async (
    pageNum: number,
    opts: { key: string; bpm: number; bpmWin: number; sort: SortMode; pmRange: number; pm: boolean },
    seen: Set<string>,
  ) => {
    const compatKeys = getCompatibleKeys(opts.key);
    const params = new URLSearchParams({
      keys: compatKeys.join(","),
      limit: "100",
      page: String(pageNum),
      sort: opts.sort === "random" ? "popularity" : opts.sort,
      dir: "desc",
      excludeArtist: deckA.artist,
      excludeTitle: deckA.title,
    });
    params.set("bpmMin", String(Math.round(opts.bpm - opts.bpmWin)));
    params.set("bpmMax", String(Math.round(opts.bpm + opts.bpmWin)));

    const res = await fetch(`/api/everysong/match?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    let pageTracks = (data.tracks ?? []) as MatchTrack[];
    pageTracks = pageTracks.filter((t) => {
      const k = `${t.artist.toLowerCase()}|${t.title.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (opts.sort === "random") {
      for (let i = pageTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pageTracks[i], pageTracks[j]] = [pageTracks[j], pageTracks[i]];
      }
    }

    const pmTracks: MatchTrack[] = [];
    if (opts.pm && pageNum === 0 && opts.key) {
      try {
        const pmParams = new URLSearchParams({
          key: opts.key,
          bpmMin: String(Math.round(opts.bpm - opts.bpmWin)),
          bpmMax: String(Math.round(opts.bpm + opts.bpmWin)),
          range: String(opts.pmRange),
          limit: "20",
        });
        const pmRes = await fetch(`/api/everysong/pitch-match?${pmParams}`);
        if (pmRes.ok) {
          const pmData = await pmRes.json();
          for (const bucket of (pmData.results ?? [])) {
            for (const t of (bucket.tracks ?? [])) {
              const k = `${(t.artist as string).toLowerCase()}|${(t.title as string).toLowerCase()}`;
              if (!seen.has(k)) {
                seen.add(k);
                pmTracks.push({ ...t, shift: bucket.shift } as MatchTrack);
              }
            }
          }
        }
      } catch { /* pitch-match is optional */ }
    }

    return { pageTracks: [...pageTracks, ...pmTracks], hasMore: Boolean(data.hasMore) };
  }, [deckA.artist, deckA.title]);

  const runSearch = useCallback(async () => {
    if (!sourceKey || !sourceBPM) return;
    initializedRef.current = true;
    fetchedRef.current = true;

    // Invalidate any in-flight exhaust loop from a previous query
    const token = ++exhaustTokenRef.current;
    setLoading(true);
    setExhausting(false);
    setError("");

    const opts = { key: sourceKey, bpm: sourceBPM, bpmWin: bpmWindow, sort: sortMode, pmRange: semitoneWindow, pm: pitchMatch };
    const seen = new Set<string>();
    try {
      const first = await fetchPage(0, opts, seen);
      if (token !== exhaustTokenRef.current) return;
      setTracks(first.pageTracks);
      setSelectedIdx(null);
      setLoading(false);

      if (!first.hasMore) return;
      setExhausting(true);

      for (let page = 1; ; page++) {
        if (token !== exhaustTokenRef.current) return;
        const next = await fetchPage(page, opts, seen);
        if (token !== exhaustTokenRef.current) return;
        if (next.pageTracks.length > 0) {
          setTracks((prev) => [...prev, ...next.pageTracks]);
        }
        if (!next.hasMore) break;
      }
    } catch (e) {
      if (token !== exhaustTokenRef.current) return;
      setError(e instanceof Error ? e.message : "MATCH SEARCH FAILED");
      setLoading(false);
    } finally {
      if (token === exhaustTokenRef.current) setExhausting(false);
    }
  }, [sourceKey, sourceBPM, bpmWindow, sortMode, semitoneWindow, pitchMatch, fetchPage]);

  // Initial fetch — trigger when BOTH key AND BPM are available
  useEffect(() => {
    if (sourceKey && sourceBPM && !fetchedRef.current) {
      runSearch();
    }
  }, [sourceKey, sourceBPM, runSearch]);

  const handleRefetch = useCallback(() => {
    runSearch();
  }, [runSearch]);

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

  const handleManualSearch = useCallback(async () => {
    if (!manualArtist && !manualTitle) return;
    setLoading(true);
    setError("");
    try {
      const q = [manualArtist.trim(), manualTitle.trim()].filter(Boolean).join(" ");
      const res = await fetch(`/api/everysong/search?q=${encodeURIComponent(q)}&limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newTracks = ((data.results ?? []) as MatchTrack[]);
      if (newTracks.length === 0) {
        setError("NO RESULTS");
        setTimeout(() => setError(""), 3000);
      } else {
        setTracks(newTracks);
        setSelectedIdx(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "SEARCH FAILED");
    }
    setLoading(false);
  }, [manualArtist, manualTitle]);

  const handleYTLoad = useCallback(async () => {
    const url = ytUrl.trim();
    if (!url) return;
    setDeckBLoading(true);
    setManualLoadError("");
    try {
      getAudioContext();
      await loadFromYouTube("B", url);
    } catch (e) {
      setManualLoadError(e instanceof Error ? e.message : "LOAD FAILED");
      setTimeout(() => setManualLoadError(""), 4000);
    }
    setDeckBLoading(false);
  }, [ytUrl, loadFromYouTube]);

  const handleLocalFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setDeckBLoading(true);
    setManualLoadError("");
    try {
      getAudioContext();
      await loadFile("B", file);
    } catch (e) {
      setManualLoadError(e instanceof Error ? e.message : "LOAD FAILED");
      setTimeout(() => setManualLoadError(""), 4000);
    }
    setDeckBLoading(false);
  }, [loadFile]);

  const selectedTrack = selectedIdx !== null ? tracks[selectedIdx] : null;
  const resultLabel = exhausting ? `${tracks.length} RESULTS (LOADING…)` : `${tracks.length} RESULTS`;

  return (
    <div className="console flex flex-col gap-4 boot-stagger boot-delay-3">
      <div className="zone-inset flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", fontWeight: 700 }}>
            DECK B — SELECT A MATCH
          </span>
          <span className="text-[11px] tracking-[0.5px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.5 }}>
            {resultLabel}
          </span>
        </div>

        {/* CRT selected-match readout — parity with deck displays */}
        <div className="display-bezel flex items-center gap-3 p-3">
          <div
            className="flex-1 text-[12px] truncate crt-text"
            style={{ color: selectedTrack ? "var(--crt-bright)" : "var(--crt-dim)", fontFamily: "var(--font-crt)", fontSize: "12px" }}
          >
            {selectedTrack ? (
              <>
                <span style={{ opacity: 0.7 }}>{selectedTrack.artist.toUpperCase()}</span>
                {" — "}
                {selectedTrack.title.toUpperCase()}
              </>
            ) : (
              "NO MATCH SELECTED"
            )}
          </div>
          <button
            onClick={handleLoadDeckB}
            disabled={selectedIdx === null || deckBLoading}
            className="shrink-0 text-[12px] tracking-[1px] uppercase crt-text"
            style={{
              fontFamily: "var(--font-crt)",
              color: selectedIdx === null ? "var(--crt-dim)" : "var(--crt-bright)",
              background: "var(--crt-bg)",
              border: "1px solid var(--crt-dim)",
              padding: "4px 10px",
              borderRadius: "4px",
              opacity: selectedIdx === null ? 0.5 : 1,
            }}
          >
            {deckBLoading ? "LOADING..." : "LOAD → DECK B"}
          </button>
        </div>

        {deckBError && (
          <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--led-red-on, #c82828)", fontFamily: "var(--font-tech)" }}>
            {deckBError}
          </span>
        )}

        {/* Key (+ ± semitone window) and BPM (+ ± window) grouped together */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[1px] uppercase shrink-0" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>KEY</span>
            <select
              value={searchKey}
              onChange={(e) => { setSearchKey(e.target.value); setTimeout(handleRefetch, 0); }}
              className="tactical-input uppercase"
              style={{ fontSize: "11px", padding: "3px 6px", appearance: "none", WebkitAppearance: "none" }}
            >
              <option value="">—</option>
              {ALL_KEYS.map((k) => (
                <option key={k} value={k}>{k.toUpperCase()}</option>
              ))}
            </select>
            <span className="text-[10px] tracking-[1px] uppercase ml-1" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>KEY ±</span>
            <input
              type="number"
              value={semitoneWindow}
              onChange={(e) => setSemitoneWindow(Math.max(1, Math.min(12, parseInt(e.target.value) || 3)))}
              onBlur={handleRefetch}
              onKeyDown={(e) => e.key === "Enter" && handleRefetch()}
              className="tactical-input w-[50px] text-center"
              style={{ fontSize: "12px", padding: "4px" }}
              title="Semitone range for PITCH MATCH"
            />
            <span className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.45 }}>ST</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[1px] uppercase shrink-0" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>BPM</span>
            <input
              type="number"
              value={searchBPM}
              onChange={(e) => setSearchBPM(e.target.value)}
              onBlur={handleRefetch}
              onKeyDown={(e) => e.key === "Enter" && handleRefetch()}
              className="tactical-input w-[65px] text-center"
              style={{ fontSize: "11px", padding: "3px 6px" }}
            />
            <span className="text-[10px] tracking-[1px] uppercase ml-1" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>BPM ±</span>
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
          <button
            onClick={() => { setPitchMatch(!pitchMatch); setTimeout(handleRefetch, 0); }}
            className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border"
            style={{
              fontFamily: "var(--font-tech)",
              color: "var(--text-dark)",
              background: pitchMatch ? "rgba(255,115,0,0.15)" : "transparent",
              borderColor: pitchMatch ? "#333" : "#777",
            }}
          >
            PITCH MATCH
          </button>
        </div>

        {/* Track list — CRT styled */}
        <div
          className="display-bezel p-0 overflow-hidden"
          style={{ padding: "6px" }}
        >
          <div
            className="flex flex-col overflow-y-auto"
            style={{
              maxHeight: "400px",
              background: "var(--crt-bg)",
              borderRadius: "6px",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header row */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgba(117,204,70,0.18)] sticky top-0 z-10"
              style={{ background: "var(--crt-bg)", fontFamily: "var(--font-crt)" }}
            >
              <span className="flex-1 text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--crt-dim)", opacity: 0.7 }}>ARTIST / TITLE</span>
              <span className="text-[11px] uppercase tracking-[0.1em] w-[40px] text-right" style={{ color: "var(--crt-dim)", opacity: 0.7 }}>BPM</span>
              <span className="text-[11px] uppercase tracking-[0.1em] w-[70px] text-right" style={{ color: "var(--crt-dim)", opacity: 0.7 }}>KEY</span>
              <span className="text-[11px] uppercase tracking-[0.1em] w-[90px] text-right hidden sm:block" style={{ color: "var(--crt-dim)", opacity: 0.7 }}>MATCH</span>
            </div>

            {loading && tracks.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[12px] tracking-[2px] uppercase crt-text" style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)" }}>
                  SEARCHING MATCHES...
                </span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--crt-dim)", fontFamily: "var(--font-crt)", opacity: 0.6 }}>
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
                {exhausting && (
                  <div className="py-2 text-center text-[11px] uppercase tracking-[1px]" style={{ color: "var(--crt-dim)", fontFamily: "var(--font-crt)", opacity: 0.6 }}>
                    LOADING MORE…
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <span className="text-[12px] tracking-[1px] uppercase" style={{ color: "var(--led-red-on, #c82828)", fontFamily: "var(--font-tech)" }}>
            {error}
          </span>
        )}

        {/* Manual artist/title search — adds to match list */}
        <div className="zone-engraved flex flex-col gap-2">
          <span className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>SEARCH BY ARTIST / TITLE</span>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[1px]" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>ARTIST</span>
              <input
                value={manualArtist}
                onChange={(e) => setManualArtist(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                className="w-full bg-transparent border border-[#555] px-3 py-1.5 text-[11px] tracking-[1px] outline-none focus:border-[#888]"
                style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}
              />
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[1px]" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>TITLE</span>
              <input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                className="w-full bg-transparent border border-[#555] px-3 py-1.5 text-[11px] tracking-[1px] outline-none focus:border-[#888]"
                style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={handleManualSearch}
                disabled={loading || (!manualArtist && !manualTitle)}
                className="tactical-button"
                style={{ opacity: (!manualArtist && !manualTitle) ? 0.3 : 1 }}
              >
                {loading ? "..." : "SEARCH"}
              </button>
            </div>
          </div>
        </div>

        {/* YouTube URL — direct deck B load */}
        <div className="zone-engraved flex flex-col gap-2">
          <span className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>
            YOUTUBE URL → DECK B
          </span>
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[1px]" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>URL</span>
              <input
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleYTLoad()}
                placeholder="https://www.youtube.com/watch?v=…"
                className="w-full bg-transparent border border-[#555] px-3 py-1.5 text-[11px] tracking-[1px] outline-none focus:border-[#888]"
                style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}
              />
            </div>
            <button
              onClick={handleYTLoad}
              disabled={!ytUrl.trim() || deckBLoading}
              className="tactical-button"
              style={{ opacity: (!ytUrl.trim() || deckBLoading) ? 0.3 : 1 }}
            >
              {deckBLoading ? "…" : "LOAD"}
            </button>
          </div>
        </div>

        {/* Local file — direct deck B load */}
        <div className="zone-engraved flex flex-col gap-2">
          <span className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}>
            LOCAL FILE → DECK B
          </span>
          <div className="flex gap-2 flex-wrap items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => handleLocalFile(e.target.files?.[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={deckBLoading}
              className="tactical-button"
              style={{ opacity: deckBLoading ? 0.3 : 1 }}
            >
              CHOOSE FILE
            </button>
          </div>
          {manualLoadError && (
            <span className="text-[11px] tracking-[1px] uppercase" style={{ color: "var(--led-red-on, #c82828)", fontFamily: "var(--font-tech)" }}>
              {manualLoadError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
