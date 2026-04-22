import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20231121.09.00",
      },
    },
    query: q,
  };

  const res = await fetch(
    "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "YouTube search failed" }, { status: 500 });
  }

  const data = await res.json();

  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

  type VR = { videoId?: string; title?: { runs?: { text?: string }[] } };
  const videos = ((contents ?? []) as Array<{ videoRenderer?: VR }>)
    .map((item) => item.videoRenderer)
    .filter((v): v is VR => Boolean(v))
    .slice(0, 10)
    .map((vr) => {
      const videoId = vr.videoId || "";
      const title = vr.title?.runs?.[0]?.text || "";
      return { videoId, title, url: `https://www.youtube.com/watch?v=${videoId}` };
    })
    .filter((v) => v.videoId);

  if (videos.length === 0) {
    return NextResponse.json({ error: "No results found" }, { status: 404 });
  }

  const first = videos[0];
  return NextResponse.json({
    videoId: first.videoId,
    title: first.title,
    url: first.url,
    candidates: videos,
  });
}
