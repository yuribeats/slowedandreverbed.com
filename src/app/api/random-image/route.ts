import { NextResponse } from "next/server";

const MUSEUM_SOURCE = "https://museum.ink/imagedata.json";

interface ImageEntry {
  name: string;
  url: string;
}

let cachedImages: ImageEntry[] | null = null;

export async function GET() {
  try {
    if (!cachedImages) {
      const res = await fetch(MUSEUM_SOURCE, { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error("Failed to fetch image list");
      const data = await res.json();
      cachedImages = data.images || [];
    }

    if (!cachedImages || cachedImages.length === 0) {
      throw new Error("No images available");
    }

    const entry = cachedImages[Math.floor(Math.random() * cachedImages.length)];
    const imageUrl = entry.url.startsWith("http") ? entry.url : `https://museum.ink${entry.url}`;

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("Failed to fetch image");

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("random-image error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
