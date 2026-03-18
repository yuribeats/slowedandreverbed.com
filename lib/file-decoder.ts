import { ensureAudioContext } from "./audio-context";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Callback-based decodeAudioData for Safari compatibility
function decodeAudio(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // Try callback form first (better Safari/iOS support)
    try {
      ctx.decodeAudioData(
        buffer,
        (decoded) => resolve(decoded),
        (err) => reject(err || new Error("Decode failed"))
      );
    } catch {
      // Fallback to promise form
      ctx.decodeAudioData(buffer).then(resolve, reject);
    }
  });
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File too large (max 100MB)");
  }
  const arrayBuffer = await file.arrayBuffer();
  const ctx = await ensureAudioContext();
  return decodeAudio(ctx, arrayBuffer);
}

export async function decodeArrayBuffer(
  buffer: ArrayBuffer
): Promise<AudioBuffer> {
  const ctx = await ensureAudioContext();
  return decodeAudio(ctx, buffer);
}
