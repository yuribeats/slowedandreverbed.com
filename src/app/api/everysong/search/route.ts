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
  const note = parts[0];
  const mode = parts[1].toLowerCase() === "major" ? "major" : "minor";
  const noteIndex = KEY_MAP[note];
  if (noteIndex === undefined) return null;
  return { noteIndex, mode };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q");
  const artist = sp.get("artist");
  const title = sp.get("title");
  const popMin = sp.get("popMin");
  const limit = parseInt(sp.get("limit") ?? "5", 10);
  if (!q && !artist && !title) {
    return NextResponse.json({ error: "Missing q or artist/title" }, { status: 400 });
  }

  const apiKey = process.env.EVERYSONG_API_KEY;
  const params = new URLSearchParams({
    limit: String(limit),
    sort: "popularity",
    dir: "desc",
  });
  if (q) params.set("q", q);
  if (artist) params.set("artist", artist);
  if (title) params.set("title", title);
  if (popMin) params.set("popMin", popMin);
  if (apiKey) params.set("api_key", apiKey);
  const url = `https://everysong.site/api/search?${params}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Everysong error: ${res.status}`);
    const data = await res.json();

    const tracks = (data.tracks ?? []).slice(0, limit);
    const results = tracks.map((t: Record<string, unknown>) => {
      const keyParsed = parseKey((t.key as string) ?? "");
      return {
        artist: t.artist,
        title: t.title,
        bpm: t.bpm ? Math.round((t.bpm as number) * 10) / 10 : null,
        key: t.key ?? null,
        noteIndex: keyParsed?.noteIndex ?? null,
        mode: keyParsed?.mode ?? null,
      };
    });

    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
