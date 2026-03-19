import { NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";
import youtubeDl from "youtube-dl-exec";

export const maxDuration = 60;

const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt-api.ayo.tf",
];

// Strategy order: yt-dlp → RapidAPI (paid) → ytdl-core → Cobalt
export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // 1. yt-dlp (most maintained, free)
  try {
    const result = await tryYtDlp(url);
    if (result) return result;
  } catch { /* next */ }

  // 2. RapidAPI (paid — set RAPIDAPI_KEY env var)
  if (process.env.RAPIDAPI_KEY) {
    try {
      const result = await tryRapidApi(url);
      if (result) return result;
    } catch { /* next */ }
  }

  // 3. ytdl-core (free fallback)
  if (ytdl.validateURL(url)) {
    try {
      const result = await tryYtdl(url);
      if (result) return result;
    } catch { /* next */ }
  }

  // 4. Cobalt instances (free fallback)
  for (const instance of COBALT_INSTANCES) {
    try {
      const result = await tryCobalt(instance, url);
      if (result) return result;
    } catch { continue; }
  }

  return NextResponse.json(
    { error: "Could not extract audio. All methods failed." },
    { status: 502 }
  );
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// --- yt-dlp via youtube-dl-exec ---
async function tryYtDlp(url: string): Promise<NextResponse | null> {
  const info = await youtubeDl(url, {
    dumpSingleJson: true,
    format: "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    noCheckCertificates: true,
    noWarnings: true,
    addHeader: [
      "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ],
  }) as Record<string, unknown>;

  const title = sanitizeTitle(info.title as string);
  const audioUrl = (info.url as string) || null;
  if (!audioUrl) return null;

  const ext = (info.ext as string) || "webm";
  const contentType = ext === "m4a" ? "audio/mp4" : ext === "webm" ? "audio/webm" : "audio/mpeg";

  const response = await fetch(audioUrl);
  if (!response.ok) return null;

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="audio"`,
      "X-Audio-Title": title,
    },
  });
}

// --- RapidAPI YouTube MP3 ---
// Supports multiple providers via RAPIDAPI_HOST env var
// Default: youtube-mp36.p.rapidapi.com (sign up at rapidapi.com, search "YouTube MP3")
async function tryRapidApi(url: string): Promise<NextResponse | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const host = process.env.RAPIDAPI_HOST || "youtube-mp36.p.rapidapi.com";
  const endpoint = process.env.RAPIDAPI_ENDPOINT || `https://${host}/dl?id=${videoId}`;

  const response = await fetch(endpoint, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host,
    },
  });

  if (!response.ok) return null;
  const data = await response.json();

  if (data.status !== "ok" || !data.link) return null;

  const title = sanitizeTitle(data.title);
  const audioResponse = await fetch(data.link);
  if (!audioResponse.ok) return null;

  const buffer = await audioResponse.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="audio.mp3"`,
      "X-Audio-Title": title,
    },
  });
}

// --- ytdl-core ---
async function tryYtdl(url: string): Promise<NextResponse | null> {
  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  });

  const title = sanitizeTitle(info.videoDetails.title);

  const format = ytdl.chooseFormat(info.formats, {
    quality: "highestaudio",
    filter: "audioonly",
  });

  const response = await fetch(format.url);
  if (!response.ok) return null;

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": format.mimeType?.split(";")[0] ?? "audio/webm",
      "Content-Disposition": `attachment; filename="audio"`,
      "X-Audio-Title": title,
    },
  });
}

// --- Cobalt ---
async function tryCobalt(instance: string, url: string): Promise<NextResponse | null> {
  const response = await fetch(instance, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url,
      downloadMode: "audio",
      audioFormat: "mp3",
      audioBitrate: "320",
    }),
  });

  const data = await response.json();
  if (!response.ok || data.status === "error") return null;

  if (data.url) {
    const audioResponse = await fetch(data.url);
    if (!audioResponse.ok) return null;

    const audioBuffer = await audioResponse.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": audioResponse.headers.get("Content-Type") ?? "audio/mpeg",
        "Content-Disposition": `attachment; filename="audio.mp3"`,
        "X-Audio-Title": data.filename ?? "youtube-audio",
      },
    });
  }

  return null;
}

function sanitizeTitle(raw: unknown): string {
  return (
    String(raw || "youtube-audio")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .substring(0, 80) || "youtube-audio"
  );
}
