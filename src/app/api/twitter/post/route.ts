import { NextRequest, NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";

// Posts a video tweet by:
//   1. Fetching the MP4 from its public URL (Pinata gateway)
//   2. Uploading via v1.1 chunked media upload (only path Twitter accepts for video)
//   3. Polling media status until processing completes (handled by twitter-api-v2)
//   4. Creating the tweet via v2 with the resulting media_id
//
// Env vars (OAuth 1.0a User Context, all four required):
//   TWITTER_API_KEY
//   TWITTER_API_SECRET
//   TWITTER_ACCESS_TOKEN
//   TWITTER_ACCESS_TOKEN_SECRET
//
// Body: { videoUrl: string, artist: string, title: string }
// Post text intentionally excludes any URL — under the April 2026 X API
// pricing, posts containing a URL cost $0.20 vs $0.015 without.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { videoUrl, artist, title } = await req.json();
  if (!videoUrl) {
    return NextResponse.json({ error: "videoUrl required" }, { status: 400 });
  }

  const {
    TWITTER_API_KEY,
    TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_TOKEN_SECRET,
  } = process.env;
  if (
    !TWITTER_API_KEY ||
    !TWITTER_API_SECRET ||
    !TWITTER_ACCESS_TOKEN ||
    !TWITTER_ACCESS_TOKEN_SECRET
  ) {
    return NextResponse.json(
      { error: "Twitter API credentials not configured on the server" },
      { status: 500 },
    );
  }

  try {
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch video: ${videoRes.status}` },
        { status: 502 },
      );
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: TWITTER_ACCESS_TOKEN,
      accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
    });

    const mediaId = await client.v1.uploadMedia(videoBuffer, {
      mimeType: "video/mp4",
      target: "tweet",
      longVideo: true,
    });

    const text = `${artist} / ${title}`;
    const tweet = await client.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    });

    const tweetUrl = `https://twitter.com/i/web/status/${tweet.data.id}`;
    return NextResponse.json({ tweetUrl, id: tweet.data.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tweet failed";
    // twitter-api-v2 errors carry .code, .data (Twitter's body), .errors
    const detail = (e && typeof e === "object")
      ? {
          code: (e as { code?: number }).code,
          data: (e as { data?: unknown }).data,
          errors: (e as { errors?: unknown }).errors,
        }
      : undefined;
    console.error("twitter/post error:", JSON.stringify(detail) || e);
    return NextResponse.json({ error: msg, detail }, { status: 500 });
  }
}
