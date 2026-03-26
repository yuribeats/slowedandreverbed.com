import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const apiKey = process.env.API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_KEY not configured" }, { status: 500 });

  const params = new URLSearchParams({
    part: "snippet",
    q,
    type: "video",
    maxResults: "1",
    key: apiKey,
  });

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: data.error?.message || "YouTube search failed" }, { status: 500 });
  }

  const item = data.items?.[0];
  if (!item) return NextResponse.json({ error: "No results found" }, { status: 404 });

  const videoId = item.id?.videoId;
  const title = item.snippet?.title || "";

  return NextResponse.json({
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  });
}
