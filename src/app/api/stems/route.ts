import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 minutes — stem separation is slow

const DEMUCS_API = process.env.DEMUCS_API_URL || "https://demucs-api-hwbhnojdya-uc.a.run.app";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No audio file" }, { status: 400 });
    }

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const b64 = Buffer.from(buffer).toString("base64");

    // Call Demucs API
    const res = await fetch(`${DEMUCS_API}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ b64 }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Demucs API error: ${res.status} ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    // Return the stem data — { vocals, drums, bass, other } as base64
    return NextResponse.json({
      vocals: data.vocals || null,
      drums: data.drums || null,
      bass: data.bass || null,
      other: data.other || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stem separation failed" },
      { status: 500 }
    );
  }
}
