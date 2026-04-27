function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

// Archivo Black is the closest open webfont to Arial Black. Loading it
// explicitly removes the system-font dependency so covers render identically
// on the user's Mac, on Vercel, and on the GitHub Actions Ubuntu runner.
let coverFontPromise: Promise<void> | null = null;
function ensureCoverFont(): Promise<void> {
  if (coverFontPromise) return coverFontPromise;
  coverFontPromise = (async () => {
    if (typeof document === "undefined") return;
    const face = new FontFace(
      "AutomashCover",
      "url(https://fonts.gstatic.com/s/archivoblack/v21/HTxqL289NzCGg4MzN6KJ7eW6OYuP_x7yx3A.woff2) format('woff2')",
      { weight: "900", style: "normal", display: "block" },
    );
    await face.load();
    document.fonts.add(face);
    // Belt-and-suspenders: wait for the canvas-readable state.
    await document.fonts.load("900 80px AutomashCover");
  })();
  return coverFontPromise;
}

export async function generateCover(
  artist: string,
  title: string,
  customImageUrl?: string
): Promise<Blob> {
  const SIZE = 1080;
  const PADDING = 60;
  const TEXT_HEIGHT = 80;
  const GAP = 30;

  await ensureCoverFont();

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Border
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(PADDING - 20, PADDING - 20, SIZE - (PADDING - 20) * 2, SIZE - (PADDING - 20) * 2);

  // Artist text (top) — stretched like museum's SVG
  ctx.fillStyle = "#000000";
  ctx.font = "900 " + TEXT_HEIGHT + "px AutomashCover, 'Arial Black', Arial, sans-serif";
  ctx.textBaseline = "top";

  const textWidth = SIZE - PADDING * 2;
  const artistY = PADDING;

  ctx.save();
  const artistMeasure = ctx.measureText(artist.toUpperCase());
  const artistScale = textWidth / artistMeasure.width;
  ctx.translate(PADDING, artistY);
  ctx.scale(artistScale, 1);
  ctx.fillText(artist.toUpperCase(), 0, 0);
  ctx.restore();

  // Random image (middle) — fetched from our server proxy to avoid CORS
  const imageY = artistY + TEXT_HEIGHT + GAP;
  const imageHeight = SIZE - PADDING * 2 - TEXT_HEIGHT * 2 - GAP * 2;

  try {
    const img = await loadImage(customImageUrl || "/api/random-image?t=" + Date.now());
    const imgAspect = img.width / img.height;
    const boxAspect = textWidth / imageHeight;

    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgAspect > boxAspect) {
      sw = img.height * boxAspect;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / boxAspect;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, PADDING, imageY, textWidth, imageHeight);
  } catch {
    // Fallback: gray rectangle if image fails
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(PADDING, imageY, textWidth, imageHeight);
  }

  // Title text (bottom) — stretched like museum's SVG
  const titleY = imageY + imageHeight + GAP;

  ctx.fillStyle = "#000000";
  ctx.font = "900 " + TEXT_HEIGHT + "px AutomashCover, 'Arial Black', Arial, sans-serif";
  ctx.textBaseline = "top";

  ctx.save();
  const titleMeasure = ctx.measureText(title.toUpperCase());
  const titleScale = textWidth / titleMeasure.width;
  ctx.translate(PADDING, titleY);
  ctx.scale(titleScale, 1);
  ctx.fillText(title.toUpperCase(), 0, 0);
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to generate cover"))),
      "image/png"
    );
  });
}
