#!/usr/bin/env node
// Single-tick automash worker.
//
// Runs ONE mashup attempt, then exits. Designed to be invoked by cron / systemd
// timer every 10 min. Concurrency is enforced by a lock file — overlapping ticks
// no-op cleanly.
//
// Steps:
//   1. Acquire lock (PID file). If held, exit 0.
//   2. Read seed CSV (rank-first sorted Billboard top-2500).
//   3. Read state file (cursor, completed pairs).
//   4. Pick next Deck A by cursor; advance past any rows with no everysong match.
//   5. Look up Deck A's BPM/key via everysong; if missing, advance and retry.
//   6. Pitch-match query → top 25; filter out tracks already paired with this Deck A; pick random.
//   7. Open Puppeteer, navigate to /batch/auto?... with both pairs.
//   8. Wait for window.__automashResult; record.
//   9. Append to state, advance cursor, write state.
//  10. Release lock.
//
// Env:
//   AUTOMASH_BASE        — default https://automash.xyz
//   AUTOMASH_DATA_DIR    — default ../data (relative to this script)
//   AUTOMASH_HEADLESS    — "true"/"false" (default true)
//   AUTOMASH_TICK_TIMEOUT_MS — default 900000 (15 min)

import { readFile, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = process.env.AUTOMASH_DATA_DIR ?? join(REPO_ROOT, "data");
const SEED_CSV = join(DATA_DIR, "seed_billboard.csv");
const STATE_FILE = join(DATA_DIR, "pairs.json");
const RUNS_CSV = join(DATA_DIR, "runs.csv");
const LOCK_FILE = join(DATA_DIR, ".worker.lock");
const BASE = process.env.AUTOMASH_BASE ?? "https://automash.xyz";
const HEADLESS = process.env.AUTOMASH_HEADLESS !== "false";
const TICK_TIMEOUT_MS = parseInt(process.env.AUTOMASH_TICK_TIMEOUT_MS ?? "900000", 10);

/* ─── CSV parsing ─── */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") {/* skip */}
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ─── State ─── */
async function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { version: 1, cursor: 0, paused: false, pairs: [] };
  }
  return JSON.parse(await readFile(STATE_FILE, "utf8"));
}

async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function appendRun(row) {
  const header = "timestamp,status,instArtist,instTitle,acapArtist,acapTitle,galleryUrl,error\n";
  if (!existsSync(RUNS_CSV)) {
    await writeFile(RUNS_CSV, header);
  }
  const line = [
    row.timestamp,
    row.status,
    row.instArtist,
    row.instTitle,
    row.acapArtist,
    row.acapTitle,
    row.galleryUrl ?? "",
    row.error ?? "",
  ].map(csvEscape).join(",") + "\n";
  await readFile(RUNS_CSV, "utf8").then(existing => writeFile(RUNS_CSV, existing + line));
}

function pairKey(instArtist, instTitle, acapArtist, acapTitle) {
  const a = `${instArtist}::${instTitle}`.toLowerCase();
  const b = `${acapArtist}::${acapTitle}`.toLowerCase();
  return [a, b].sort().join("||");
}

/* ─── Artist + title canonicalization for dedup ─── */
// Pull out individual collaborators: "Sleepy Hallow, Doechii" → ["sleepy hallow", "doechii"].
// Catches comma, ampersand, "feat", "ft", " x ", " vs ".
function expandArtists(artistField) {
  return (artistField || "")
    .toLowerCase()
    .split(/,|&|\bfeat\b\.?|\bft\b\.?|\bx\b|\bvs\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Strip "(feat. X)" suffixes and "- 2014 Remaster" tails so "ANXIETY (feat. Doechii)"
// and "Anxiety" both collapse to the same key.
function canonTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/\s*\((feat|ft|with)\.?[^)]*\)\s*/g, " ")
    .replace(/\s*-\s*\d{0,4}\s*remaster.*$/i, "")
    .replace(/\s*-\s*remaster.*$/i, "")
    .replace(/\s*-\s*remix.*$/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ─── Lock ─── */
async function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    const pid = parseInt(await readFile(LOCK_FILE, "utf8"), 10);
    try {
      process.kill(pid, 0); // signal 0 = check if alive
      console.log(`[lock] held by PID ${pid}, exiting`);
      return false;
    } catch {
      console.log(`[lock] stale lock (PID ${pid} dead), reclaiming`);
    }
  }
  await writeFile(LOCK_FILE, String(process.pid));
  return true;
}

async function releaseLock() {
  try { await access(LOCK_FILE); await writeFile(LOCK_FILE, ""); } catch {}
}

/* ─── Seed list ─── */
async function loadSeed() {
  const text = await readFile(SEED_CSV, "utf8");
  const rows = parseCsv(text).filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
  // Rank-first: rank ascending, year ascending tiebreak
  rows.sort((a, b) => parseInt(a[1]) - parseInt(b[1]) || parseInt(a[0]) - parseInt(b[0]));
  return rows.map(r => ({ year: r[0], rank: r[1], title: r[2], artist: r[3], url: r[4] }));
}

/* ─── Everysong queries (resilient) ─── */
async function fetchJSON(url, timeoutMs) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.warn(`[fetch] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[fetch] ${url} → ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/* ─── Title fuzzy match ─── */
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "and", "or", "for", "with", "feat",
  "featuring", "ft", "remix", "remastered", "remaster", "version", "edit",
]);
function tokens(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(w => w && !TITLE_STOPWORDS.has(w));
}
function titleOverlap(a, b) {
  const at = new Set(tokens(a));
  const bt = new Set(tokens(b));
  if (at.size === 0 || bt.size === 0) return 0;
  let intersect = 0;
  for (const t of at) if (bt.has(t)) intersect++;
  return intersect / Math.min(at.size, bt.size); // share-of-shorter
}

async function lookupTrack(artist, title) {
  // 1. Strict (artist, title) via driftwave's /api/everysong
  const strictParams = new URLSearchParams({ artist, title });
  const strict = await fetchJSON(`${BASE}/api/everysong?${strictParams}`, 45000);
  if (strict?.found && strict.bpm && strict.key) {
    return { artist: strict.artist, title: strict.title, bpm: strict.bpm, key: strict.key, matched: "strict" };
  }

  // 2. Artist-only fallback: pull top 20 by popularity, score by title overlap
  const fallbackParams = new URLSearchParams({
    artist, limit: "20", sort: "popularity", dir: "desc", popMin: "1",
  });
  const search = await fetchJSON(`${BASE}/api/everysong/search?${fallbackParams}`, 45000);
  const tracks = search?.results ?? [];
  if (tracks.length === 0) return null;

  const scored = tracks
    .filter(t => t.bpm && t.key)
    .map(t => ({ ...t, score: titleOverlap(title, t.title) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < 0.5) return null;
  const best = scored[0];
  return { artist: best.artist, title: best.title, bpm: best.bpm, key: best.key, matched: `fuzzy(${best.score.toFixed(2)})` };
}

// Same-key + relative-minor/major pair, ± 10 BPM, excluding Deck A.
// Mirrors automash.xyz's Deck B sourcing (DeckBMatches → /api/everysong/match).
const NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
function relativePair(keyName) {
  const [note, mode] = keyName.trim().split(/\s+/);
  const idx = NOTES.indexOf(note);
  if (idx < 0) return [keyName];
  if (mode.toLowerCase() === "major") {
    return [keyName, `${NOTES[(idx - 3 + 12) % 12]} Minor`];
  }
  return [keyName, `${NOTES[(idx + 3) % 12]} Major`];
}

async function findDeckBCandidates(deckAKey, deckABpm, deckAArtist, deckATitle) {
  const keys = relativePair(deckAKey).join(",");
  const params = new URLSearchParams({
    keys,
    bpmMin: String(Math.round(deckABpm - 10)),
    bpmMax: String(Math.round(deckABpm + 10)),
    sort: "popularity",
    dir: "desc",
    limit: "100",
    page: "0",
    excludeArtist: deckAArtist,
    excludeTitle: deckATitle,
  });
  const json = await fetchJSON(`${BASE}/api/everysong/match?${params}`, 60000);
  return json?.tracks ?? [];
}

/* ─── Browser run ─── */
async function runMashup(pair) {
  const url = `${BASE}/batch/auto?${new URLSearchParams({
    instArtist: pair.instArtist,
    instTitle: pair.instTitle,
    acapArtist: pair.acapArtist,
    acapTitle: pair.acapTitle,
    style: pair.style ?? "mashup",
  })}`;

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    protocolTimeout: TICK_TIMEOUT_MS, // CDP-level timeout — must exceed renderToBlob duration
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    page.on("console", msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
    page.on("pageerror", err => console.log(`[browser:pageerror] ${err.message}`));

    console.log(`[run] navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for terminal status
    const handle = await page.waitForFunction(
      () => window.__automashResult ?? null,
      { timeout: TICK_TIMEOUT_MS, polling: 2000 }
    );
    return await handle.jsonValue();
  } finally {
    await browser.close();
  }
}

/* ─── Main ─── */
async function main() {
  if (!(await acquireLock())) return;

  try {
    const state = await loadState();
    if (state.paused) {
      console.log("[main] paused — exiting");
      return;
    }

    const seed = await loadSeed();
    if (state.cursor >= seed.length) {
      console.log("[main] cursor exhausted, exiting");
      return;
    }

    // Build sets of already-paired keys + already-used Deck B songs
    const paired = new Set(state.pairs.map(p =>
      pairKey(p.instArtist, p.instTitle, p.acapArtist, p.acapTitle)
    ));
    const usedDeckB = new Set(state.pairs.map(p =>
      `${p.acapArtist}::${p.acapTitle}`.toLowerCase()
    ));
    // Cross-deck dedup: any artist or title that's appeared in EITHER deck
    // cannot appear again on either side. Catches:
    //   - same artist as Deck B in two different pairs
    //   - same Billboard song mashed twice across charts
    //   - song that was Deck A appearing as Deck B in a later pair
    //   - song that was Deck B getting mashed as Deck A
    const usedArtists = new Set();
    const usedTitles = new Set();
    for (const p of state.pairs) {
      for (const name of expandArtists(p.acapArtist)) usedArtists.add(name);
      for (const name of expandArtists(p.instArtist)) usedArtists.add(name);
      const tb = canonTitle(p.acapTitle);
      if (tb) usedTitles.add(tb);
      const ta = canonTitle(p.instTitle);
      if (ta) usedTitles.add(ta);
    }

    // Find a usable Deck A: must have BPM+key in everysong, and have at least one
    // unpaired Deck B candidate. Advance cursor past failures.
    let deckA = null;
    let deckB = null;
    let attempts = 0;
    const MAX_ADVANCE = 50;

    while (state.cursor < seed.length && attempts < MAX_ADVANCE) {
      attempts++;
      const candidate = seed[state.cursor];
      console.log(`[seek] cursor=${state.cursor} candidate="${candidate.artist} - ${candidate.title}"`);

      const lookup = await lookupTrack(candidate.artist, candidate.title);
      if (!lookup || !lookup.bpm || !lookup.key) {
        console.log(`[seek] no BPM/key for Deck A, advancing`);
        state.cursor++;
        continue;
      }
      // Skip Deck A if its canonical title or any of its artists has been
      // used in EITHER deck before.
      const lookupTitle = canonTitle(lookup.title);
      if (lookupTitle && usedTitles.has(lookupTitle)) {
        console.log(`[seek] Deck A "${lookup.title}" title already used (either deck), advancing`);
        state.cursor++;
        continue;
      }
      const lookupArtists = expandArtists(lookup.artist);
      if (lookupArtists.some(a => usedArtists.has(a))) {
        console.log(`[seek] Deck A artist "${lookup.artist}" already used (either deck), advancing`);
        state.cursor++;
        continue;
      }
      console.log(`[seek] matched (${lookup.matched}): "${lookup.artist} - ${lookup.title}" (BPM ${lookup.bpm}, ${lookup.key})`);

      const allCandidates = await findDeckBCandidates(lookup.key, lookup.bpm, lookup.artist, lookup.title);
      if (allCandidates.length === 0) {
        console.log(`[seek] no key+BPM matches, advancing`);
        state.cursor++;
        continue;
      }

      // Tiered fallback: prefer top 25, then top 50, then top 100. Expand only
      // when the lower tier is fully exhausted (every candidate already used as
      // Deck B or already paired with this Deck A).
      const isFresh = c => {
        const cKey = `${c.artist}::${c.title}`.toLowerCase();
        if (usedDeckB.has(cKey)) return false;
        if (paired.has(pairKey(lookup.artist, lookup.title, c.artist, c.title))) return false;
        // Any individual artist already used in EITHER deck (even as a feature)?
        for (const a of expandArtists(c.artist)) {
          if (usedArtists.has(a)) return false;
          if (lookupArtists.includes(a)) return false; // same Deck A artist as Deck B
        }
        // Canonical title already used in either deck (or matches Deck A's title)?
        const ct = canonTitle(c.title);
        if (ct && usedTitles.has(ct)) return false;
        if (ct && ct === lookupTitle) return false;
        return true;
      };
      const TIERS = [25, 50, 100];
      let pickedB = null;
      for (const tier of TIERS) {
        const survivors = allCandidates.slice(0, tier).filter(isFresh);
        if (survivors.length > 0) {
          pickedB = survivors[Math.floor(Math.random() * survivors.length)];
          console.log(`[seek] picked from top ${tier} (${survivors.length} fresh of ${Math.min(tier, allCandidates.length)})`);
          break;
        }
        console.log(`[seek] top ${tier} fully exhausted, expanding`);
      }
      if (!pickedB) {
        console.log(`[seek] top 100 exhausted, advancing Deck A`);
        state.cursor++;
        continue;
      }

      deckA = lookup;
      deckB = pickedB;
      break;
    }

    if (!deckA || !deckB) {
      console.log("[main] no usable pair found in MAX_ADVANCE, exiting");
      await saveState(state);
      return;
    }

    console.log(`[main] PAIR  A: "${deckA.artist} - ${deckA.title}" (BPM ${deckA.bpm}, ${deckA.key})`);
    console.log(`[main]       B: "${deckB.artist} - ${deckB.title}" (BPM ${deckB.bpm}, ${deckB.key})`);

    const pairRecord = {
      id: crypto.randomUUID(),
      instArtist: deckA.artist,
      instTitle: deckA.title,
      acapArtist: deckB.artist,
      acapTitle: deckB.title,
      instBpm: deckA.bpm,
      instKey: deckA.key,
      acapBpm: deckB.bpm,
      acapKey: deckB.key,
      style: "mashup",
      cursorAtRun: state.cursor,
      createdAt: new Date().toISOString(),
      status: "running",
    };

    let result;
    try {
      result = await runMashup({
        instArtist: deckA.artist,
        instTitle: deckA.title,
        acapArtist: deckB.artist,
        acapTitle: deckB.title,
        style: "mashup",
      });
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    if (result?.ok) {
      pairRecord.status = "ok";
      pairRecord.galleryUrl = result.galleryUrl;
      pairRecord.audioCid = result.audioCid;
    } else {
      pairRecord.status = "error";
      pairRecord.error = result?.error ?? "unknown";
    }

    state.pairs.push(pairRecord);
    state.cursor++; // advance after every attempt, success or fail
    await saveState(state);
    await appendRun({
      timestamp: pairRecord.createdAt,
      status: pairRecord.status,
      instArtist: pairRecord.instArtist,
      instTitle: pairRecord.instTitle,
      acapArtist: pairRecord.acapArtist,
      acapTitle: pairRecord.acapTitle,
      galleryUrl: pairRecord.galleryUrl,
      error: pairRecord.error,
    });

    console.log(`[main] done: status=${pairRecord.status} gallery=${pairRecord.galleryUrl ?? "-"}`);
  } finally {
    await releaseLock();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
