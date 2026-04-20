let ctx: AudioContext | null = null;
let workletReady = false;

export function getAudioContext(): AudioContext {
  if (ctx && ctx.state === "closed") {
    ctx = null;
    workletReady = false;
  }
  if (!ctx) {
    ctx = new AudioContext();
    workletReady = false;
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export async function resumeAudioContext(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state === "suspended") await c.resume();
  return c;
}

export async function restartAudioContext(): Promise<AudioContext> {
  if (ctx) {
    try { await ctx.close(); } catch { /* ok */ }
  }
  ctx = null;
  workletReady = false;
  return getAudioContext();
}

export async function setAudioOutputDevice(deviceId: string): Promise<void> {
  const c = getAudioContext();
  if (typeof (c as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId === "function") {
    await (c as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
  }
}

export async function getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput");
  } catch {
    return [];
  }
}

export async function ensurePitchWorklet(): Promise<void> {
  const c = getAudioContext();
  if (workletReady) return;
  try {
    await c.audioWorklet.addModule("/worklets/rubberband-processor.js");
    workletReady = true;
  } catch {
    // Worklet not available — pitch shifting will be bypassed
  }
}

export function isPitchWorkletReady(): boolean {
  return workletReady;
}
