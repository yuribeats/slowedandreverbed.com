#!/usr/bin/env node
// Usage: node scripts/seed-status.mjs
// Reads data/seed_billboard.csv, reorders rank-first, queries automash.xyz/api/everysong
// for each (artist, title), reports coverage of BPM + key.
// Writes data/seed_status.csv with per-row hit/miss + bpm/key.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = process.env.AUTOMASH_BASE ?? "https://automash.xyz";

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
  const csv = await readFile(join(ROOT, "data/seed_billboard.csv"), "utf8");
  const rows = parseCsv(csv).filter(r => r.length >= 5 && r[0] && r[1]);
  const data = rows.filter(r => /^\d+$/.test(r[0]));

  // Rank-first order: rank ascending, year ascending as tiebreak
  data.sort((a, b) => parseInt(a[1]) - parseInt(b[1]) || parseInt(a[0]) - parseInt(b[0]));

  console.log(`Loaded ${data.length} rows. Querying ${API_BASE}/api/everysong ...`);

  const out = new Array(data.length);
  let hit = 0, withBpmKey = 0;

  const CONCURRENCY = 6;
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < data.length) {
      const i = cursor++;
      const [year, rank, song, singer, url] = data[i];
      const params = new URLSearchParams({ artist: singer, title: song });
      let found = false, bpm = "", key = "", spotTitle = "", spotArtist = "";
      try {
        const res = await fetch(`${API_BASE}/api/everysong?${params}`, {
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.found) {
            found = true;
            hit++;
            bpm = json.bpm ?? "";
            key = json.key ?? "";
            spotTitle = json.title ?? "";
            spotArtist = json.artist ?? "";
            if (bpm && key) withBpmKey++;
          }
        }
      } catch {/* network/timeout — leave found=false */}
      out[i] = [year, rank, song, singer, url, found ? "1" : "0", bpm, key, spotTitle, spotArtist];
      completed++;
      if (completed % 100 === 0) {
        console.log(`  ${completed}/${data.length}  hit=${hit}  bpm+key=${withBpmKey}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const header = ["year", "rank", "song", "singer", "url", "found", "bpm", "key", "spotifyTitle", "spotifyArtist"];
  const csvOut = [header, ...out].map(r => r.map(v => {
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
