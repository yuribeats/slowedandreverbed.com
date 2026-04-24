import { NextRequest, NextResponse } from "next/server";
import { PinataSDK } from "pinata";

function getPinata() {
  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.PINATA_GATEWAY!,
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    const settings = formData.get("settings") as string | null;
    const filename = formData.get("filename") as string | null;

    if (!file || !settings) {
      return NextResponse.json({ error: "Missing audio or settings" }, { status: 400 });
    }

    const pinata = getPinata();
    const id = Math.random().toString(36).substring(2, 10);

    const audioUpload = await pinata.upload.public.file(file)
      .name(`automash-${id}`)
      .keyvalues({
        type: "driftwave-audio",
        shareId: id,
        filename: filename || "audio",
        settings: settings,
      });

    const audioUrl = `https://${process.env.PINATA_GATEWAY}/files/${audioUpload.cid}`;

    return NextResponse.json({ id, audioUrl });
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
    const pinata = getPinata();

    const result = await pinata.files.public.list().keyvalues({ shareId: id });
    const files = result.files;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const file = files[0];
    const kv = file.keyvalues || {};
    const audioUrl = `https://${process.env.PINATA_GATEWAY}/files/${file.cid}`;

    return NextResponse.json({
      settings: kv.settings ? JSON.parse(kv.settings) : null,
      filename: kv.filename || "shared-track",
      audioUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load share" },
      { status: 500 }
    );
  }
}
