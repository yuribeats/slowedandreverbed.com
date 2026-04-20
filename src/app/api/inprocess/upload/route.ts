import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey } = body;
  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 400 });

  let fileBuffer: Buffer;
  let contentType: string;
  let filename: string;

  if (body.videoUrl) {
    // URL mode: fetch video from Pinata, upload to Arweave
    contentType = body.contentType ?? "video/mp4";
    filename = body.filename ?? "video.mp4";
    const videoRes = await fetch(body.videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ error: `Failed to fetch video: ${videoRes.status}` }, { status: 502 });
    }
    fileBuffer = Buffer.from(await videoRes.arrayBuffer());
  } else if (body.data) {
    // Base64 mode: for metadata JSON and small files
    contentType = body.contentType ?? "application/json";
    filename = body.filename ?? "metadata.json";
    fileBuffer = Buffer.from(body.data, "base64");
  } else {
    return NextResponse.json({ error: "Provide videoUrl or data" }, { status: 400 });
  }

  const formData = new FormData();
  const uint8 = new Uint8Array(fileBuffer);
  const blob = new Blob([uint8], { type: contentType });
  formData.append("file", blob, filename);

  const res = await fetch("https://api.inprocess.world/api/arweave", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const uri = await res.text();
  const cleaned = uri.replace(/^"|"$/g, "");
  return NextResponse.json({ uri: cleaned });
}
