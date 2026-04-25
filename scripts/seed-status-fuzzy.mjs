#!/usr/bin/env node
// Re-runs lookups on the misses from data/seed_status.csv using the same
// fuzzy fallback the worker employs (artist-only + title-word overlap ≥ 0.5).
// Reports incremental coverage on top of the strict pass.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.AUTOMASH_BASE ?? "https://automash.xyz";

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

const STOPWORDS = new Set([
  "the","a","an","of","to","in","on","and","or","for","with",
  "feat","featuring","ft","remix","remastered","remaster","version","edit",
]);
function tokens(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !STOPWORDS.has(w));
}
function titleOverlap(a, b) {
  const at = new Set(tokens(a)), bt = new Set(tokens(b));
  if (at.size === 0 || bt.size === 0) return 0;
  let n = 0;
  for (const t of at) if (bt.has(t)) n++;
  return n / Math.min(at.size, bt.size);
}

async function fetchJSON(url, ms) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fuzzyLookup(artist, title) {
  const params = new URLSearchParams({
    artist, limit: "20", sort: "popularity", dir: "desc", popMin: "1",
  });
  const json = await fetchJSON(`${BASE}/api/everysong/search?${params}`, 45000);
  const tracks = json?.results ?? [];
  if (tracks.length === 0) return null;
  const scored = tracks
    .filter(t => t.bpm && t.key)
    .map(t => ({ ...t, score: titleOverlap(title, t.title) }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score < 0.5) return null;
  return scored[0];
}

async function main() {
  const csv = await readFile(join(ROOT, "data/seed_status.csv"), "utf8");
  const rows = parseCsv(csv);
  const header = rows[0];
  const data = rows.slice(1).filter(r => r.length >= 6);

  const FOUND_COL = header.indexOf("found");
  const misses = data.filter(r => r[FOUND_COL] === "0");
  console.log(`Strict pass: ${data.length - misses.length}/${data.length} hits`);
  console.log(`Running fuzzy on ${misses.length} misses...`);

  let recovered = 0, completed = 0;
  const results = new Map(); // year-rank → recovered track or null

  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < misses.length) {
      const i = cursor++;
      const r = misses[i];
      const [year, rank, song, singer] = r;
      const got = await fuzzyLookup(singer, song);
      results.set(`${year}-${rank}`, got);
      if (got) recovered++;
      completed++;
      if (completed % 50 === 0) {
        console.log(`  ${completed}/${misses.length}  recovered=${recovered}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const totalHits = (data.length - misses.length) + recovered;
  const pct = (totalHits / data.length * 100).toFixed(1);
  console.log(`\nDone.`);
  console.log(`  Strict hits:      ${data.length - misses.length}`);
  console.log(`  Fuzzy recovered:  ${recovered}`);
  console.log(`  Combined:         ${totalHits}/${data.length}  (${pct}%)`);

  // Also write a sample of recoveries to inspect quality
  const sample = [...results.entries()].filter(([, t]) => t).slice(0, 30);
  console.log(`\nSample fuzzy recoveries (first 30):`);
  for (const [yr, t] of sample) {
    const [year, rank] = yr.split("-");
    const orig = data.find(r => r[0] === year && r[1] === rank);
    console.log(`  ${year}#${rank}  "${orig[3]} - ${orig[2]}"  →  "${t.artist} - ${t.title}"  score=${t.score.toFixed(2)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
