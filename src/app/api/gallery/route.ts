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

export async function GET() {
  try {
    const pinata = getPinata();
    const result = await pinata.files.public.list()
      .keyvalues({ type: "driftwave-video" })
      .order("DESC")
      .limit(50);

    const items = result.files.map((f) => ({
      id: f.id,
      cid: f.cid,
      url: `https://${process.env.PINATA_GATEWAY}/files/${f.cid}`,
      artist: f.keyvalues?.artist || "UNKNOWN",
      title: f.keyvalues?.title || "UNTITLED",
      createdAt: f.keyvalues?.createdAt || f.created_at,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("gallery error:", e);
    return NextResponse.json({ items: [], error: "Failed to load gallery" });
  }
}
