import { config } from "dotenv";
import { PinataSDK } from "pinata";

config({ path: ".env.local" });

const { PINATA_JWT, PINATA_GATEWAY } = process.env;
if (!PINATA_JWT || !PINATA_GATEWAY) {
  console.error("Missing PINATA_JWT or PINATA_GATEWAY in .env.local");
  process.exit(1);
}

const pinata = new PinataSDK({ pinataJwt: PINATA_JWT, pinataGateway: PINATA_GATEWAY });

async function searchYouTube(query) {
  const body = {
    context: { client: { clientName: "WEB", clientVersion: "2.20231121.09.00" } },
    query,
  };
  const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
  const v = contents?.find((i) => i.videoRenderer)?.videoRenderer;
  if (!v?.videoId) return null;
  return `https://youtube.com/watch?v=${v.videoId}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  const searchMode = process.argv.includes("--search");

  const result = await pinata.files.public.list().order("DESC").limit(1000).keyvalues({ type: "driftwave-video" });
  const files = result.files;
  console.log(`Found ${files.length} driftwave-video files in Pinata`);

  let flagged = 0;
  let skipped = 0;
  let searched = 0;
  let failed = 0;

  for (const f of files) {
    if (f.keyvalues?.youtubeUrl) {
      skipped++;
      continue;
    }

    const artist = f.keyvalues?.artist || "";
    const title = f.keyvalues?.title || "";
    let youtubeUrl;

    if (searchMode && artist && title) {
      try {
        youtubeUrl = await searchYouTube(`${artist} ${title} slowed reverb`);
        if (youtubeUrl) searched++;
      } catch (e) {
        console.error(`search error for ${artist} - ${title}:`, e.message);
      }
    }

    if (!youtubeUrl) {
      const q = encodeURIComponent(`${artist} ${title} slowed reverb`.trim() || "SLOWANDREVERBEDMACHINE");
      youtubeUrl = `https://www.youtube.com/results?search_query=${q}`;
    }

    console.log(`${dryRun ? "[DRY] " : ""}flag ${f.id} "${artist} - ${title}" -> ${youtubeUrl.slice(0, 80)}`);

    if (!dryRun) {
      try {
        await pinata.files.public.update({ id: f.id, keyvalues: { youtubeUrl } });
        flagged++;
      } catch (e) {
        console.error(`  update failed:`, e.message);
        failed++;
      }
    }
    if (searchMode) await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. flagged=${flagged} skipped=${skipped} searched=${searched} failed=${failed} total=${files.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
