import { NextResponse } from "next/server";
import { PinataSDK } from "pinata";

export const dynamic = "force-dynamic";

function getPinata() {
  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.PINATA_GATEWAY!,
  });
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Missing file id" }, { status: 400 });
    }
    const pinata = getPinata();
    await pinata.files.public.delete([id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("gallery delete error:", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";

  try {
    const pinata = getPinata();
    const query = pinata.files.public.list().order("DESC").limit(100);
    const result = await (all ? query : query.keyvalues({ type: "driftwave-video" }));

    const gateway = process.env.PINATA_GATEWAY;

    if (all) {
      const files = result.files.map((f) => ({
        id: f.id,
        cid: f.cid,
        name: f.name || f.id,
        size: f.size,
        mimeType: f.mime_type,
        url: `https://${gateway}/files/${f.cid}`,
        type: f.keyvalues?.type || null,
        artist: f.keyvalues?.artist || null,
        title: f.keyvalues?.title || null,
        createdAt: f.keyvalues?.createdAt || f.created_at,
      }));
      return NextResponse.json({ files });
    }

    const items = result.files.map((f) => ({
      id: f.id,
      cid: f.cid,
      url: `https://${gateway}/files/${f.cid}`,
      artist: f.keyvalues?.artist || "UNKNOWN",
      title: f.keyvalues?.title || "UNTITLED",
      createdAt: f.keyvalues?.createdAt || f.created_at,
      youtubeUrl: f.keyvalues?.youtubeUrl || null,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("gallery error:", e);
    return NextResponse.json({ items: [], error: "Failed to load gallery" });
  }
}
