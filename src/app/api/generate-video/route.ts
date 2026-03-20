import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require("ffmpeg-static");

function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const audioFile = formData.get("audio") as File | null;
  const imageFile = formData.get("image") as File | null;

  if (!audioFile || !imageFile) {
    return NextResponse.json({ error: "Missing audio or image" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const tmp = tmpdir();
  const audioPath = join(tmp, `${id}-audio.wav`);
  const imgPath = join(tmp, `${id}-cover.png`);
  const outPath = join(tmp, `${id}-output.mp4`);

  try {
    const [audioData, imgData] = await Promise.all([
      audioFile.arrayBuffer(),
      imageFile.arrayBuffer(),
    ]);

    await Promise.all([
      writeFile(audioPath, Buffer.from(audioData)),
      writeFile(imgPath, Buffer.from(imgData)),
    ]);

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

    const videoData = await readFile(outPath);

    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    return new NextResponse(videoData, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="export.mp4"`,
      },
    });
  } catch (e) {
    await Promise.all([
      unlink(audioPath).catch(() => {}),
      unlink(imgPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ]);

    console.error("FFmpeg error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Video generation failed" },
      { status: 500 }
    );
  }
}
