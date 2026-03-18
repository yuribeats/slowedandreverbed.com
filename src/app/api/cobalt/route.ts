import { NextRequest, NextResponse } from "next/server";

const COBALT_API_URL = process.env.COBALT_API_URL;

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!COBALT_API_URL) {
    return NextResponse.json(
      { error: "Cobalt API not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(COBALT_API_URL, {
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

    if (!response.ok || data.status === "error") {
      return NextResponse.json(
        { error: data.error?.code ?? "Cobalt error" },
        { status: response.status }
      );
    }

    if (data.url) {
      const audioResponse = await fetch(data.url);
      const audioBuffer = await audioResponse.arrayBuffer();
      return new NextResponse(audioBuffer, {
        headers: {
          "Content-Type":
            audioResponse.headers.get("Content-Type") ?? "audio/mpeg",
          "Content-Disposition": `attachment; filename="audio.mp3"`,
          "X-Audio-Title": data.filename ?? "youtube-audio",
        },
      });
    }

    return NextResponse.json(
      { error: "No audio URL returned" },
      { status: 502 }
    );
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
