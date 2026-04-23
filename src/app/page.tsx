"use client";

import { useRef, useCallback, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRemixStore, getMasterAnalyser } from "../../lib/remix-store";
import type { MasterBusParams } from "../../lib/remix-store";
import { getAudioContext } from "../../lib/audio-context";
import WaveformDisplay from "../../components/WaveformDisplay";
import PianoKeyboard from "../../components/PianoKeyboard";
import Toast from "../../components/Toast";
import ExportVideoModalRemix from "../../components/ExportVideoModalRemix";
import SceneLanding from "../../components/SceneLanding";
import DeckBMatches from "../../components/DeckBMatches";


type DeckId = "A" | "B";

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

function semitoneToKey(baseKeyIndex: number, semitones: number, mode?: "major" | "minor" | null): string {
  const idx = ((baseKeyIndex + Math.round(semitones)) % 12 + 12) % 12;
  return NOTE_NAMES[idx] + (mode === "minor" ? "m" : "");
}

function snapToSemitone(speed: number): number {
  const rate = 1.0 + speed;
  const semitones = 12 * Math.log2(rate);
  const snapped = Math.round(semitones);
  return Math.pow(2, snapped / 12) - 1.0;
}

const faderStyle: React.CSSProperties = {
  writingMode: "vertical-lr",
  direction: "rtl",
  WebkitAppearance: "none",
  appearance: "none",
  background: "transparent",
  width: "40px",
  top: 0,
  left: "50%",
  transform: "translateX(-50%)",
};

const detailBtnClass = (active: boolean) =>
  `text-[12px] uppercase tracking-[0.15em] px-2 py-0.5 border ${
    active ? "border-[#333] bg-[rgba(255,115,0,0.15)]" : "border-[#777]"
  }`;

const detailBtnStyle: React.CSSProperties = { fontFamily: "var(--font-tech)", color: "var(--text-dark)", background: "transparent" };

// Green-on-black CRT-style deck action button — shared by stems/snap/key-finder/download-mp3.
const deckActionBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-tech)",
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  padding: "8px 12px",
  minHeight: "32px",
  color: "var(--crt-bright)",
  background: "var(--crt-bg)",
  border: "1px solid var(--crt-dim)",
  display: "inline-flex",
  alignItems: "center",
  lineHeight: 1,
};

function Deck({ id, onHide }: { id: DeckId; onHide?: () => void }) {
  const deck = useRemixStore((s) => (id === "A" ? s.deckA : s.deckB));
  const loadFile = useRemixStore((s) => s.loadFile);
  const loadFromYouTube = useRemixStore((s) => s.loadFromYouTube);
  const play = useRemixStore((s) => s.play);
  const stop = useRemixStore((s) => s.stop);
  const pause = useRemixStore((s) => s.pause);
  const setParam = useRemixStore((s) => s.setParam);
  const setVolume = useRemixStore((s) => s.setVolume);
  const eject = useRemixStore((s) => s.eject);

  const setRegion = useRemixStore((s) => s.setRegion);
  const seek = useRemixStore((s) => s.seek);
  const scrub = useRemixStore((s) => s.scrub);
  const inputRef = useRef<HTMLInputElement>(null);

  const [stepMode, setStepMode] = useState(true);
  const waveformWrapRef = useRef<HTMLDivElement>(null);
  const [showEQ, setShowEQ] = useState(true);
  const [showYouTube, setShowYouTube] = useState(false);
  const [showKeyFinder, setShowKeyFinder] = useState(false);

  const rate = 1.0 + deck.params.speed;
  const isTrackLoading = deck.isLoading || deck.downbeatDetecting || deck.isStemLoading;
  const deckReady = !!deck.sourceBuffer;
  const loadPct = Math.round(
    ((!deck.isLoading ? 1 : 0) + (!deck.downbeatDetecting ? 1 : 0) + (!deck.isStemLoading ? 1 : 0)) / 3 * 100
  );
  const pitchSemitones = deck.params.pitch ?? 0;
  const linked = deck.params.pitchSpeedLinked ?? true;
  const displaySemitones = pitchSemitones;
  const [ytUrl, setYtUrl] = useState("");
  const baseKey = deck.baseKey;
  const baseMode = deck.baseMode;
  const [editingKey, setEditingKey] = useState(false);
  const [userBPM, setUserBPM] = useState<string>("");
  const [editingBPM, setEditingBPM] = useState(false);
  const [editingSpeed, setEditingSpeed] = useState(false);
  const [speedInput, setSpeedInput] = useState("");
  const setBPM = useRemixStore((s) => s.setBPM);
  const setDeckMeta = useRemixStore((s) => s.setDeckMeta);
  const snapToDownbeat = useRemixStore((s) => s.snapToDownbeat);
  const toggleStem = useRemixStore((s) => s.toggleStem);
  const downloadDeckMP3 = useRemixStore((s) => s.downloadDeckMP3);
  const deckIsConvertingMp3 = useRemixStore((s) => s.isConvertingMp3);
  const loadDeck = useRemixStore((s) => s.loadDeck);
  const lookupEverysong = useRemixStore((s) => s.lookupEverysong);
  const recordArmed = useRemixStore((s) => s.recordArmed);

  const [deckArtist, setDeckArtist] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckLoadError, setDeckLoadError] = useState("");

  const handleDeckLoad = useCallback(async () => {
    if (!deckArtist && !deckTitle) return;
    setDeckLoading(true);
    setDeckLoadError("");
    try {
      await loadDeck(id, deckArtist, deckTitle);
    } catch (e) {
      setDeckLoadError(e instanceof Error ? e.message : "LOAD FAILED");
      setTimeout(() => setDeckLoadError(""), 4000);
    }
    setDeckLoading(false);
  }, [loadDeck, id, deckArtist, deckTitle]);

  // Reset local input state when source changes (store already resets BPM/key at load start)
  const sourceId = deck.sourceBuffer ? deck.sourceFilename : null;
  useEffect(() => {
    setUserBPM("");
    setEditingKey(false);
    setEditingBPM(false);
  }, [sourceId, id]);

  // Sync artist/title inputs from store (populated by lookupEverysong)
  useEffect(() => {
    if (deck.artist) setDeckArtist(deck.artist);
    if (deck.title) setDeckTitle(deck.title);
  }, [deck.artist, deck.title]);


  const handleSpeed = (v: number) => {
    if (linked) {
      if (stepMode) {
        const snapped = snapToSemitone(v);
        setParam(id, "speed", snapped);
        setParam(id, "pitch", 12 * Math.log2(1.0 + snapped));
      } else {
        setParam(id, "speed", v);
        setParam(id, "pitch", 12 * Math.log2(1.0 + v));
      }
    } else {
      setParam(id, "speed", v);
    }
  };

  const handlePitch = (v: number) => {
    if (stepMode) v = Math.round(v);
    if (linked) {
      const newRate = Math.pow(2, v / 12);
      setParam(id, "pitch", v);
      setParam(id, "speed", newRate - 1.0);
    } else {
      setParam(id, "pitch", v);
    }
  };

  const toggleLink = () => {
    setParam(id, "pitchSpeedLinked", linked ? 0 : 1);
  };


  const handleLoad = useCallback(() => {
    getAudioContext();
    if (deck.sourceBuffer) eject(id);
    inputRef.current?.click();
  }, [deck.sourceBuffer, eject, id]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const ctx = getAudioContext();
      await ctx.resume();
      const file = e.target.files?.[0];
      if (file) {
        await loadFile(id, file);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [loadFile, id]
  );

  const handleStart = useCallback(async () => {
    const ctx = getAudioContext();
    await ctx.resume();
    play(id);
  }, [play, id]);

  const handleSkip = useCallback(async (delta: number) => {
    if (!deck.sourceBuffer) return;
    const ctx = getAudioContext();
    const rStart = deck.regionStart;
    const rEnd = deck.regionEnd > 0 ? deck.regionEnd : deck.sourceBuffer.duration;
    const currentPos = deck.isPlaying
      ? rStart + (ctx.currentTime - deck.startedAt) * (1.0 + deck.params.speed)
      : deck.pauseOffset;
    const newPos = Math.max(rStart, Math.min(rEnd, currentPos + delta));
    await seek(id, newPos);
  }, [deck, seek, id]);

  return (
    <div className="flex flex-col gap-3">
      <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />

      {/* Deck header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0">
          <span
            className="text-sm tracking-[2px] uppercase"
            style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}
          >
            DECK {id}
          </span>
          <span
            className="text-[8px] tracking-[1px] uppercase"
            style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.55 }}
          >
            ENTER AN ARTIST, TITLE AND HIT LOAD TO BEGIN
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={handleLoad} disabled={deck.isLoading} className="rocker-switch" style={{ width: "28px", height: "28px" }}>
              <div className="w-1.5 h-1.5 rounded-full border-2 border-[#555]" />
            </button>
            <span className="text-[8px] tracking-[1px]" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>LOCAL</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={() => setShowYouTube(!showYouTube)} className="rocker-switch" style={{ width: "28px", height: "28px" }}>
              <div className="w-1.5 h-1.5 rounded-full border-2 border-[#555]" />
            </button>
            <span className="text-[8px] tracking-[1px]" style={{ color: showYouTube ? "var(--accent-gold)" : "var(--text-dark)", fontFamily: "var(--font-tech)" }}>YT URL</span>
          </div>
          {onHide && (
            <button
              onClick={onHide}
              className={detailBtnClass(false)}
              style={detailBtnStyle}
            >
              (HIDE)
            </button>
          )}
          <div className="led-cutout">
            <div className={`led-rect ${deck.isPlaying ? "led-green-on" : deck.sourceBuffer ? "led-green-on" : "led-green"}`} />
          </div>
        </div>
      </div>

      {/* Per-deck artist + title + load */}
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] tracking-[1px]" style={{ fontFamily: "var(--font-tech)", color: "#000" }}>ARTIST</span>
          <input
            type="text"
            value={deckArtist}
            onChange={(e) => setDeckArtist(e.target.value)}
            onBlur={() => { if (deckArtist || deckTitle) lookupEverysong(id, deckArtist, deckTitle); }}
            onKeyDown={(e) => e.key === "Enter" && handleDeckLoad()}
            className="w-full bg-transparent border border-[#555] px-3 py-1.5 text-[11px] tracking-[1px] outline-none focus:border-[#888]"
            style={{ fontFamily: "var(--font-tech)", color: "#000" }}
          />
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] tracking-[1px]" style={{ fontFamily: "var(--font-tech)", color: "#000" }}>TITLE</span>
          <input
            type="text"
            value={deckTitle}
            onChange={(e) => setDeckTitle(e.target.value)}
            onBlur={() => { if (deckArtist || deckTitle) lookupEverysong(id, deckArtist, deckTitle); }}
            onKeyDown={(e) => e.key === "Enter" && handleDeckLoad()}
            className="w-full bg-transparent border border-[#555] px-3 py-1.5 text-[11px] tracking-[1px] outline-none focus:border-[#888]"
            style={{ fontFamily: "var(--font-tech)", color: "#000" }}
          />
        </div>
        <div className="flex flex-col justify-end">
          <button
            onClick={handleDeckLoad}
            disabled={deckLoading || (!deckArtist && !deckTitle)}
            className={detailBtnClass(false)}
            style={{ ...detailBtnStyle, opacity: (!deckArtist && !deckTitle) ? 0.3 : 1, color: deckLoadError ? "var(--led-red-on)" : "var(--accent-gold)" }}
          >
            {deckLoading ? "..." : deckLoadError || "LOAD"}
          </button>
        </div>
      </div>

      {/* YouTube URL input */}
      {showYouTube && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ytUrl.trim()) {
                const url = ytUrl.trim();
                setYtUrl("");
                const ctx = getAudioContext();
                ctx.resume().then(async () => {
                  await loadFromYouTube(id, url);
                });
              }
            }}
            placeholder="PASTE YOUTUBE URL"
            disabled={deck.isLoading}
            className="flex-1 bg-transparent border-2 border-[#555] px-3 py-2 text-[12px] uppercase tracking-wider placeholder:text-black"
            style={{ fontFamily: "var(--font-tech)", color: "#000", outline: "none" }}
          />
          <button
            onClick={() => {
              if (!ytUrl.trim()) return;
              const url = ytUrl.trim();
              setYtUrl("");
              const ctx = getAudioContext();
              ctx.resume().then(async () => {
                await loadFromYouTube(id, url);
              });
            }}
            disabled={deck.isLoading || !ytUrl.trim()}
            className="border-2 border-[#555] px-3 py-2 text-[12px] uppercase tracking-wider disabled:opacity-30"
            style={{ fontFamily: "var(--font-tech)", color: "#000", background: "transparent" }}
          >
            {deck.isLoading ? "LOADING..." : "GO"}
          </button>
        </div>
      )}

      {/* CRT status */}
      <div className="display-bezel flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <div
            className="text-[12px] truncate crt-text"
            style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)", fontSize: "12px" }}
          >
            {deck.isStemLoading
              ? "SEPARATING STEMS..."
              : deck.downbeatDetecting
              ? "DETECTING DOWNBEAT..."
              : deck.isLoading
              ? "LOADING..."
              : deck.sourceFilename
              ? deck.sourceFilename.toUpperCase()
              : "NO TRACK"}
            {!deck.isLoading && !deck.isStemLoading && !deck.downbeatDetecting && deck.isPlaying && " — PLAYING"}
          </div>
        </div>
        {deck.sourceBuffer && (
          <div className="flex gap-4 text-[12px] items-center" style={{ color: "var(--crt-dim)", fontFamily: "var(--font-crt)", fontSize: "12px" }}>
            {editingKey ? (
              <span style={{ color: "var(--crt-bright)" }}>
                KEY:{" "}
                <span className="inline-flex gap-0.5">
                  {NOTE_NAMES.map((note, i) => (
                    <button
                      key={note}
                      onClick={() => { setDeckMeta(id, { baseKey: i }); setEditingKey(false); }}
                      className="px-1"
                      style={{
                        fontFamily: "var(--font-crt)", fontSize: "12px",
                        color: baseKey === i ? "var(--accent-gold)" : "var(--crt-bright)",
                        background: "transparent", border: "none",
                      }}
                    >
                      {note}
                    </button>
                  ))}
                </span>
              </span>
            ) : (
              <span
                style={{ color: baseKey !== null ? "var(--crt-bright)" : "var(--crt-dim)" }}
                onClick={() => setEditingKey(true)}
              >
                {baseKey !== null
                  ? `KEY: ${NOTE_NAMES[baseKey]}${baseMode === "minor" ? "m" : ""}`
                  : "SET KEY"
                }
              </span>
            )}
            {editingBPM ? (
              <span style={{ color: "var(--crt-bright)" }}>
                BPM:{" "}
                <input
                  type="text"
                  autoFocus
                  value={userBPM}
                  onChange={(e) => setUserBPM(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(userBPM);
                      if (!isNaN(val) && val > 0) setBPM(id, val);
                      setEditingBPM(false);
                    }
                    if (e.key === "Escape") setEditingBPM(false);
                  }}
                  onBlur={() => {
                    const val = parseFloat(userBPM);
                    if (!isNaN(val) && val > 0) setBPM(id, val);
                    setEditingBPM(false);
                  }}
                  className="bg-transparent border-b border-[var(--crt-bright)] outline-none text-[12px] w-[50px]"
                  style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)" }}
                />
              </span>
            ) : (
              <span
                style={{ color: userBPM ? "var(--crt-bright)" : "var(--crt-dim)" }}
                onClick={() => setEditingBPM(true)}
              >
                {deck.calculatedBPM
                  ? `BPM: ${deck.calculatedBPM.toFixed(3)}`
                  : "SET BPM"
                }
              </span>
            )}
            <span style={{ color: "var(--crt-dim)" }}>
              PITCH: {displaySemitones >= 0 ? "+" : ""}{displaySemitones.toFixed(1)}ST
            </span>
            {deck.firstDownbeatMs !== null && (
              <span
                style={{ color: "var(--crt-bright)" }}
                title="ML-detected first downbeat (madmom DBN)"
              >
                DB: {(deck.firstDownbeatMs / 1000).toFixed(3)}S
              </span>
            )}
            {deck.downbeatDetecting && (
              <span className="animate-pulse" style={{ color: "var(--accent-gold)" }}>
                DB...
              </span>
            )}
            {deck.downbeatError && !deck.downbeatDetecting && (
              <span style={{ color: "#e05050", fontSize: "9px" }} title={deck.downbeatError}>
                DB ERR
              </span>
            )}
          </div>
        )}
      </div>

      {/* Waveform */}
      <div ref={waveformWrapRef} style={{ display: "flex", flexDirection: "column" }}>
        <div>
          <WaveformDisplay
            audioBuffer={deck.mixedStemBuffer || (deck.activeStem && deck.stemBuffers?.[deck.activeStem] ? deck.stemBuffers[deck.activeStem]! : deck.sourceBuffer)}
            isPlaying={deck.isPlaying}
            pauseOffset={deck.pauseOffset}
            startedAt={deck.startedAt}
            playbackRate={rate}
            regionStart={deck.regionStart}
            regionEnd={deck.regionEnd}
            onRegionChange={(s, e) => setRegion(id, s, e)}
            onSeek={(pos) => seek(id, pos)}
            onScrub={(pos) => scrub(id, pos)}
          />
        </div>
      </div>

      {/* Deck action zone — two fixed rows: stems line, then snap/key/download line */}
      <div className="flex flex-col gap-2 px-1">
        {/* Row 1: stem checkboxes — always on one line */}
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "auto repeat(5, minmax(0, 1fr))" }}>
          <span className="text-[11px] uppercase tracking-[0.18em]" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", opacity: 0.6 }}>
            STEMS{deck.isStemLoading ? " (SEP…)" : ""}
          </span>
          {([
            ["vocals", "VOCALS"],
            ["drums", "DRUMS"],
            ["bass", "BASS"],
            ["other", "OTHER"],
            ["instrumental", "INSTR"],
          ] as const).map(([stem, label]) => {
            const active = deck.activeStems.includes(stem);
            return (
              <button
                key={stem}
                onClick={() => toggleStem(id, stem)}
                disabled={deck.isStemLoading}
                className="deck-action-btn w-full justify-center"
                style={{ ...deckActionBtnStyle, width: "100%", justifyContent: "center", background: active ? "var(--crt-bright)" : "var(--crt-bg)", color: active ? "var(--crt-bg)" : "var(--crt-bright)", borderColor: active ? "var(--crt-bright)" : "var(--crt-dim)", opacity: deck.isStemLoading ? 0.45 : 1 }}
              >
                <span style={{ marginRight: 6, fontSize: 11, lineHeight: 1 }}>{active ? "✓" : "-"}</span>
                {label}
              </button>
            );
          })}
        </div>
        {/* Row 2: snap + key finder + download — always on one line */}
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <button
            onClick={() => snapToDownbeat(id)}
            disabled={!deck.sourceBuffer || deck.downbeatDetecting}
            className="deck-action-btn w-full justify-center"
            style={{ ...deckActionBtnStyle, width: "100%", justifyContent: "center", opacity: (!deck.sourceBuffer || deck.downbeatDetecting) ? 0.45 : 1 }}
          >
            {deck.downbeatDetecting ? "DETECTING…" : "SNAP TO DOWNBEAT"}
          </button>
          <button
            onClick={() => setShowKeyFinder((v) => !v)}
            className="deck-action-btn w-full justify-center"
            style={{ ...deckActionBtnStyle, width: "100%", justifyContent: "center", background: showKeyFinder ? "var(--crt-bright)" : "var(--crt-bg)", color: showKeyFinder ? "var(--crt-bg)" : "var(--crt-bright)", borderColor: showKeyFinder ? "var(--crt-bright)" : "var(--crt-dim)" }}
          >
            KEY FINDER
          </button>
          <button
            onClick={() => downloadDeckMP3(id)}
            disabled={!deck.sourceBuffer || deckIsConvertingMp3}
            className="deck-action-btn w-full justify-center"
            style={{ ...deckActionBtnStyle, width: "100%", justifyContent: "center", opacity: (!deck.sourceBuffer || deckIsConvertingMp3) ? 0.45 : 1 }}
          >
            {deckIsConvertingMp3 ? "CONVERTING…" : "DOWNLOAD MP3"}
          </button>
        </div>
      </div>

      {/* Stem error only */}
      {deck.stemError && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[12px]" style={{ color: "var(--led-red-on)", fontFamily: "var(--font-tech)" }}>
            {deck.stemError.replace(/<[^>]*>/g, "").slice(0, 60).toUpperCase()}
          </span>
        </div>
      )}
      {showKeyFinder && (
        <div className="flex justify-center">
          <PianoKeyboard />
        </div>
      )}

      {/* Transport buttons */}
      <div className="flex items-center gap-2 justify-center">
        <div className="flex flex-col items-center">
          <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>REW</span>
          <button onClick={() => handleSkip(-5)} disabled={!deckReady} className="rocker-switch" style={{ width: "44px", height: "44px" }}>
            <div className="w-1.5 h-1.5 rounded-full border-2 border-[#555]" />
          </button>
        </div>
        <div className="flex flex-col items-center">
          <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>START</span>
          <button onClick={handleStart} disabled={!deckReady || deck.isPlaying} className="rocker-switch" style={{ width: "44px", height: "44px" }}>
            <div className="w-1.5 h-1.5 rounded-full border-2 border-[#555]" />
          </button>
        </div>
        <div className="flex flex-col items-center">
          <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>STOP</span>
          <button onClick={() => stop(id)} disabled={!deckReady} className="rocker-switch" style={{ width: "44px", height: "44px" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{
              background: (id === "A" && recordArmed) ? "var(--led-red-on, #c82828)" : undefined,
              border: (id === "A" && recordArmed) ? "none" : "2px solid #555",
            }} />
          </button>
        </div>
        <div className="flex flex-col items-center">
          <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>PAUSE</span>
          <button onClick={() => pause(id)} disabled={!deckReady || !deck.isPlaying} className="rocker-switch" style={{ width: "44px", height: "44px" }}>
            <div className="w-1.5 h-1.5 rounded-full border-2 border-[#555]" />
          </button>
        </div>
        <div className="flex flex-col items-center">
          <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>FF</span>
          <button onClick={() => handleSkip(5)} disabled={!deckReady} className="rocker-switch" style={{ width: "44px", height: "44px" }}>
            <div className="w-1.5 h-1.5 rounded-full border-2 border-[#555]" />
          </button>
        </div>
      </div>
      {deck.error && (
        <div className="text-[12px] uppercase tracking-wider" style={{ fontFamily: "var(--font-tech)", color: "#ff4444" }}>
          {deck.error}
        </div>
      )}

      {/* Parameters toggle button */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowEQ(!showEQ)}
          className={detailBtnClass(showEQ)}
          style={detailBtnStyle}
        >
          PARAMETERS
        </button>
      </div>

      {/* All controls: Speed/Pitch/Vol on top, Reverb/Tone/Sat below */}
      {showEQ && <><div className="zone-engraved" style={{ position: "relative" }}>
        {isTrackLoading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(196,184,154,0.92)",
            pointerEvents: "all",
          }}>
            <span style={{ fontFamily: "var(--font-tech)", fontSize: "13px", letterSpacing: "3px", fontWeight: "bold", color: "#000" }}>
              LOADING {loadPct}%
            </span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4" style={{ justifyItems: "center" }}>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input
                type="range" min="-0.5" max="0.5" step={0.001}
                value={deck.params.speed}
                onChange={(e) => handleSpeed(parseFloat(e.target.value))}
                className="absolute h-full"
                style={{ ...faderStyle, width: "36px" }}
              />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>SPEED</div>
            {editingSpeed ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                const v = parseFloat(speedInput);
                if (!isNaN(v) && v > 0) {
                  if (deck.calculatedBPM) {
                    handleSpeed(v / deck.calculatedBPM - 1.0);
                  } else {
                    handleSpeed(v - 1.0);
                  }
                }
                setEditingSpeed(false);
              }} className="flex">
                <input
                  autoFocus
                  value={speedInput}
                  onChange={(e) => setSpeedInput(e.target.value)}
                  onBlur={() => setEditingSpeed(false)}
                  className="bg-transparent border border-[#333] text-center w-[70px] text-[12px]"
                  style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", outline: "none" }}
                />
              </form>
            ) : deck.calculatedBPM ? (
              <span
                className="text-[12px]"
                style={{ color: "var(--text-dark)" }}
                onClick={() => { setSpeedInput((deck.calculatedBPM! * rate).toFixed(3)); setEditingSpeed(true); }}
              >
                {(deck.calculatedBPM * rate).toFixed(3)}
              </span>
            ) : (
              <span
                className="text-[12px]"
                style={{ color: "var(--text-dark)" }}
                onClick={() => { setSpeedInput(rate.toFixed(4)); setEditingSpeed(true); }}
              >
                {rate.toFixed(4)}X
              </span>
            )}
            <button onClick={toggleLink} className={detailBtnClass(linked)} style={detailBtnStyle}>LINK</button>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input
                type="range" min="-12" max="12" step={stepMode ? 1 : 0.1}
                value={pitchSemitones}
                onChange={(e) => handlePitch(parseFloat(e.target.value))}
                className="absolute h-full"
                style={{ ...faderStyle, width: "36px" }}
              />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>PITCH</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>
              {baseKey !== null
                ? semitoneToKey(baseKey, displaySemitones, baseMode)
                : `${displaySemitones >= 0 ? "+" : ""}${displaySemitones.toFixed(1)}ST`
              }
            </span>
            <button onClick={() => setStepMode(!stepMode)} className={detailBtnClass(stepMode)} style={detailBtnStyle}>STEP</button>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input
                type="range" min="0" max="1" step="0.01"
                value={deck.volume}
                onChange={(e) => setVolume(id, parseFloat(e.target.value))}
                className="absolute h-full"
                style={{ ...faderStyle, width: "36px" }}
              />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>VOL</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{Math.round(deck.volume * 100)}%</span>
          </div>
        </div>
      </div>

      {/* end showEQ */}
      </>}


    </div>
  );
}

function MasterBus() {
  const masterBus = useRemixStore((s) => s.masterBus);
  const setMasterBus = useRemixStore((s) => s.setMasterBus);
  const [showCompDetail, setShowCompDetail] = useState(false);
  const [showLimDetail, setShowLimDetail] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedSink, setSelectedSink] = useState<string>("default");
  const [sinkIdSupported, setSinkIdSupported] = useState(false);

  useEffect(() => {
    import("../../lib/audio-context").then(({ getAudioOutputDevices }) => {
      const ctx = new AudioContext();
      setSinkIdSupported(typeof (ctx as AudioContext & { setSinkId?: unknown }).setSinkId === "function");
      ctx.close();
      getAudioOutputDevices().then(setOutputDevices);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = getMasterAnalyser();
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx2d.fillStyle = "#1e2e1a";
      ctx2d.fillRect(0, 0, W, H);
      // grid lines
      ctx2d.strokeStyle = "rgba(44,66,37,0.6)";
      ctx2d.lineWidth = 1;
      for (let y = H / 4; y < H; y += H / 4) {
        ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke();
      }
      if (!analyser) return;
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);
      const useBins = Math.floor(bufLen * 0.15);
      const barW = W / useBins;
      for (let i = 0; i < useBins; i++) {
        const v = data[i] / 255;
        const barH = v * H;
        const alpha = 0.5 + v * 0.5;
        ctx2d.fillStyle = `rgba(117,204,70,${alpha})`;
        ctx2d.fillRect(i * barW, H - barH, barW, barH);
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const compPct = Math.round(masterBus.compAmount * 100);
  const limPct = Math.round(masterBus.limiterAmount * 100);

  const amt = masterBus.compAmount;
  const threshold = masterBus.compThreshold ?? (amt * -40);
  const ratio = masterBus.compRatio ?? (1 + amt * 11);
  const attack = masterBus.compAttack ?? 0.01;
  const release = masterBus.compRelease ?? 0.15;
  const knee = masterBus.compKnee ?? 10;
  const makeup = masterBus.compMakeup ?? (amt * 12);

  const limAmt = masterBus.limiterAmount;
  const limThreshold = masterBus.limiterThreshold ?? (-1 - limAmt * 12);
  const limRelease = masterBus.limiterRelease ?? (0.01 + limAmt * 0.1);
  const limKnee = masterBus.limiterKnee ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="text-sm tracking-[2px] uppercase"
          style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}
        >
          OUTPUT
        </span>
        <div className="flex items-center gap-2">
          {sinkIdSupported && outputDevices.length > 1 && (
            <div className="flex items-center gap-1">
              {outputDevices.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={async () => {
                    const { setAudioOutputDevice } = await import("../../lib/audio-context");
                    await setAudioOutputDevice(d.deviceId);
                    setSelectedSink(d.deviceId);
                  }}
                  className="text-[10px] tracking-[1px] uppercase px-2 py-1"
                  style={{
                    fontFamily: "var(--font-tech)",
                    background: selectedSink === d.deviceId ? "var(--accent-gold)" : "transparent",
                    color: selectedSink === d.deviceId ? "#000" : "var(--text-dark)",
                    border: "1px solid var(--engrave-dark)",
                  }}
                >
                  {(d.label || `OUTPUT ${outputDevices.indexOf(d) + 1}`).replace(/\(.*\)/, "").trim().toUpperCase().slice(0, 20)}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={async () => {
              const { restartAudioContext } = await import("../../lib/audio-context");
              await restartAudioContext();
              const devices = await (await import("../../lib/audio-context")).getAudioOutputDevices();
              setOutputDevices(devices);
            }}
            className="text-[10px] tracking-[1px] uppercase px-2 py-1"
            style={{ fontFamily: "var(--font-tech)", background: "transparent", color: "var(--text-dark)", border: "1px solid var(--engrave-dark)" }}
          >
            RESTART AUDIO
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={120}
        style={{
          width: "100%",
          height: "120px",
          display: "block",
          background: "var(--crt-bg)",
          border: "1px solid var(--engrave-dark)",
        }}
      />

      <div className="zone-engraved">
        <div className="grid grid-cols-5 gap-2" style={{ justifyItems: "center" }}>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input type="range" min="-20" max="20" step="0.5" value={masterBus.eqLow} onChange={(e) => setMasterBus("eqLow", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>LOW</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{masterBus.eqLow > 0 ? "+" : ""}{masterBus.eqLow.toFixed(1)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input type="range" min="-20" max="20" step="0.5" value={masterBus.eqMid} onChange={(e) => setMasterBus("eqMid", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>MID</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{masterBus.eqMid > 0 ? "+" : ""}{masterBus.eqMid.toFixed(1)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input type="range" min="-20" max="20" step="0.5" value={masterBus.eqHigh} onChange={(e) => setMasterBus("eqHigh", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>HIGH</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{masterBus.eqHigh > 0 ? "+" : ""}{masterBus.eqHigh.toFixed(1)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input type="range" min="0" max="1" step="0.01" value={masterBus.compAmount} onChange={(e) => setMasterBus("compAmount", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>COMP</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{compPct}%</span>
            <button onClick={() => setShowCompDetail(!showCompDetail)} className={detailBtnClass(showCompDetail)} style={detailBtnStyle}>DETAIL</button>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[100px] w-[36px] flex justify-center">
              <div className="slider-track h-full" />
              <input type="range" min="0" max="1" step="0.01" value={masterBus.limiterAmount} onChange={(e) => setMasterBus("limiterAmount", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} />
            </div>
            <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>LIMIT</div>
            <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{limPct}%</span>
            <button onClick={() => setShowLimDetail(!showLimDetail)} className={detailBtnClass(showLimDetail)} style={detailBtnStyle}>DETAIL</button>
          </div>
        </div>
      </div>

      {showCompDetail && (
        <div className="zone-engraved">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" style={{ justifyItems: "center" }}>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="-60" max="0" step="1" value={threshold} onChange={(e) => setMasterBus("compThreshold", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>THRESH</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{threshold.toFixed(0)}dB</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="1" max="20" step="0.5" value={ratio} onChange={(e) => setMasterBus("compRatio", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>RATIO</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{ratio.toFixed(1)}:1</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="0.001" max="0.5" step="0.001" value={attack} onChange={(e) => setMasterBus("compAttack", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>ATK</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{(attack * 1000).toFixed(0)}ms</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="0.01" max="1" step="0.01" value={release} onChange={(e) => setMasterBus("compRelease", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>REL</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{(release * 1000).toFixed(0)}ms</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="0" max="40" step="1" value={knee} onChange={(e) => setMasterBus("compKnee", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>KNEE</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{knee.toFixed(0)}dB</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="0" max="24" step="0.5" value={makeup} onChange={(e) => setMasterBus("compMakeup", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>GAIN</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>+{makeup.toFixed(1)}dB</span>
            </div>
          </div>
        </div>
      )}

      {showLimDetail && (
        <div className="zone-engraved">
          <div className="label" style={{ fontSize: "12px", marginBottom: "8px", marginTop: 0 }}>LIMITER DETAIL</div>
          <div className="grid grid-cols-3 gap-3" style={{ justifyItems: "center" }}>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="-20" max="0" step="0.5" value={limThreshold} onChange={(e) => setMasterBus("limiterThreshold", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>CEILING</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{limThreshold.toFixed(1)}dB</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="0.001" max="0.3" step="0.001" value={limRelease} onChange={(e) => setMasterBus("limiterRelease", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>REL</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{(limRelease * 1000).toFixed(0)}ms</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-[80px] w-[36px] flex justify-center"><div className="slider-track h-full" /><input type="range" min="0" max="6" step="0.5" value={limKnee} onChange={(e) => setMasterBus("limiterKnee", parseFloat(e.target.value))} className="absolute h-full" style={{ ...faderStyle, width: "36px" }} /></div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>KNEE</div>
              <span className="text-[12px]" style={{ color: "var(--text-dark)" }}>{limKnee.toFixed(1)}dB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function Manual({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="console w-full max-w-[700px] max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}>MANUAL</span>
          <button onClick={onClose} className={detailBtnClass(false)} style={detailBtnStyle}>CLOSE</button>
        </div>
        <div className="flex flex-col gap-5 text-[12px] leading-[1.6]" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>LOADING TRACKS</div>
            <div className="mb-1">DECK A: ENTER ARTIST AND TITLE, THEN HIT LOAD. THE TRACK IS FOUND ON YOUTUBE AND LOADED AUTOMATICALLY.</div>
            <div className="mb-1">DECK B: PICK A KEY/BPM-COMPATIBLE MATCH FROM THE LIST BELOW, OR USE THE NEW YOUTUBE URL / LOCAL FILE BUTTONS AT THE TOP OF THE MATCH PANEL TO SKIP THE LIST ENTIRELY.</div>
            <div>LOCAL: LOAD AN AUDIO FILE FROM YOUR DEVICE. YT URL: PASTE A SPECIFIC YOUTUBE URL TO LOAD DIRECTLY.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>TWO DECKS</div>
            <div>DECK A AND DECK B ARE ALWAYS VISIBLE. EACH DECK HAS ITS OWN ARTIST/TITLE INPUTS, LOAD BUTTON, AND FULL INDEPENDENT EFFECTS CHAIN. SYNC CONTROLS SIT IN THEIR OWN BORDERED ZONE ABOVE THE DECKS; THE CROSSFADER AND MASTER BUS SIT BELOW.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>DECK ACTION ZONE</div>
            <div className="mb-1">EACH DECK HAS AN INLINE ROW OF GREEN/BLACK CRT BUTTONS UNDER THE WAVEFORM — NO MORE POPUP MENU.</div>
            <div className="mb-1">STEM CHECKBOXES: VOCALS / DRUMS / BASS / OTHER / INSTR. TOGGLE ONE OR MORE; FIRST USE TRIGGERS ML SEPARATION (DEMUCS, ~30S), AFTER THAT SWITCHING IS INSTANT.</div>
            <div className="mb-1">SNAP TO DOWNBEAT: MOVES THE REGION START TO THE ML-DETECTED FIRST DOWNBEAT. IF NO DOWNBEAT IS KNOWN YET, THIS RUNS DETECTION FIRST.</div>
            <div className="mb-1">KEY FINDER: OPENS A ONE-OCTAVE SINE PIANO FOR FINDING THE KEY BY EAR.</div>
            <div>DOWNLOAD MP3: RENDERS THE DECK THROUGH THE FULL EFFECTS CHAIN AND DOWNLOADS A 192 KBPS MP3.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>PARAMETERS</div>
            <div className="mb-1">THE PARAMETERS PANEL (FORMERLY EQ) HOUSES SPEED, PITCH, VOLUME, REVERB, TONE, AND SATURATION FOR EACH DECK.</div>
            <div className="mb-1">SPEED AND PITCH ARE INDEPENDENT PARAMETERS. LINKED (DEFAULT, VARISPEED) MOVES THEM TOGETHER LIKE A TAPE DECK — NO PITCH-SHIFTING IS DONE, JUST PLAYBACK RATE.</div>
            <div className="mb-1">UNLINKED: SPEED CHANGES TEMPO ONLY; PITCH SHIFTS INDEPENDENTLY VIA THE WSOLA PITCH SHIFTER. STEP SNAPS PITCH TO SEMITONES WHILE UNLINKED.</div>
            <div>LOOPING IS OFF — PLAYBACK STOPS AT REGION END OR END OF FILE.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>DECK B MATCH PANEL</div>
            <div className="mb-1">AUTO-POPULATES FROM DECK A&apos;S KEY AND BPM. THE RESULT COUNTER IN THE HEADER IS THE TRUE TOTAL FOR THE CURRENT CRITERIA — PAGES AUTO-LOAD IN THE BACKGROUND UNTIL EXHAUSTED. NO MORE LOAD-MORE BUTTON.</div>
            <div className="mb-1">BPM ± SETS HOW WIDE A TEMPO WINDOW TO SEARCH. KEY ± SETS THE SEMITONE RANGE FOR PITCH MATCH.</div>
            <div className="mb-1">SORT: BPM TOGGLES BPM SORT; OTHERWISE RESULTS ARE ORDERED BY POPULARITY.</div>
            <div className="mb-1">PITCH MATCH ADDS EXTRA RESULTS PITCHED WITHIN KEY ± SEMITONES OF DECK A.</div>
            <div>LOAD DECK B DIRECTLY: PASTE A YOUTUBE URL, OR CHOOSE A LOCAL FILE — BYPASSES THE MATCH LIST.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>SYNC + AUTO-MATCH</div>
            <div className="mb-1">AS SOON AS BOTH DECKS HAVE A BPM, DECK B&apos;S SPEED IS AUTO-ADJUSTED SO ITS EFFECTIVE BPM MATCHES DECK A. YOU CAN OVERRIDE THIS ANY TIME BY MOVING DECK B&apos;S SPEED.</div>
            <div className="mb-1">WHEN BOTH DECKS ARE LOADED, SYNC START GLOWS RED TO INDICATE IT&apos;S ARMED. HIT IT TO START BOTH DECKS SIMULTANEOUSLY WITH SAMPLE-ACCURATE TIMING; THE GLOW CLEARS ONCE PLAYBACK BEGINS.</div>
            <div>MATCH LEN STRETCHES BOTH REGIONS TO THE SAME LENGTH IN SECONDS (GEOMETRIC MEAN). AFFECTS SPEED ONLY, NOT PITCH.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>EFFECTS CHAIN</div>
            <div className="mb-1">EACH DECK: SOURCE → EQ → SATURATION → REVERB → OUTPUT.</div>
            <div className="mb-1">REVERB DETAIL: WET LEVEL, SIZE (ROOM DURATION), DECAY.</div>
            <div className="mb-1">TONE DETAIL: 5-BAND PARAMETRIC EQ — LOW SHELF, MID, HIGH SHELF, FREQUENCY SWEEP, PEAK GAIN.</div>
            <div>SAT DETAIL: DRIVE (WAVESHAPER), MIX (DRY/WET), TONE (POST-SATURATION LOWPASS).</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>OUTPUT BUS</div>
            <div className="mb-1">MASTER EQ (LOW/MID/HIGH), COMPRESSOR, AND LIMITER ON THE FINAL MIX. EACH HAS A DETAIL PANEL.</div>
            <div className="mb-1">COMP: SINGLE KNOB MAPS TO THRESHOLD + RATIO + MAKEUP. DETAIL PANEL OVERRIDES INDIVIDUAL PARAMS.</div>
            <div>LIMIT: BRICK-WALL LIMITER AFTER THE COMPRESSOR. DETAIL CONTROLS CEILING, RELEASE, AND KNEE.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>REGION FINE-TUNE</div>
            <div>WHEN A REGION IS SELECTED, IN/OUT NUDGE BUTTONS APPEAR. USE &lt; AND &gt; TO NUDGE BOUNDARIES. THE STEP-SIZE SLIDER ADJUSTS FROM 10MS TO 1S.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>CROSSFADER + RECORDING</div>
            <div className="mb-1">CROSSFADER: CENTER = BOTH DECKS FULL. LEFT = DECK A ONLY. RIGHT = DECK B ONLY.</div>
            <div>ARM LIVE RECORDING TO CAPTURE THE MIX WHEN BOTH DECKS PLAY. AFTER STOP, THE RECORDING CAN BE DOWNLOADED AS WAV OR MP3, OR EXPORTED AS AN MP4 VIDEO.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>EXPORT MP4</div>
            <div className="mb-1">OPEN THE MENU AND HIT EXPORT MP4. AUDIO IS ENCODED CLIENT-SIDE TO MP3 AND POSTED DIRECTLY TO THE VIDEO ROUTE — NO INTERMEDIATE PINATA UPLOAD. A SINGLE FFMPEG PASS MIXES THE WATERMARK AND ENCODES THE VIDEO. THE MP4 STREAMS BACK IN THE RESPONSE; THE GALLERY COPY UPLOADS IN THE BACKGROUND.</div>
            <div>ALL EXPORTS ARE SAVED TO THE GALLERY.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>GRIDLOCK</div>
            <div className="mb-1">TOGGLE FROM TOOLS MENU. OVERLAYS RED GRID LINES EVERY 4 BARS BASED ON BPM. ALIGN SLIDER SHIFTS ALL LINES UNIFORMLY. GRID IN/OUT ARROWS SNAP REGION TO GRID LINES.</div>
            <div className="mb-1">BEAT/BAR NUDGE BUTTONS SHIFT THE GRID BY ONE BEAT OR ONE BAR AT A TIME.</div>
            <div className="mb-1">÷4 BEAT: SUBDIVIDES GRID TO SHOW LINES EVERY BAR INSTEAD OF EVERY 4 BARS.</div>
            <div>ALL BEATS: TOGGLES GREEN DOWNBEAT MARKERS ON EVERY BEAT ACROSS THE WAVEFORM.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>MENU</div>
            <div className="mb-1">THE GREEN/BLACK CRT MENU IN THE UPPER RIGHT OPENS SAVE SESSION, LOAD SESSION, MANUAL, EXPORT MP4, SHARE SESSION, YOUTUBE, AND GALLERY. EACH OPTION SHARES THE SAME STYLE AS THE DECK READOUTS.</div>
            <div>GALLERY HOSTS ALL EXPORTS. HIT RADIO IN THE GALLERY TO OPEN THE SLOWED + REVERBED RADIO — AN IPOD-STYLE PLAYER THAT SHUFFLES YOUR EXPORTS AND SUPPORTS IOS LOCK-SCREEN PLAYBACK.</div>
          </div>

          <div>
            <div className="text-[12px] mb-2" style={{ color: "var(--accent-gold)" }}>KEYBOARD SHORTCUTS</div>
            <div>+ / - : ZOOM WAVEFORM IN/OUT</div>
            <div>F : ZOOM TO FIT SELECTED REGION</div>
          </div>

        </div>
      </div>
    </div>
  );
}

interface LocalSession {
  id: string;
  name: string;
  savedAt: string;
  deckA: Record<string, unknown> | null;
  deckB: Record<string, unknown> | null;
  crossfader: number;
  masterBus: MasterBusParams;
}

const LS_KEY = "dw_sessions";

function getSavedSessions(): LocalSession[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function SaveLoadModal({ onClose }: { onClose: () => void }) {
  const restoreSessionFromData = useRemixStore((s) => s.restoreSessionFromData);
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setSessions(getSavedSessions());
  }, []);

  const handleLoad = async (s: LocalSession) => {
    setLoadingId(s.id);
    await restoreSessionFromData({ deckA: s.deckA, deckB: s.deckB, crossfader: s.crossfader, masterBus: s.masterBus });
    setLoadingId(null);
    onClose();
  };

  const handleDelete = (id: string) => {
    const updated = getSavedSessions().filter((s) => s.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    setSessions(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="console w-full max-w-[600px] max-h-[80vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}>SAVED SESSIONS</span>
          <button onClick={onClose} className={detailBtnClass(false)} style={detailBtnStyle}>CLOSE</button>
        </div>
        {sessions.length === 0 ? (
          <div className="text-[12px] opacity-50" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>NO SAVED SESSIONS</div>
        ) : (
          <div className="flex flex-col gap-0">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#444]">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-[12px] uppercase tracking-[0.1em] truncate" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>{s.name}</span>
                  <span className="text-[10px] opacity-50" style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)" }}>{s.savedAt}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleLoad(s)}
                    disabled={loadingId === s.id}
                    className={detailBtnClass(false)}
                    style={{ ...detailBtnStyle, opacity: loadingId === s.id ? 0.5 : 1 }}
                  >
                    {loadingId === s.id ? "LOADING..." : "LOAD"}
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className={detailBtnClass(false)}
                    style={{ ...detailBtnStyle, color: "#c82828", borderColor: "#c82828" }}
                  >
                    DELETE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HomeInner() {
  const crossfader = useRemixStore((s) => s.crossfader);
  const setCrossfader = useRemixStore((s) => s.setCrossfader);
  const syncPlay = useRemixStore((s) => s.syncPlay);
  const stopDeck = useRemixStore((s) => s.stop);
  const setParam = useRemixStore((s) => s.setParam);
  const deckA = useRemixStore((s) => s.deckA);
  const deckB = useRemixStore((s) => s.deckB);
  const isConvertingWav = useRemixStore((s) => s.isConvertingWav);
  const pendingRecording = useRemixStore((s) => s.pendingRecording);
  const clearPendingRecording = useRemixStore((s) => s.clearPendingRecording);
  const downloadRecordingWAV = useRemixStore((s) => s.downloadRecordingWAV);
  const downloadRecordingMP3 = useRemixStore((s) => s.downloadRecordingMP3);
  const exportRecordingMP4 = useRemixStore((s) => s.exportRecordingMP4);
  const isConvertingMp3 = useRemixStore((s) => s.isConvertingMp3);
  const pendingVideoExport = useRemixStore((s) => s.pendingVideoExport);
  const clearPendingExport = useRemixStore((s) => s.clearPendingExport);
  const masterBus = useRemixStore((s) => s.masterBus);
  const [manualOpen, setManualOpen] = useState(false);

  // Auto-load decks from URL params (from Everysong match page)
  const searchParams = useSearchParams();
  const loadDeckHome = useRemixStore((s) => s.loadDeck);
  const skipPitchSync = useRef(false);
  useEffect(() => {
    const run = async () => {
      const aArtist = searchParams.get("a_artist") ?? "";
      const aTitle  = searchParams.get("a_title") ?? "";
      const bArtist = searchParams.get("b_artist") ?? "";
      const bTitle  = searchParams.get("b_title") ?? "";
      const bShiftStr = searchParams.get("b_shift");
      const bShift = bShiftStr !== null ? parseFloat(bShiftStr) : 0;
      if (aArtist || aTitle) loadDeckHome("A", aArtist, aTitle);
      if (bArtist || bTitle) {
        if (bShift !== 0) skipPitchSync.current = true;
        await loadDeckHome("B", bArtist, bTitle);
        if (bShift !== 0) setParam("B", "speed", Math.pow(2, bShift / 12) - 1);
      }
    };
    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps



  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeckB, setShowDeckB] = useState(true);
  const [showMasterEQ, setShowMasterEQ] = useState(false);
  const exportMP4 = useRemixStore((s) => s.exportMP4);
  const isExporting = useRemixStore((s) => s.isExporting);
  const restoreSession = useRemixStore((s) => s.restoreSession);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  // Restore shared session on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("s");
    if (sessionId) {
      setShowDeckB(true);
      restoreSession(sessionId);
    }
  }, [restoreSession]);

  const handleShare = async () => {
    if (!deckA.sourceBuffer && !deckB.sourceBuffer) return;
    setShareLoading(true);
    setMenuOpen(false);
    try {
      const buildDeckData = (deck: typeof deckA) => deck.sourceBuffer ? {
        audioUrl: deck.sourceUrl || null,
        filename: deck.sourceFilename || "track",
        params: deck.params,
        regionStart: deck.regionStart,
        regionEnd: deck.regionEnd,
        volume: deck.volume,
        calculatedBPM: deck.calculatedBPM,
        artist: deck.artist,
        title: deck.title,
        baseKey: deck.baseKey,
        activeStem: deck.activeStem || null,
        activeStems: deck.activeStems || [],
        stemUrls: deck.stemUrls || null,
      } : null;

      const form = new FormData();
      form.append("session", JSON.stringify({
        deckA: buildDeckData(deckA),
        deckB: buildDeckData(deckB),
        crossfader,
      }));
      if (deckA.sourceFile) form.append("audioA", deckA.sourceFile);
      if (deckB.sourceFile) form.append("audioB", deckB.sourceFile);

      const res = await fetch("/api/session", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const url = `${window.location.origin}/?s=${data.id}`;
      await navigator.clipboard.writeText(url);
      setShareStatus("LINK COPIED");
    } catch {
      setShareStatus("SHARE FAILED");
    }
    setShareLoading(false);
    setTimeout(() => setShareStatus(""), 3000);
  };

  const saveSession = () => {
    const buildDeckData = (deck: typeof deckA) => deck.sourceBuffer ? {
      audioUrl: deck.sourceUrl || null,
      filename: deck.sourceFilename || "track",
      params: deck.params,
      regionStart: deck.regionStart,
      regionEnd: deck.regionEnd,
      volume: deck.volume,
      calculatedBPM: deck.calculatedBPM,
      artist: deck.artist,
      title: deck.title,
      baseKey: deck.baseKey,
    } : null;

    const parts: string[] = [];
    if (deckA.sourceBuffer && deckA.title) parts.push(deckA.title.toUpperCase());
    if (deckB.sourceBuffer && deckB.title) parts.push(deckB.title.toUpperCase());
    const name = parts.length > 0 ? parts.join(" + ") : "SESSION";

    const id = Math.random().toString(36).slice(2, 12);
    const savedAt = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).toUpperCase();

    const session: LocalSession = {
      id,
      name,
      savedAt,
      deckA: buildDeckData(deckA) as Record<string, unknown> | null,
      deckB: buildDeckData(deckB) as Record<string, unknown> | null,
      crossfader,
      masterBus,
    };

    const existing = getSavedSessions();
    existing.unshift(session);
    if (existing.length > 30) existing.splice(30);
    localStorage.setItem(LS_KEY, JSON.stringify(existing));
    setSaveStatus("SAVED");
    setTimeout(() => setSaveStatus(""), 2500);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[1100px] flex flex-col gap-5">
        <div className="console flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-4 px-3 boot-stagger boot-delay-1 relative" style={{ zIndex: 100 }}>
            <div className="w-6 h-6 border-[3px] border-[var(--text-dark)] rounded-[4px] relative">
              <div className="absolute inset-[4px] bg-[var(--text-dark)]" />
            </div>
            <span
              className="text-lg sm:text-xl tracking-[2px] uppercase"
              style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}
            >
              AUTO MASH
            </span>
            <div className="ml-auto relative" style={{ zIndex: 100 }}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-[12px] uppercase tracking-[0.15em] px-3 py-1 border"
                style={{
                  fontFamily: "var(--font-tech)",
                  color: "var(--crt-bright)",
                  background: "var(--crt-bg)",
                  borderColor: menuOpen ? "var(--crt-bright)" : "var(--crt-dim)",
                }}
              >
                MENU
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 border flex flex-col"
                  style={{
                    minWidth: "220px",
                    zIndex: 100,
                    backgroundColor: "var(--crt-bg)",
                    borderColor: "var(--crt-dim)",
                  }}
                >
                  <button
                    onClick={() => { saveSession(); setMenuOpen(false); }}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left border-b flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent", borderColor: "var(--crt-dim)" }}
                  >
                    {saveStatus || "SAVE SESSION"}
                    <span data-tooltip-right="SAVE CURRENT SESSION TO THIS BROWSER" className="ml-3 text-[10px]">?</span>
                  </button>
                  <button
                    onClick={() => { setLoadModalOpen(true); setMenuOpen(false); }}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left border-b flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent", borderColor: "var(--crt-dim)" }}
                  >
                    LOAD SESSION
                    <span data-tooltip-right="RESTORE A PREVIOUSLY SAVED SESSION" className="ml-3 text-[10px]">?</span>
                  </button>
                  <button
                    onClick={() => { setManualOpen(true); setMenuOpen(false); }}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left border-b flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent", borderColor: "var(--crt-dim)" }}
                  >
                    MANUAL
                    <span data-tooltip-right="VIEW THE FULL USER MANUAL" className="ml-3 text-[10px]">?</span>
                  </button>
                  <button
                    onClick={() => { exportMP4(); setMenuOpen(false); }}
                    disabled={(!deckA.sourceBuffer && !deckB.sourceBuffer) || isExporting}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left border-b flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent", borderColor: "var(--crt-dim)", opacity: (!deckA.sourceBuffer && !deckB.sourceBuffer) ? 0.3 : 1 }}
                  >
                    {isExporting ? "RENDERING..." : "EXPORT MP4"}
                    <span data-tooltip-right="RENDER YOUR MIX AS A VIDEO FILE" className="ml-3 text-[10px]">?</span>
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={(!deckA.sourceBuffer && !deckB.sourceBuffer) || shareLoading}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left border-b flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent", borderColor: "var(--crt-dim)", opacity: (!deckA.sourceBuffer && !deckB.sourceBuffer) ? 0.3 : 1 }}
                  >
                    {shareLoading ? "UPLOADING..." : shareStatus || "SHARE SESSION"}
                    <span data-tooltip-right="UPLOAD AND SHARE A LINK TO THIS SESSION" className="ml-3 text-[10px]">?</span>
                  </button>
                  <a
                    href="https://www.youtube.com/@SLOWANDREVERBEDMACHINE"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left border-b flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent", borderColor: "var(--crt-dim)" }}
                  >
                    YOUTUBE
                    <span data-tooltip-right="VISIT THE SLOWED+REVERBED YOUTUBE CHANNEL" className="ml-3 text-[10px]">?</span>
                  </a>
                  <a
                    href="/gallery"
                    onClick={() => setMenuOpen(false)}
                    className="text-[12px] uppercase tracking-[0.15em] px-4 py-2 text-left flex items-center justify-between"
                    style={{ fontFamily: "var(--font-tech)", color: "var(--crt-bright)", background: "transparent" }}
                  >
                    GALLERY
                    <span data-tooltip-right="BROWSE EXPORTED MIXES" className="ml-3 text-[10px]">?</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Sync controls — own bordered zone, above the decks */}
          {showDeckB && (() => {
            const bothLoaded = !!deckA.sourceBuffer && !!deckB.sourceBuffer;
            const bothDownbeat = deckA.firstDownbeatMs !== null && deckB.firstDownbeatMs !== null;
            const bothStems = !!deckA.stemBuffers && !!deckB.stemBuffers;
            const anyPlaying = deckA.isPlaying || deckB.isPlaying;
            const armed = bothLoaded && bothDownbeat && bothStems && !anyPlaying;
            return (
              <div className="zone-inset boot-stagger boot-delay-3">
                <div className="flex items-center justify-center gap-10 py-2">
                  <div className="flex flex-col items-center" data-tooltip="STARTS BOTH DECKS SIMULTANEOUSLY.">
                    <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>SYNC START</span>
                    <button
                      onClick={async () => { const ctx = getAudioContext(); await ctx.resume(); syncPlay(); }}
                      disabled={!bothLoaded}
                      className="rocker-switch"
                      style={{
                        width: "90px",
                        height: "60px",
                        boxShadow: armed ? "0 0 14px 3px var(--led-red-on, #c82828), inset 0 0 8px rgba(200,40,40,0.35)" : undefined,
                        borderColor: armed ? "var(--led-red-on, #c82828)" : undefined,
                        transition: "box-shadow 120ms ease-out",
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          border: armed ? "none" : "2px solid #555",
                          background: armed ? "var(--led-red-on, #c82828)" : undefined,
                          boxShadow: armed ? "0 0 6px var(--led-red-on, #c82828)" : undefined,
                        }}
                      />
                    </button>
                  </div>
                  <div className="flex flex-col items-center" data-tooltip="STOPS BOTH DECKS SIMULTANEOUSLY.">
                    <span className="label" style={{ margin: 0, fontSize: "12px", marginBottom: "4px" }}>SYNC STOP</span>
                    <button
                      onClick={() => { stopDeck("A"); stopDeck("B"); }}
                      disabled={!bothLoaded}
                      className="rocker-switch"
                      style={{ width: "90px", height: "60px" }}
                    >
                      <div className="w-2 h-2 rounded-full border-2 border-[#555]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Decks */}
          <div className="grid gap-5 boot-stagger boot-delay-3 grid-cols-1 sm:grid-cols-2">
            <div className="zone-inset">
              <Deck id="A" />
            </div>
            <div className="zone-inset">
              <Deck id="B" />
            </div>
          </div>

          {/* Crossfader — only when deck B visible */}
          {showDeckB && (
            <div className="zone-inset boot-stagger boot-delay-3">
              <div className="flex items-center gap-4">
                <span className="label" style={{ margin: 0, fontSize: "12px", minWidth: "20px" }}>A</span>
                <div className="flex-1 relative h-[40px] flex items-center">
                  <div
                    className="absolute inset-y-[14px] left-0 right-0"
                    style={{
                      background: "linear-gradient(to right, #0a0a0a, #1a1a1a 30%, #1a1a1a 70%, #0a0a0a)",
                      borderRadius: "5px",
                      boxShadow: "inset 2px 2px 6px rgba(0,0,0,0.9), inset -1px -1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.3), 0 0 0 2px rgba(255,255,255,0.05)",
                    }}
                  />
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={crossfader}
                    onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                    className="w-full relative z-10"
                    style={{ WebkitAppearance: "none", appearance: "none", background: "transparent", height: "40px" }}
                  />
                </div>
                <span className="label" style={{ margin: 0, fontSize: "12px", minWidth: "20px" }}>B</span>
              </div>
              <div className="label" style={{ fontSize: "12px", marginTop: "4px" }}>CROSSFADER</div>
            </div>
          )}

          {/* Recording complete — export options */}
          {pendingRecording && (
            <div className="zone-inset flex flex-col items-center gap-3 py-4">
              <span
                className="text-[12px] tracking-[2px] uppercase"
                style={{ color: "var(--accent-gold)", fontFamily: "var(--font-display)" }}
              >
                RECORDING COMPLETE
              </span>
              <div className="flex gap-4">
                <button
                  onClick={downloadRecordingWAV}
                  disabled={isConvertingWav}
                  className="border border-[var(--accent-gold)] px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
                  style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", background: "transparent" }}
                >
                  {isConvertingWav ? "CONVERTING..." : "DOWNLOAD WAV"}
                </button>
                <button
                  onClick={downloadRecordingMP3}
                  disabled={isConvertingMp3}
                  className="border border-[var(--accent-gold)] px-4 py-2 text-[12px] uppercase tracking-wider disabled:opacity-50"
                  style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", background: "transparent" }}
                >
                  {isConvertingMp3 ? "CONVERTING..." : "DOWNLOAD MP3"}
                </button>
                <button
                  onClick={exportRecordingMP4}
                  className="border-2 border-[var(--accent-gold)] px-4 py-2 text-[12px] uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-tech)", color: "var(--accent-gold)", background: "transparent" }}
                >
                  EXPORT MP4
                </button>
                <button
                  onClick={clearPendingRecording}
                  className="border border-[#333] px-4 py-2 text-[12px] uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-tech)", color: "var(--text-dark)", background: "transparent" }}
                >
                  DISCARD
                </button>
              </div>
            </div>
          )}

          {/* Master output bus */}
          <div className="flex justify-center boot-stagger boot-delay-4">
            <button
              onClick={() => setShowMasterEQ(!showMasterEQ)}
              className={detailBtnClass(showMasterEQ)}
              style={detailBtnStyle}
            >
              MASTER EQ
            </button>
          </div>
          {showMasterEQ && (
            <div className="zone-inset boot-stagger boot-delay-4">
              <MasterBus />
            </div>
          )}
        </div>

        <Toast />
        <div className="mt-16 py-5 border-t border-[#333] text-center">
          <a href="https://thegoodinternet.app" target="_blank" rel="noopener noreferrer" className="uppercase tracking-[1px]" style={{ fontSize: "10px", fontWeight: 300, color: "var(--text-muted, #777)", textDecoration: "none" }}>IN PUBLIC</a>
        </div>
      </div>
      {manualOpen && <Manual onClose={() => setManualOpen(false)} />}
      {loadModalOpen && <SaveLoadModal onClose={() => setLoadModalOpen(false)} />}
      {pendingVideoExport && (
        <ExportVideoModalRemix
          audioBlob={pendingVideoExport}
          defaultFilename={`${deckA.sourceFilename || "deck-a"}${deckB.sourceBuffer ? `-x-${deckB.sourceFilename || "deck-b"}` : ""}-driftwave`}
          initialArtist={[deckA.artist, deckB.artist].filter(Boolean).join(" x ")}
          initialTitle={[deckA.title, deckB.title].filter(Boolean).join(" / ")}
          onClose={clearPendingExport}
        />
      )}
    </main>
  );
}

function SceneMatchBrowser() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[1100px] flex flex-col gap-5">
        <div className="console flex flex-col gap-5">
          <div className="flex items-center gap-4 px-3 boot-stagger boot-delay-1">
            <div className="w-6 h-6 border-[3px] border-[var(--text-dark)] rounded-[4px] relative">
              <div className="absolute inset-[4px] bg-[var(--text-dark)]" />
            </div>
            <span className="text-lg sm:text-xl tracking-[2px] uppercase" style={{ color: "var(--text-dark)", fontFamily: "var(--font-display)" }}>
              AUTO MASH
            </span>
          </div>
          <div className="zone-inset boot-stagger boot-delay-2">
            <Deck id="A" />
          </div>
        </div>
        <DeckBMatches />
      </div>
    </main>
  );
}

function SceneRouter() {
  const deckA = useRemixStore((s) => s.deckA);
  const deckB = useRemixStore((s) => s.deckB);
  const searchParams = useSearchParams();

  // If URL has deck params, go straight to dual-deck (Scene 3)
  const hasUrlParams = searchParams.get("a_artist") || searchParams.get("s");

  // Scene 1: no Deck A loaded
  const deckAReady = deckA.sourceBuffer && (deckA.baseKey !== null || deckA.calculatedBPM !== null);
  // Scene 3: both decks loaded
  const deckBReady = deckB.sourceBuffer;

  if (hasUrlParams || (deckAReady && deckBReady)) {
    return <HomeInner />;
  }

  if (deckAReady) {
    return <SceneMatchBrowser />;
  }

  return <SceneLanding />;
}

export default function Home() {
  return (
    <Suspense>
      <SceneRouter />
    </Suspense>
  );
}
