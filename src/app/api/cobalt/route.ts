import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.canine.tools",
  "https://cobalt-api.ayo.tf",
];

const STRATEGY_TIMEOUT = 15_000; // 15s per strategy

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Strategy order: yt-proxy (Railway) → Cobalt
export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // 1. Self-hosted yt-dlp proxy (Railway)
  if (process.env.YT_PROXY_URL) {
    try {
      const result = await withTimeout(tryYtProxy(url), STRATEGY_TIMEOUT, "yt-proxy");
      if (result) return result;
    } catch { /* next */ }
  }

  // 2. Cobalt instances (free fallback)
  for (const instance of COBALT_INSTANCES) {
    try {
      const result = await withTimeout(tryCobalt(instance, url), STRATEGY_TIMEOUT, instance);
      if (result) return result;
    } catch { continue; }
  }

  return NextResponse.json(
    { error: "Could not extract audio. All methods failed." },
    { status: 502 }
  );
}

// --- Self-hosted yt-dlp proxy (Railway) ---
async function tryYtProxy(url: string): Promise<NextResponse | null> {
  const proxyUrl = process.env.YT_PROXY_URL;
  if (!proxyUrl) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.YT_PROXY_SECRET) {
    headers["x-api-secret"] = process.env.YT_PROXY_SECRET;
  }

  const res = await fetch(`${proxyUrl}/api/extract`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.audioUrl) return null;

  // Download the audio stream through the proxy
  const audioRes = await fetch(`${proxyUrl}/api/download?url=${encodeURIComponent(data.audioUrl)}`, {
    headers: process.env.YT_PROXY_SECRET ? { "x-api-secret": process.env.YT_PROXY_SECRET } : {},
  });
  if (!audioRes.ok) return null;

  const buffer = await audioRes.arrayBuffer();
  const title = data.title?.replace(/[^\w\s-]/g, "").trim().substring(0, 80) || "youtube-audio";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": data.contentType || "audio/webm",
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

