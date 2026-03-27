import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const modalUrl = process.env.MODAL_DOWNBEAT_URL;
  if (!modalUrl) {
    return NextResponse.json({ error: "MODAL_DOWNBEAT_URL not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { audioUrl, ...priors } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: "Missing audioUrl" }, { status: 400 });
    }

    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl, ...priors }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error || "Modal downbeat error" }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Downbeat detection failed";
    console.error("[downbeat] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
