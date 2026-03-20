const MUSEUM_IMAGE_SOURCE = "https://museum.ink/imagedata.json";

interface ImageEntry {
  name: string;
  url: string;
}

let cachedImages: ImageEntry[] | null = null;

async function getRandomImage(): Promise<string> {
  if (!cachedImages) {
    const res = await fetch(MUSEUM_IMAGE_SOURCE);
    const data = await res.json();
    cachedImages = data.images || [];
  }

  if (!cachedImages || cachedImages.length === 0) {
    throw new Error("No images available");
  }

  const entry = cachedImages[Math.floor(Math.random() * cachedImages.length)];
  // museum images have relative URLs like /images/filename.jpg
  const imageUrl = entry.url.startsWith("http") ? entry.url : `https://museum.ink${entry.url}`;
  return imageUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export async function generateCover(
  artist: string,
  title: string
): Promise<Blob> {
  const SIZE = 1080;
  const PADDING = 60;
  const TEXT_HEIGHT = 80;
  const GAP = 30;

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
  ctx.font = "900 " + TEXT_HEIGHT + "px Arial Black, Arial, sans-serif";
  ctx.textBaseline = "top";

  const textWidth = SIZE - PADDING * 2;
  const artistY = PADDING;

  // Stretch text to fill width
  ctx.save();
  const artistMeasure = ctx.measureText(artist.toUpperCase());
  const artistScale = textWidth / artistMeasure.width;
  ctx.translate(PADDING, artistY);
  ctx.scale(artistScale, 1);
  ctx.fillText(artist.toUpperCase(), 0, 0);
  ctx.restore();

  // Random image (middle)
  const imageY = artistY + TEXT_HEIGHT + GAP;
  const imageHeight = SIZE - PADDING * 2 - TEXT_HEIGHT * 2 - GAP * 2;

  try {
    const imageUrl = await getRandomImage();
    const img = await loadImage(imageUrl);

    // Draw image, cover-fit into the rectangle
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
  ctx.font = "900 " + TEXT_HEIGHT + "px Arial Black, Arial, sans-serif";
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
