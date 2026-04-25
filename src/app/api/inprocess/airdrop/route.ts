import { NextRequest, NextResponse } from "next/server";

// Per InProcess docs (https://docs.inprocess.world/api-reference/moment/airdrop.md),
// /moment/airdrop requires an Artist API key in the `x-api-key` header — NOT the
// OAuth Bearer token used elsewhere. The key is stored as INPROCESS_AIRDROP_KEY
// in Vercel env vars. The `apiKey` field in the request body is ignored; kept
// for client back-compat so we don't break callers that still send it.
export async function POST(req: NextRequest) {
  const { collectionAddress, tokenId, recipients } = await req.json();

  const artistKey = process.env.INPROCESS_AIRDROP_KEY;
  if (!artistKey) {
    return NextResponse.json(
      { error: "INPROCESS_AIRDROP_KEY not configured on the server" },
      { status: 500 },
    );
  }

  const payload = {
    collectionAddress,
    recipients: recipients.map((addr: string) => ({
      recipientAddress: addr,
      tokenId: String(tokenId),
    })),
  };

  const res = await fetch("https://api.inprocess.world/api/moment/airdrop", {
    method: "POST",
    headers: {
      "x-api-key": artistKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const result = await res.json();
  return NextResponse.json(result);
}
