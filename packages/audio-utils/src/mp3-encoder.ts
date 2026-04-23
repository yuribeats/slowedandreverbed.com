import lamejs from "@breezystack/lamejs";

const MAX_SAMPLES = 1152;

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function encodeMP3(buffer: AudioBuffer, kbps = 192): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;

  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);

  const left = floatToInt16(buffer.getChannelData(0));
  const right = numChannels === 2 ? floatToInt16(buffer.getChannelData(1)) : null;

  const chunks: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += MAX_SAMPLES) {
    const leftChunk = left.subarray(i, i + MAX_SAMPLES);
    const rightChunk = right ? right.subarray(i, i + MAX_SAMPLES) : null;
    const encoded = rightChunk
      ? encoder.encodeBuffer(leftChunk, rightChunk)
      : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) chunks.push(encoded);
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}
