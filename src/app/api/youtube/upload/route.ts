import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { PinataSDK } from "pinata";

export const maxDuration = 300;

function getAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

export async function POST(request: NextRequest) {
  if (!process.env.YOUTUBE_REFRESH_TOKEN) {
    return NextResponse.json({ error: "YOUTUBE NOT CONNECTED. VISIT /API/YOUTUBE/AUTH FIRST." }, { status: 401 });
  }

  try {
    const { url, artist, title, fileId } = await request.json();
    if (!url) {
      return NextResponse.json({ error: "Missing video URL" }, { status: 400 });
    }

    // Use just the part before any slash if present
    const cleanArtist = (artist || "").split("/")[0].trim() || "UNKNOWN";
    const cleanTitle = (title || "").split("/")[0].trim() || "UNTITLED";
    const videoTitle = `${cleanArtist} - ${cleanTitle} (SLOWED + REVERB)`.slice(0, 100);
    const description = `${artist || ""} - ${title || ""}\nSLOWED + REVERB\n\nMADE WITH SLOWEDANDREVERBED.COM`;

    const videoRes = await fetch(url);
    if (!videoRes.ok) throw new Error("Failed to download video from storage");
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    const auth = getAuthClient();
    const youtube = google.youtube({ version: "v3", auth });

    const stream = new Readable();
    stream.push(videoBuffer);
    stream.push(null);

    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: videoTitle,
          description,
          categoryId: "10",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: stream,
      },
    });

    const videoId = response.data.id;
    const youtubeUrl = `https://youtube.com/watch?v=${videoId}`;

    if (fileId && process.env.PINATA_JWT && process.env.PINATA_GATEWAY) {
      try {
        const pinata = new PinataSDK({
          pinataJwt: process.env.PINATA_JWT,
          pinataGateway: process.env.PINATA_GATEWAY,
        });
        await pinata.files.public.update({ id: fileId, keyvalues: { youtubeUrl } });
      } catch (e) {
        console.error("pinata keyvalues update failed:", e);
      }
    }

    return NextResponse.json({ success: true, videoId, youtubeUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    console.error("youtube upload error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
