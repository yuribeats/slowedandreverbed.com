#!/usr/bin/env node
// Usage: node scripts/seed-status.mjs
// Reads data/seed_billboard.csv, reorders rank-first, queries everysong for
// each (artist, title), reports coverage of BPM + key.
// Writes data/seed_status.csv with per-row hit/miss + bpm/key.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvKey() {
  const env = await readFile(join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^EVERYSONG_API_KEY=(.+)$/m);
  if (!m) throw new Error("EVERYSONG_API_KEY missing in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// Minimal RFC4180 CSV parser: handles quoted fields and embedded commas.
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

async function main() {
  const apiKey = await loadEnvKey();
  const csv = await readFile(join(ROOT, "data/seed_billboard.csv"), "utf8");
  const rows = parseCsv(csv).filter(r => r.length >= 5 && r[0] && r[1]);
  // Header row has empty first two cells (",,song,singer,urls"); skip it
  const data = rows.filter(r => /^\d+$/.test(r[0]));

  // Rank-first order: sort by rank ascending, year ascending as tiebreak
  data.sort((a, b) => parseInt(a[1]) - parseInt(b[1]) || parseInt(a[0]) - parseInt(b[0]));

  console.log(`Loaded ${data.length} rows. Querying everysong...`);

  const out = [["year", "rank", "song", "singer", "url", "found", "bpm", "key", "spotifyTitle", "spotifyArtist"]];
  let hit = 0, withBpmKey = 0;

  const CONCURRENCY = 6;
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < data.length) {
      const i = cursor++;
      const [year, rank, song, singer, url] = data[i];
      const params = new URLSearchParams({
        artist: singer,
        title: song,
        limit: "1",
        api_key: apiKey,
        popMin: "1",
        sort: "popularity",
        dir: "desc",
      });
      let found = false, bpm = "", key = "", spotTitle = "", spotArtist = "";
      try {
        const res = await fetch(`https://everysong.site/api/search?${params}`);
        if (res.ok) {
          const json = await res.json();
          const t = (json.tracks ?? [])[0];
          if (t) {
            found = true;
            hit++;
            bpm = t.bpm ?? "";
            key = t.key ?? "";
            spotTitle = t.title ?? "";
            spotArtist = t.artist ?? "";
            if (bpm && key) withBpmKey++;
          }
        }
      } catch (e) {
        // network error — leave found=false
      }
      out[i + 1] = [year, rank, song, singer, url, found ? "1" : "0", bpm, key, spotTitle, spotArtist];
      completed++;
      if (completed % 100 === 0) {
        console.log(`  ${completed}/${data.length}  hit=${hit}  bpm+key=${withBpmKey}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Stable order in output
  const ordered = [out[0], ...data.map((_, i) => out[i + 1])];
  const csvOut = ordered.map(r => r.map(v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  await writeFile(join(ROOT, "data/seed_status.csv"), csvOut);

  console.log(`\nDone.`);
  console.log(`  Total rows:        ${data.length}`);
  console.log(`  Found in everysong: ${hit}  (${(hit/data.length*100).toFixed(1)}%)`);
  console.log(`  With BPM + key:    ${withBpmKey}  (${(withBpmKey/data.length*100).toFixed(1)}%)`);
  console.log(`Wrote data/seed_status.csv`);
}

main().catch(e => { console.error(e); process.exit(1); });
