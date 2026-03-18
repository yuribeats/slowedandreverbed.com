export function generateImpulseResponse(
  sampleRate: number,
  duration: number,
  decay: number
): Float32Array[] {
  const length = Math.ceil(sampleRate * duration);
  const channels: Float32Array[] = [
    new Float32Array(length),
    new Float32Array(length),
  ];

  for (let c = 0; c < 2; c++) {
    const data = channels[c];
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return channels;
}
