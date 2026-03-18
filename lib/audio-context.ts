let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (ctx && ctx.state === "closed") {
    ctx = null;
  }
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}
