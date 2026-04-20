import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.inprocess.world/api/collections?artist=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const collections = (Array.isArray(data) ? data : data.collections ?? []).map(
      (c: Record<string, unknown>) => ({
        name: c.name ?? "Untitled",
        address: c.address ?? c.contractAddress ?? "",
      })
    );

    return NextResponse.json({ collections, wallet });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch collections";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
