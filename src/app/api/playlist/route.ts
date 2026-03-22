import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export const maxDuration = 60;

function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function getAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    return NextResponse.json({ error: "Could not extract playlist ID" }, { status: 400 });
  }

  if (!process.env.YOUTUBE_REFRESH_TOKEN) {
    return NextResponse.json({ error: "YouTube not connected" }, { status: 500 });
  }

  try {
    const auth = getAuthClient();
    const yt = google.youtube({ version: "v3", auth });

    const items: { videoId: string; title: string }[] = [];
    let pageToken: string | undefined;

    do {
      const res = await yt.playlistItems.list({
        part: ["snippet"],
        playlistId,
        maxResults: 50,
        pageToken,
      });

      for (const item of res.data.items || []) {
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title || "UNTITLED";
        if (videoId && title !== "Private video" && title !== "Deleted video") {
          items.push({ videoId, title });
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    return NextResponse.json({ items, playlistId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch playlist";
    console.error("playlist error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
