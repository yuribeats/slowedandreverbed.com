import { getAudioContext } from "./audio-context";

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getAudioContext();
  return ctx.decodeAudioData(arrayBuffer);
}

export async function decodeArrayBuffer(
  buffer: ArrayBuffer
): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  return ctx.decodeAudioData(buffer);
}
