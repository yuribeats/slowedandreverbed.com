import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join, extname } from "path";
import { tmpdir } from "os";
import { PinataSDK } from "pinata";
import { waitUntil } from "@vercel/functions";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require("ffmpeg-static");

function getPinata() {
  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.PINATA_GATEWAY!,
  });
}

function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to parse request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const audioFile = formData.get("audio") as File | null;
  const audioCid = formData.get("audioCid") as string | null;
  const imageFile = formData.get("image") as File | null;
  const artist = (formData.get("artist") as string) || "UNKNOWN";
  const title = (formData.get("title") as string) || "UNTITLED";
  const watermark = formData.get("watermark") === "true";

  if (!audioFile && !audioCid) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }
  if (!imageFile) {
    return NextResponse.json({ error: "Missing cover image" }, { status: 400 });
  }

  const gateway = process.env.PINATA_GATEWAY!;
  const id = crypto.randomUUID();
  const tmp = tmpdir();
  const audioExt = audioFile ? (extname(audioFile.name || "").toLowerCase() || ".mp3") : ".wav";
  const audioPath = join(tmp, `${id}-audio${audioExt}`);
  const imgPath = join(tmp, `${id}-cover.png`);
  const outPath = join(tmp, `${id}-output.mp4`);
  const watermarkPath = join(process.cwd(), "public", "watermark.mp3");

  try {
    // Get audio bytes: prefer direct upload, fall back to Pinata CID for back-compat
    const [audioBytes, imgBytes] = await Promise.all([
      audioFile
        ? audioFile.arrayBuffer()
        : fetch(`https://${gateway}/files/${audioCid}`).then((r) => {
            if (!r.ok) throw new Error(`Failed to download audio: ${r.status}`);
            return r.arrayBuffer();
          }),
      imageFile.arrayBuffer(),
    ]);
    console.log("Audio size:", audioBytes.byteLength, "Image size:", imgBytes.byteLength);

    await Promise.all([
      writeFile(audioPath, Buffer.from(audioBytes)),
      writeFile(imgPath, Buffer.from(imgBytes)),
    ]);

    // Single ffmpeg pass: optional watermark mix + still-image video encode
    const args = ["-y", "-framerate", "1", "-loop", "1", "-i", imgPath, "-i", audioPath];
    if (watermark) args.push("-i", watermarkPath);

    args.push(
      "-filter_complex",
      watermark
        // watermark plays at +6dB; track fades in from 0.4 → 1.0 over the watermark length (~3.55s)
        ? "[2:a]volume=6dB[wm];[1:a]volume='if(lt(t,3.55),0.4,if(lt(t,4.05),0.4+0.6*(t-3.55)/0.5,1))':eval=frame[track];[wm][track]amix=inputs=2:duration=longest:normalize=0[aout];[0:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vout]"
        : "[0:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vout];[1:a]anull[aout]",
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "stillimage",
      "-c:a", "aac",
      "-b:a", "192k",
      "-r", "1",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    );

    console.log("Running ffmpeg...");
    await runFfmpeg(args);

    console.log("FFmpeg done, reading output...");
    const videoData = await readFile(outPath);
    console.log("Video size:", videoData.length, "bytes");

    // Fire off Pinata upload in the background via waitUntil — response returns immediately.
    const pinata = getPinata();
    const videoFile = new File([videoData], `${id}.mp4`, { type: "video/mp4" });
    waitUntil(
      pinata.upload.public
        .file(videoFile)
        .name(`automash-export-${id}.mp4`)
        .keyvalues({ type: "automash-video", artist, title, createdAt: new Date().toISOString() })
        .then((upload) => {
          console.log("Pinata upload complete:", `https://${gateway}/files/${upload.cid}`);
        })
        .catch((e) => console.error("Pinata upload failed:", e)),
    );

    waitUntil(
      Promise.all([
        unlink(audioPath).catch(() => {}),
        unlink(imgPath).catch(() => {}),
        unlink(outPath).catch(() => {}),
      ]),
    );

    return new NextResponse(new Uint8Array(videoData), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${id}.mp4"`,
        "Content-Length": String(videoData.length),
      },
    });
  } catch (e) {
    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    const msg = e instanceof Error ? e.message : "Video generation failed";
    console.error("generate-video error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
