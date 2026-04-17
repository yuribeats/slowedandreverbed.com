import { NextRequest, NextResponse } from "next/server";

const KEY_MAP: Record<string, number> = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
  "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
  "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
};

function parseKey(keyStr: string): { noteIndex: number; mode: "major" | "minor" } | null {
  if (!keyStr) return null;
  const parts = keyStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const noteIndex = KEY_MAP[parts[0]];
  if (noteIndex === undefined) return null;
  const mode = parts[1].toLowerCase() === "major" ? "major" : "minor";
  return { noteIndex, mode };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const key = params.get("key") ?? "";
  const bpmMin = params.get("bpmMin") ?? "";
  const bpmMax = params.get("bpmMax") ?? "";
  const range = params.get("range") ?? "3";
  const limit = params.get("limit") ?? "10";

  if (!key) {
    return NextResponse.json({ error: "Missing key param" }, { status: 400 });
  }

  const apiKey = process.env.EVERYSONG_API_KEY;
  const p = new URLSearchParams({ key, range, limit });
  if (bpmMin) p.set("bpmMin", bpmMin);
  if (bpmMax) p.set("bpmMax", bpmMax);
  if (apiKey) p.set("api_key", apiKey);

  try {
    const res = await fetch(`https://everysong.site/api/pitch-match?${p}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Everysong error: ${res.status}`);
    const data = await res.json();

    const results = ((data.results ?? []) as Record<string, unknown>[]).map((bucket) => ({
      shift: bucket.shift,
      sourceKey: bucket.sourceKey,
      targetKey: bucket.targetKey,
      tracks: ((bucket.tracks ?? []) as Record<string, unknown>[]).map((t) => {
        const keyParsed = parseKey((t.key as string) ?? "");
        return {
          artist: t.artist,
          title: t.title,
          bpm: t.bpm ? Math.round((t.bpm as number) * 10) / 10 : null,
          key: t.key ?? null,
          noteIndex: keyParsed?.noteIndex ?? null,
          mode: keyParsed?.mode ?? null,
          popularity: (t.popularity as number) ?? 0,
          shift: bucket.shift,
        };
      }),
    }));

    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pitch match failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
