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
    const gateway = process.env.PINATA_GATEWAY;

    if (all) {
      const result = await pinata.files.public.list().order("DESC").limit(100);
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

    // A rename window tagged some exports as "automash-video"; query both so
    // none are orphaned. Paginate each so we return EVERY mashup, not just
    // the first 100.
    const fetchAll = async (type: string) => {
      const out: Awaited<ReturnType<typeof pinata.files.public.list>>["files"] = [];
      let pageToken: string | undefined;
      // Hard cap on iterations so a runaway never spins forever
      for (let i = 0; i < 50; i++) {
        let q = pinata.files.public.list().order("DESC").limit(1000).keyvalues({ type });
        if (pageToken) q = q.pageToken(pageToken);
        const r = await q;
        out.push(...r.files);
        if (!r.next_page_token || r.files.length === 0) break;
        pageToken = r.next_page_token;
      }
      return out;
    };
    const [oldFiles, newFiles] = await Promise.all([
      fetchAll("driftwave-video"),
      fetchAll("automash-video"),
    ]);
    const merged = [...oldFiles, ...newFiles];
    const seen = new Set<string>();
    const uniq = merged.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    uniq.sort((a, b) => {
      const ad = new Date(a.keyvalues?.createdAt || a.created_at).getTime();
      const bd = new Date(b.keyvalues?.createdAt || b.created_at).getTime();
      return bd - ad;
    });

    const items = uniq.map((f) => ({
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
