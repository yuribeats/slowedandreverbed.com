import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { PinataSDK } from "pinata";

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
  const body = await request.json();
  const { audioCid, imageCid, artist, title } = body as {
    audioCid: string;
    imageCid: string;
    artist: string;
    title: string;
  };

  if (!audioCid || !imageCid) {
    return NextResponse.json({ error: "Missing audioCid or imageCid" }, { status: 400 });
  }

  const gateway = process.env.PINATA_GATEWAY!;
  const id = crypto.randomUUID();
  const tmp = tmpdir();
  const audioPath = join(tmp, `${id}-audio.wav`);
  const imgPath = join(tmp, `${id}-cover.png`);
  const outPath = join(tmp, `${id}-output.mp4`);

  try {
    // Download audio and image from Pinata
    console.log("Downloading audio and image from Pinata...");
    const [audioRes, imgRes] = await Promise.all([
      fetch(`https://${gateway}/files/${audioCid}`),
      fetch(`https://${gateway}/files/${imageCid}`),
    ]);

    if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

    const [audioData, imgData] = await Promise.all([
      audioRes.arrayBuffer(),
      imgRes.arrayBuffer(),
    ]);

    console.log("Audio size:", audioData.byteLength, "Image size:", imgData.byteLength);

    await Promise.all([
      writeFile(audioPath, Buffer.from(audioData)),
      writeFile(imgPath, Buffer.from(imgData)),
    ]);

    console.log("Running ffmpeg...");
    await runFfmpeg([
      "-y",
      "-loop", "1",
      "-i", imgPath,
      "-i", audioPath,
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-c:a", "aac",
      "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ]);

    console.log("FFmpeg done, reading output...");
    const videoData = await readFile(outPath);
    console.log("Video size:", videoData.length, "bytes");

    // Upload to Pinata
    console.log("Uploading video to Pinata...");
    const pinata = getPinata();
    const videoFile = new File([videoData], `${id}.mp4`, { type: "video/mp4" });
    const upload = await pinata.upload.public.file(videoFile)
      .name(`driftwave-export-${id}.mp4`)
      .keyvalues({
        type: "driftwave-video",
        artist: artist || "UNKNOWN",
        title: title || "UNTITLED",
        createdAt: new Date().toISOString(),
      });

    const videoUrl = `https://${gateway}/files/${upload.cid}`;
    console.log("Uploaded to Pinata:", videoUrl);

    // Cleanup temp files
    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    return NextResponse.json({ url: videoUrl });
  } catch (e) {
    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    console.error("generate-video error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Video generation failed" },
      { status: 500 }
    );
  }
}
