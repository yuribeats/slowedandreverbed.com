"use client";

import { useState, useCallback } from "react";
import { useRemixStore } from "../lib/remix-store";
import { getAudioContext } from "../lib/audio-context";

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const KEY_OPTIONS = [
  ...NOTE_NAMES.map((n) => `${n} Major`),
  ...NOTE_NAMES.map((n) => `${n} Minor`),
];

type LoadPhase = "idle" | "youtube" | "audio" | "metadata" | "done" | "error";

export default function SceneLanding() {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<LoadPhase>("idle");
  const [error, setError] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [manualBPM, setManualBPM] = useState("");
  const [manualKey, setManualKey] = useState("C Major");

  const loadDeck = useRemixStore((s) => s.loadDeck);
  const setBPM = useRemixStore((s) => s.setBPM);
  const setDeckMeta = useRemixStore((s) => s.setDeckMeta);
  const deckA = useRemixStore((s) => s.deckA);

  const handleLoad = useCallback(async () => {
    if (!artist.trim() && !title.trim()) return;
    setPhase("youtube");
    setError("");
    setManualEntry(false);
    try {
      await loadDeck("A", artist.trim(), title.trim());
      // Check if Everysong found key data
      const deck = useRemixStore.getState().deckA;
      if (deck.baseKey === null) {
        setManualEntry(true);
        setPhase("idle");
      } else {
        setPhase("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "LOAD FAILED");
      setPhase("error");
      setTimeout(() => setPhase("idle"), 4000);
    }
  }, [artist, title, loadDeck]);

  const handleManualSubmit = useCallback(() => {
    const bpm = parseFloat(manualBPM);
    if (isNaN(bpm) || bpm <= 0) return;
    setBPM("A", bpm);

    // Parse key
    const parts = manualKey.split(" ");
    const noteIndex = NOTE_NAMES.indexOf(parts[0]);
    const mode = parts[1]?.toLowerCase() === "minor" ? "minor" : "major";
    if (noteIndex >= 0) {
      setDeckMeta("A", { baseKey: noteIndex, baseMode: mode });
    }
  }, [manualBPM, manualKey, setBPM, setDeckMeta]);

  const isLoading = phase === "youtube" || phase === "audio" || phase === "metadata";
  const phaseLabel =
    deckA.isLoading ? "LOADING AUDIO..." :
    deckA.isStemLoading ? "SEPARATING STEMS..." :
    deckA.downbeatDetecting ? "DETECTING DOWNBEAT..." :
    isLoading ? "SEARCHING..." : "";

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[520px]">
        <div className="console flex flex-col gap-5 boot-stagger boot-delay-1">
          {/* CRT display header */}
          <div className="flex items-stretch gap-3 px-3">
            <div
              style={{
                flex: 1,
                minWidth: 0,
                background: "radial-gradient(ellipse at center, #25391e 0%, var(--crt-bg) 70%, #16221b 100%)",
                borderRadius: "6px",
                padding: "20px 16px",
                position: "relative",
                overflow: "hidden",
                boxShadow:
                  "inset 0 0 60px rgba(0,0,0,0.65), 0 2px 10px rgba(0,0,0,0.5)",
                textAlign: "center",
              }}
            >
              {/* Scanlines */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)",
                  pointerEvents: "none",
                  mixBlendMode: "multiply",
                }}
              />
              <svg
                viewBox="0 0 800 100"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  position: "relative",
                  filter:
                    "drop-shadow(0 0 2px var(--crt-bright)) drop-shadow(0 0 6px var(--crt-bright)) drop-shadow(0 0 14px rgba(117,204,70,0.6))",
                }}
              >
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--crt-bright)"
                  fontFamily="var(--font-display)"
                  fontSize="78"
                  letterSpacing="4"
                >
                  AUTOMASH
                </text>
              </svg>
            </div>
            <a
              href="/gallery"
              className="text-[10px] sm:text-[12px] uppercase tracking-[0.1em] sm:tracking-[0.15em] px-2 sm:px-3 py-0.5 sm:py-1 border-2 self-start"
              style={{
                fontFamily: "var(--font-tech)",
                fontWeight: 700,
                color: "var(--panel-light)",
                background: "var(--control-base)",
                borderColor: "#1a1a1a",
                borderRadius: "4px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.1)",
                textDecoration: "none",
              }}
            >
              GALLERY
            </a>
          </div>

          {/* Deck A input */}
          <div className="zone-inset flex flex-col gap-4">
            {isLoading || deckA.isLoading || deckA.isStemLoading || deckA.downbeatDetecting ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <span
                  className="text-[12px] tracking-[2px] uppercase"
                  style={{
                    color: "var(--crt-bright)",
                    fontFamily: "var(--font-crt)",
                    fontSize: "14px",
                    animation: "pulse 1.5s infinite",
                  }}
                >
                  {phaseLabel}
                </span>
              </div>
            ) : (
              <>
                <span
                  className="text-[12px] tracking-[1px] uppercase"
                  style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)", opacity: 0.6 }}
                >
                  ENTER AN ARTIST, TITLE AND HIT LOAD
                </span>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[12px] tracking-[1px] uppercase shrink-0 w-[50px]"
                      style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}
                    >
                      ARTIST
                    </span>
                    <input
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                      className="tactical-input flex-1 uppercase"
                      style={{ fontSize: "14px", textTransform: "uppercase" }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[12px] tracking-[1px] uppercase shrink-0 w-[50px]"
                      style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}
                    >
                      TITLE
                    </span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                      className="tactical-input flex-1 uppercase"
                      style={{ fontSize: "14px", textTransform: "uppercase" }}
                    />
                  </div>
                </div>

                {error && (
                  <span
                    className="text-[12px] tracking-[1px] uppercase"
                    style={{ color: "var(--led-red-on, #c82828)", fontFamily: "var(--font-tech)" }}
                  >
                    {error}
                  </span>
                )}

                {manualEntry && (
                  <div className="zone-engraved flex flex-col gap-3">
                    <span
                      className="text-[12px] tracking-[1px] uppercase"
                      style={{ color: "var(--led-orange)", fontFamily: "var(--font-tech)" }}
                    >
                      NOT FOUND IN DATABASE — ENTER BPM AND KEY MANUALLY
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] tracking-[1px] uppercase shrink-0 w-[50px]" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>BPM</span>
                      <input
                        value={manualBPM}
                        onChange={(e) => setManualBPM(e.target.value)}
                        placeholder="120"
                        className="tactical-input w-[80px] uppercase"
                        style={{ fontSize: "14px" }}
                      />
                      <span className="text-[12px] tracking-[1px] uppercase shrink-0 w-[30px]" style={{ color: "var(--text-dark)", fontFamily: "var(--font-tech)" }}>KEY</span>
                      <div className="relative flex-1">
                        <select
                          value={manualKey}
                          onChange={(e) => setManualKey(e.target.value)}
                          className="tactical-input w-full uppercase"
                          style={{ fontSize: "14px", appearance: "none", WebkitAppearance: "none" }}
                        >
                          {KEY_OPTIONS.map((k) => (
                            <option key={k} value={k}>{k.toUpperCase()}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleManualSubmit}
                      disabled={!manualBPM}
                      className="tactical-button self-end"
                    >
                      SET
                    </button>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => { getAudioContext(); handleLoad(); }}
                    disabled={!artist.trim() && !title.trim()}
                    className="tactical-button"
                    style={{ opacity: (!artist.trim() && !title.trim()) ? 0.3 : 1 }}
                  >
                    LOAD
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
