import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

// Proxy large file uploads to Replicate (bypasses CORS and keeps token server-side)
export async function POST(req: NextRequest) {
  if (!REPLICATE_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const blob = await req.blob();
    const fd = new FormData();
    fd.append("content", blob, "audio.wav");

    const res = await fetch("https://api.replicate.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      body: fd,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Upload failed: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const fileUrl = data.urls?.get;
    if (!fileUrl) {
      return NextResponse.json({ error: "No URL returned" }, { status: 502 });
    }

    return NextResponse.json({ fileUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
