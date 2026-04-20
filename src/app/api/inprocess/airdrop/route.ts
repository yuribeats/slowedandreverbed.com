import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { collectionAddress, tokenId, recipients, account, apiKey } = await req.json();
  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 400 });

  const payload = {
    moment: {
      tokenId: String(tokenId),
      collectionAddress,
    },
    recipients: recipients.map((addr: string) => ({
      recipientAddress: addr,
      tokenId: String(tokenId),
    })),
    account,
  };

  const res = await fetch("https://api.inprocess.world/api/moment/airdrop", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
