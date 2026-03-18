let ctx: AudioContext | null = null;
let warmedUp = false;

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

// Call synchronously from any user gesture to unlock audio on iOS/Android
export function warmUpAudio() {
  if (warmedUp) return;
  const c = getAudioContext();
  if (c.state === "suspended") {
    c.resume();
  }
  // Play a silent buffer to fully unlock on iOS
  try {
    const silent = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = silent;
    src.connect(c.destination);
    src.start(0);
  } catch {
    // ignore
  }
  warmedUp = true;
}
