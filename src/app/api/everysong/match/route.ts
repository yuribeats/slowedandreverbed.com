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
  const keys = params.get("keys") ?? "";
  const bpmMin = params.get("bpmMin") ?? "";
  const bpmMax = params.get("bpmMax") ?? "";
  const page = params.get("page") ?? "0";
  const limit = params.get("limit") ?? "100";
  const sort = params.get("sort") ?? "popularity";
  const dir = params.get("dir") ?? "desc";
  const excludeArtist = params.get("excludeArtist") ?? "";
  const excludeTitle = params.get("excludeTitle") ?? "";

  if (!keys) {
    return NextResponse.json({ error: "Missing keys param" }, { status: 400 });
  }

  const apiKey = process.env.EVERYSONG_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "EVERYSONG_API_KEY not configured" }, { status: 500 });
  }

  const p = new URLSearchParams({
    key: keys,
    sort,
    dir,
    page,
    limit,
    popMin: "1",
    speechMax: "0.33",
    api_key: apiKey,
  });
  if (bpmMin) p.set("bpmMin", bpmMin);
  if (bpmMax) p.set("bpmMax", bpmMax);

  try {
    const res = await fetch(`https://everysong.site/api/search?${p}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Everysong error: ${res.status}`);
    const data = await res.json();

    const exArtist = excludeArtist.toLowerCase();
    const exTitle = excludeTitle.toLowerCase();

    const tracks = ((data.tracks ?? []) as Record<string, unknown>[])
      .filter((t) => {
        if (!exArtist && !exTitle) return true;
        const a = ((t.artist as string) ?? "").toLowerCase();
        const ti = ((t.title as string) ?? "").toLowerCase();
        return !(a === exArtist && ti === exTitle);
      })
      .map((t) => {
        const keyParsed = parseKey((t.key as string) ?? "");
        return {
          artist: t.artist,
          title: t.title,
          bpm: t.bpm ? Math.round((t.bpm as number) * 10) / 10 : null,
          key: t.key ?? null,
          noteIndex: keyParsed?.noteIndex ?? null,
          mode: keyParsed?.mode ?? null,
          popularity: (t.popularity as number) ?? 0,
        };
      });

    return NextResponse.json({
      tracks,
      page: data.page ?? 0,
      hasMore: data.hasMore ?? false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Match search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
