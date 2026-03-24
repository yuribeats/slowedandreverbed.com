// Seeded PRNG so playback and export produce identical impulse responses
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

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

  // Seed from parameters so identical settings always produce identical IR
  const seed = Math.round(duration * 1000) * 7919 + Math.round(decay * 1000) * 104729 + sampleRate;
  const rand = seededRandom(seed);

  for (let c = 0; c < 2; c++) {
    const data = channels[c];
    for (let i = 0; i < length; i++) {
      data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return channels;
}
