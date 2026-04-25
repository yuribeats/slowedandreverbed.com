#!/usr/bin/env node
// Re-run a specific (Deck A, Deck B) pair against the deployed /batch/auto.
// Bypasses the seek loop and pairs.json filtering — meant for manually
// fixing failed runs or producing one-offs without disturbing the cursor.
//
// Usage:
//   node rerun-pair.mjs "<instArtist>" "<instTitle>" "<acapArtist>" "<acapTitle>" [style]
//
// Example:
//   node rerun-pair.mjs \
//     "Wings" "Silly Love Songs - 2014 Remaster" \
//     "Sleepy Hallow, Doechii" "ANXIETY (feat. Doechii)" \
//     mashup

import puppeteer from "puppeteer";

const BASE = process.env.AUTOMASH_BASE ?? "https://automash.xyz";
const HEADLESS = process.env.AUTOMASH_HEADLESS !== "false";
const TIMEOUT_MS = parseInt(process.env.AUTOMASH_TICK_TIMEOUT_MS ?? "900000", 10);

const [, , instArtist, instTitle, acapArtist, acapTitle, style = "mashup"] = process.argv;

if (!instArtist || !instTitle || !acapArtist || !acapTitle) {
  console.error('Usage: node rerun-pair.mjs "<instArtist>" "<instTitle>" "<acapArtist>" "<acapTitle>" [style]');
  process.exit(1);
}

const url = `${BASE}/batch/auto?${new URLSearchParams({
  instArtist, instTitle, acapArtist, acapTitle, style,
})}`;

console.log(`[rerun] ${instArtist} × ${acapArtist}`);
console.log(`[rerun] ${url}`);

const browser = await puppeteer.launch({
  headless: HEADLESS,
  protocolTimeout: TIMEOUT_MS,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  page.on("console", msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", err => console.log(`[browser:pageerror] ${err.message}`));

  await page.goto(url, { waitUntil: "domcontentloaded" });

  const handle = await page.waitForFunction(
    () => window.__automashResult ?? null,
    { timeout: TIMEOUT_MS, polling: 2000 }
  );
  const result = await handle.jsonValue();
  console.log(`[rerun] result:`, JSON.stringify(result));
  if (!result?.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
