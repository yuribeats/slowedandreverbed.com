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
    const filename = formData.get("filename") as string | null;
    const settings = formData.get("settings") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing audio" }, { status: 400 });
    }

    const pinata = getPinata();
    const id = Math.random().toString(36).substring(2, 10);

    const upload = await pinata.upload.public.file(file)
      .name(filename || `driftwave-${id}`)
      .keyvalues({
        type: "driftwave-download",
        downloadId: id,
        filename: filename || "audio",
        settings: settings || "{}",
      });

    const audioUrl = `https://${process.env.PINATA_GATEWAY}/files/${upload.cid}`;

    return NextResponse.json({ id, audioUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const pinata = getPinata();

    const result = await pinata.files.public.list()
      .keyvalues({ type: "driftwave-download" })
      .order("DESC")
      .limit(50);

    const items = (result.files || []).map((f) => {
      const kv = f.keyvalues || {};
      return {
        id: kv.downloadId || f.id,
        name: kv.filename || f.name || "track",
        url: `https://${process.env.PINATA_GATEWAY}/files/${f.cid}`,
        settings: kv.settings ? JSON.parse(kv.settings) : null,
        createdAt: new Date(f.created_at).getTime(),
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load playlist" },
      { status: 500 }
    );
  }
}
