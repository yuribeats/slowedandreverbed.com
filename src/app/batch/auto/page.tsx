"use client";

// Headless-driven auto-batch endpoint. Accepts URL params and runs the same
// pipeline as /batch's automatic mode without any UI interaction. Designed to
// be driven by a Puppeteer worker.
//
// URL params:
//   instArtist, instTitle  — Deck A (instrumental side)
//   acapArtist, acapTitle  — Deck B (acapella / vocal side)
//   style                  — "mashup" | "slowed" | "chipmunk" (default "mashup")
//
// Worker integration points:
//   document.body[data-automash-status]  reflects current step
//   window.__automashResult               populated on terminal state
//
// Terminal states for status: "DONE", "ERROR", "BAD_PARAMS"

import { useEffect, useRef, useState } from "react";
import { useRemixStore } from "../../../../lib/remix-store";
import { artistKey, BatchStyle } from "../../../../lib/batch-presets";
import { generateCover } from "../../../../lib/cover-generator";

type AutomashResult =
  | { ok: true; galleryUrl: string; audioCid: string; artist: string; title: string }
  | { ok: false; error: string };

declare global {
  interface Window {
    __automashStatus?: string;
    __automashResult?: AutomashResult;
  }
}

async function uploadToPinata(blob: Blob, filename: string): Promise<string> {
  const urlRes = await fetch("/api/pinata-upload-url", { method: "POST" });
  if (!urlRes.ok) throw new Error("Failed to get Pinata upload URL");
  const { url } = await urlRes.json();
  const fd = new FormData();
  fd.append("file", blob, filename);
  const uploadRes = await fetch(url, { method: "POST", body: fd });
  if (!uploadRes.ok) throw new Error(`Pinata upload failed: ${uploadRes.status}`);
  const data = await uploadRes.json();
  return data.data?.cid || data.cid;
}

export default function AutoBatchPage() {
  const loadDeck = useRemixStore((s) => s.loadDeck);
  const applyStylePreset = useRemixStore((s) => s.applyStylePreset);
  const renderToBlob = useRemixStore((s) => s.renderToBlob);

  const [status, setStatus] = useState("INIT");
  const [resultText, setResultText] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const sp = new URLSearchParams(window.location.search);
    const instArtist = sp.get("instArtist") ?? "";
    const instTitle = sp.get("instTitle") ?? "";
    const acapArtist = sp.get("acapArtist") ?? "";
    const acapTitle = sp.get("acapTitle") ?? "";
    const style = (sp.get("style") ?? "mashup") as BatchStyle;

    if (!instArtist || !instTitle || !acapArtist || !acapTitle) {
      setStatus("BAD_PARAMS");
      window.__automashResult = { ok: false, error: "Missing instArtist/instTitle/acapArtist/acapTitle" };
      return;
    }

    const computedArtist = `${artistKey(instArtist)}x${artistKey(acapArtist)}`;
    const computedTitle = `${instTitle} / ${acapTitle}`;

    (async () => {
      try {
        setStatus("LOADING_TRACKS");
        await Promise.all([
          loadDeck("A", instArtist, instTitle),
          loadDeck("B", acapArtist, acapTitle),
        ]);

        // Mirror the canonical /-page armed condition: bothLoaded && bothStems
        // && bothDownbeat. loadDeck fires off separateStems + detectDownbeat in
        // the background and returns early — we have to poll the store until
        // both finish, otherwise renderToBlob runs against the full mix.
        setStatus("AWAITING_STEMS_AND_DOWNBEATS");
        const STEM_TIMEOUT_MS = 10 * 60 * 1000;
        const start = Date.now();
        const ready = () => {
          const s = useRemixStore.getState();
          return (
            !!s.deckA.stemBuffers &&
            !!s.deckB.stemBuffers &&
            s.deckA.firstDownbeatMs !== null &&
            s.deckB.firstDownbeatMs !== null
          );
        };
        while (!ready()) {
          if (Date.now() - start > STEM_TIMEOUT_MS) {
            const s = useRemixStore.getState();
            const missing = [
              !s.deckA.stemBuffers && "A.stems",
              !s.deckB.stemBuffers && "B.stems",
              s.deckA.firstDownbeatMs === null && "A.downbeat",
              s.deckB.firstDownbeatMs === null && "B.downbeat",
            ].filter(Boolean);
            throw new Error(`Timed out waiting for: ${missing.join(", ")}`);
          }
          if (useRemixStore.getState().deckA.stemError) throw new Error(`A stems failed: ${useRemixStore.getState().deckA.stemError}`);
          if (useRemixStore.getState().deckB.stemError) throw new Error(`B stems failed: ${useRemixStore.getState().deckB.stemError}`);
          await new Promise(r => setTimeout(r, 1000));
        }

        // Phase-align deck B to deck A's downbeat grid.
        // Both decks default to their own first drum-derived downbeat as the
        // in-point. With BPM matched, that *should* keep them in time, but if
        // Modal flagged a sub-bar beat as "first downbeat" on either side, the
        // two will start out of phase. Walk B's grid, compute each candidate's
        // phase offset from A's first downbeat modulo one bar, pick the
        // candidate with the smallest circular distance.
        setStatus("PHASE_ALIGN");
        {
          const sA = useRemixStore.getState().deckA;
          const sB = useRemixStore.getState().deckB;
          const gridA = sA.downbeatGrid ?? [];
          const gridB = sB.downbeatGrid ?? [];
          const inA = (sA.firstDownbeatMs ?? 0) / 1000;
          if (gridA.length >= 2 && gridB.length >= 2) {
            // Median bar length from deck A's grid (guards against outliers)
            const diffsA = gridA.slice(1).map((t, i) => t - gridA[i]).sort((a, b) => a - b);
            const barA = diffsA[Math.floor(diffsA.length / 2)];

            console.log(`[align] A in=${inA.toFixed(3)}s  barA=${barA.toFixed(3)}s`);
            console.log(`[align] gridA[0..7]=${gridA.slice(0, 8).map(t => t.toFixed(2)).join(", ")}`);
            console.log(`[align] gridB[0..7]=${gridB.slice(0, 8).map(t => t.toFixed(2)).join(", ")}`);

            const CANDIDATES = Math.min(8, gridB.length);
            let best = { idx: 0, dist: Infinity, phase: 0, b: gridB[0] };
            for (let i = 0; i < CANDIDATES; i++) {
              const b = gridB[i];
              const gap = b - inA;
              const phase = ((gap % barA) + barA) % barA;          // [0, barA)
              const dist = Math.min(phase, barA - phase);            // [0, barA/2]
              if (dist < best.dist) best = { idx: i, dist, phase, b };
            }
            console.log(`[align] picked B[${best.idx}]=${best.b.toFixed(3)}s  phase=${best.phase.toFixed(3)}s  dist=${best.dist.toFixed(3)}s`);

            // Only override if our pick differs from B's existing in-point
            const currentInB = sB.regionStart;
            if (Math.abs(best.b - currentInB) > 0.001) {
              useRemixStore.getState().setRegion("B", best.b, 0);
              console.log(`[align] B in-point ${currentInB.toFixed(3)}s → ${best.b.toFixed(3)}s`);
            } else {
              console.log(`[align] B already at chosen in-point`);
            }
          } else {
            console.log(`[align] skipped — gridA.length=${gridA.length} gridB.length=${gridB.length}`);
          }
        }

        setStatus("APPLYING_STYLE");
        applyStylePreset(style);

        setStatus("RENDERING");
        const wavBlob = await renderToBlob();
        if (!wavBlob) throw new Error("Render produced no audio");

        setStatus("UPLOADING_AUDIO");
        const audioCid = await uploadToPinata(wavBlob, "mix.wav");

        setStatus("GENERATING_COVER");
        const coverBlob = await generateCover(computedArtist, computedTitle);

        setStatus("GENERATING_VIDEO");
        const fd = new FormData();
        fd.append("audioCid", audioCid);
        fd.append("image", coverBlob, "cover.png");
        fd.append("artist", computedArtist);
        fd.append("title", computedTitle);
        fd.append("watermark", "true");
        const vidRes = await fetch("/api/generate-video", { method: "POST", body: fd });
        if (!vidRes.ok) {
          const e = await vidRes.json().catch(() => ({}));
          throw new Error(e.error || `generate-video failed (${vidRes.status})`);
        }
        const { url: galleryUrl } = await vidRes.json();

        const r: AutomashResult = { ok: true, galleryUrl, audioCid, artist: computedArtist, title: computedTitle };
        window.__automashResult = r;
        setResultText(JSON.stringify(r, null, 2));
        setStatus("DONE");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const r: AutomashResult = { ok: false, error: msg };
        window.__automashResult = r;
        setResultText(JSON.stringify(r, null, 2));
        setStatus("ERROR");
      }
    })();
  }, [loadDeck, applyStylePreset, renderToBlob]);

  useEffect(() => {
    window.__automashStatus = status;
    document.body.setAttribute("data-automash-status", status);
  }, [status]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        fontFamily: "monospace",
        padding: "32px",
        whiteSpace: "pre-wrap",
      }}
    >
      <div data-status={status}>STATUS: {status}</div>
      {resultText && <div style={{ marginTop: "16px" }}>{resultText}</div>}
    </main>
  );
}
