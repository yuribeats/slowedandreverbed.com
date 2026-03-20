import { NextResponse } from "next/server";
import { PinataSDK } from "pinata";

function getPinata() {
  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.PINATA_GATEWAY!,
  });
}

export async function POST() {
  try {
    const pinata = getPinata();
    const url = await pinata.upload.public.createSignedURL({
      expires: 300,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("pinata-upload-url error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
