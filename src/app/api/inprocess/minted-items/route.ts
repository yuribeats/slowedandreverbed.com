import { NextRequest, NextResponse } from "next/server";

const RPC = "https://base-mainnet.public.blastapi.io";

async function rpcCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await res.json();
  return json.result ?? "";
}

function decodeString(hex: string): string {
  if (!hex || hex.length < 130) return "";
  const offset = parseInt(hex.slice(2, 66), 16) * 2 + 2;
  const length = parseInt(hex.slice(offset, offset + 64), 16);
  const data = hex.slice(offset + 64, offset + 64 + length * 2);
  return Buffer.from(data, "hex").toString("utf-8");
}

export async function GET(req: NextRequest) {
  const collection = req.nextUrl.searchParams.get("collection");
  if (!collection) return NextResponse.json({ error: "Missing collection" }, { status: 400 });

  try {
    // Get nextTokenId
    const nextTokenHex = await rpcCall(collection, "0x75794a3c");
    const tokenCount = parseInt(nextTokenHex, 16);
    if (!tokenCount || tokenCount > 200) return NextResponse.json({ names: [] });

    // Batch fetch all token URIs
    const uriPromises = [];
    for (let i = 1; i < tokenCount; i++) {
      const tokenIdHex = i.toString(16).padStart(64, "0");
      uriPromises.push(rpcCall(collection, `0x0e89341c${tokenIdHex}`));
    }
    const uriResults = await Promise.all(uriPromises);

    // Fetch metadata names from Arweave, paired with their tokenId (1-based)
    const itemPromises = uriResults.map(async (hex, idx) => {
      const uri = decodeString(hex);
      if (!uri.startsWith("ar://")) return null;
      const arId = uri.slice(5);
      try {
        const res = await fetch(`https://api.inprocess.world/api/arweave/${arId}`);
        if (!res.ok) return null;
        const meta = await res.json();
        const name = (meta.name as string) ?? "";
        if (!name) return null;
        return { tokenId: idx + 1, name };
      } catch {
        return null;
      }
    });
    const items = (await Promise.all(itemPromises)).filter((x): x is { tokenId: number; name: string } => !!x);
    // Keep `names` for back-compat with any cached client that reads it.
    const names = items.map((i) => i.name);

    return NextResponse.json({ items, names }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
