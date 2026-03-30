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

type Track = { artist: string; title: string; bpm: number | null; key: string | null };

async function search(params: Record<string, string>, apiKey: string | undefined): Promise<Track[]> {
  const p = new URLSearchParams({ limit: "20", sort: "popularity", dir: "desc", ...params });
  if (apiKey) p.set("api_key", apiKey);
  try {
    const res = await fetch(`https://everysong.site/api/search?${p}`, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tracks ?? []) as Track[];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist") ?? "";
  const title = request.nextUrl.searchParams.get("title") ?? "";
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (!artist && !title && !q) {
    return NextResponse.json({ error: "Missing artist, title, or q" }, { status: 400 });
  }

  const apiKey = process.env.EVERYSONG_API_KEY;

  try {
    let tracks: Track[] = [];

    if (q && !artist && !title) {
      tracks = await search({ q }, apiKey);
    } else if (artist && title) {
      tracks = await search({ artist, title }, apiKey);
    } else if (artist) {
      tracks = await search({ artist }, apiKey);
    }

    if (tracks.length === 0) {
      return NextResponse.json({ found: false });
    }

    // Take the first result that has key data. If none have key data, take the first result.
    const best = tracks.find((t) => t.key !== null) ?? tracks[0];

    const keyParsed = parseKey(best.key ?? "");

    return NextResponse.json({
      found: true,
      artist: best.artist,
      title: best.title,
      key: best.key ?? null,
      noteIndex: keyParsed?.noteIndex ?? null,
      mode: keyParsed?.mode ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
