import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const DEMUCS_VERSION = "5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77";

export async function POST(req: NextRequest) {
  if (!REPLICATE_TOKEN) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN not configured" }, { status: 500 });
  }

  try {
    console.log("[stems] Parsing formData...");
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      console.log("[stems] No audio file in formData");
      return NextResponse.json({ error: "No audio file" }, { status: 400 });
    }
    console.log("[stems] File received:", file.name, "size:", file.size, "type:", file.type);

    // Detect actual format from magic bytes
    const headBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const hex = Array.from(headBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log("[stems] Magic bytes:", hex);
    const isMP3 = (headBytes[0] === 0xFF && (headBytes[1] & 0xE0) === 0xE0) || (headBytes[0] === 0x49 && headBytes[1] === 0x44 && headBytes[2] === 0x33);
    const isM4A = headBytes[4] === 0x66 && headBytes[5] === 0x74 && headBytes[6] === 0x79 && headBytes[7] === 0x70;
    const isOGG = headBytes[0] === 0x4F && headBytes[1] === 0x67 && headBytes[2] === 0x67 && headBytes[3] === 0x53;
    const detectedExt = isMP3 ? '.mp3' : isM4A ? '.m4a' : isOGG ? '.ogg' : '.audio';
    console.log("[stems] Detected format:", detectedExt);

    // Upload to Replicate with correct extension
    console.log("[stems] Uploading to Replicate...");
    const uploadRes = await fetch("https://api.replicate.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      body: (() => {
        const fd = new FormData();
        fd.append("content", file, (file.name || "audio") .replace(/\.[^.]+$/, '') + detectedExt);
        return fd;
      })(),
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      console.log("[stems] Replicate upload failed:", uploadRes.status, text);
      return NextResponse.json({ error: `File upload failed (${uploadRes.status}): ${text}` }, { status: 502 });
    }
    console.log("[stems] Replicate upload OK");

    const uploadData = await uploadRes.json();
    const fileUrl = uploadData.urls?.get;

    if (!fileUrl) {
      return NextResponse.json({ error: "File upload returned no URL" }, { status: 502 });
    }

    // Run Demucs
    const predRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: DEMUCS_VERSION,
        input: { audio: fileUrl, model: "htdemucs_ft" },
      }),
    });

    if (!predRes.ok) {
      const text = await predRes.text();
      return NextResponse.json({ error: `Prediction create failed: ${text}` }, { status: 502 });
    }

    let prediction = await predRes.json();

    const pollUrl = prediction.urls?.get;
    if (!pollUrl) {
      return NextResponse.json({ error: "No poll URL returned" }, { status: 502 });
    }

    const deadline = Date.now() + 280_000;
    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      if (Date.now() > deadline) {
        return NextResponse.json({ error: "Stem separation timed out" }, { status: 504 });
      }
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      });
      prediction = await pollRes.json();
    }

    if (prediction.status === "failed") {
      return NextResponse.json(
        { error: prediction.error || "Demucs model failed" },
        { status: 502 }
      );
    }

    const output = prediction.output;
    if (!output) {
      return NextResponse.json({ error: "No output from model" }, { status: 502 });
    }

    return NextResponse.json({
      vocals: output.vocals || null,
      drums: output.drums || null,
      bass: output.bass || null,
      other: output.other || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stem separation failed" },
      { status: 500 }
    );
  }
}
