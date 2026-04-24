export async function fetchYouTubeAudio(
  url: string
): Promise<{ buffer: ArrayBuffer; title: string; cdnUrl: string | null }> {
  // Hard client-side ceiling — RapidAPI occasionally wedges and Vercel's 60s
  // maxDuration isn't always honored for streamed responses. Without this,
  // the landing screen sits on "LOADING AUDIO..." indefinitely.
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 75_000);

  let res: Response;
  try {
    res = await fetch("/api/rapid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(to);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("YouTube fetch timed out — try again or pick a different track");
    }
    throw e;
  }

  if (!res.ok) {
    clearTimeout(to);
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to fetch audio");
  }

  const title = res.headers.get("X-Audio-Title") ?? "youtube-audio";
  const cdnUrl = res.headers.get("X-Cdn-Url");
  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } finally {
    clearTimeout(to);
  }

  if (buffer.byteLength < 10000) {
    throw new Error("Downloaded file too small — extraction likely failed");
  }

  return { buffer, title, cdnUrl };
}
