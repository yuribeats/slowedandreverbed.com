import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    const settings = formData.get("settings") as string | null;
    const filename = formData.get("filename") as string | null;

    if (!file || !settings) {
      return NextResponse.json({ error: "Missing audio or settings" }, { status: 400 });
    }

    // Generate a short ID
    const id = Math.random().toString(36).substring(2, 10);

    // Upload audio to Vercel Blob
    const blob = await put(`shares/${id}/audio`, file, {
      access: "public",
      contentType: file.type || "audio/mpeg",
    });

    // Store settings as a separate blob
    await put(
      `shares/${id}/settings.json`,
      JSON.stringify({ settings: JSON.parse(settings), filename, audioUrl: blob.url }),
      { access: "public", contentType: "application/json" }
    );

    return NextResponse.json({ id, url: `/s/${id}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Share failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing ID" }, { status: 400 });
  }

  try {
    // Find the settings blob
    const { blobs } = await list({ prefix: `shares/${id}/settings` });
    if (blobs.length === 0) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const res = await fetch(blobs[0].url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load share" }, { status: 500 });
  }
}
