let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  // Recreate if closed (mobile can close contexts under memory pressure)
  if (ctx && ctx.state === "closed") {
    ctx = null;
  }
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

export async function ensureAudioContext(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state === "suspended") {
    await c.resume();
  }
  return c;
}
