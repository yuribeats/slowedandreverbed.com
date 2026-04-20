import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { momentUri, collectionAddress, account, recipientCount, apiKey } = await req.json();
  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 400 });

  const payload = {
    contract: { address: collectionAddress },
    token: {
      tokenMetadataURI: momentUri,
      createReferral: "0x0000000000000000000000000000000000000000",
      salesConfig: {
        type: "fixedPrice",
        pricePerToken: "0",
        saleStart: "0",
        saleEnd: "9999999999",
      },
      mintToCreatorCount: (recipientCount || 1) + 1,
    },
    account,
  };

  const res = await fetch("https://api.inprocess.world/api/moment/create", {
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

  try {
    const result = await res.json();
    return NextResponse.json(result);
  } catch {
    const text = await res.text();
    return NextResponse.json({ raw: text });
  }
}
