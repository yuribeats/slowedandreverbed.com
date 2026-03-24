import { SimpleParams } from "@yuribeats/audio-utils";

const CHANNEL = "driftwave-sync";

export interface SyncState {
  deckId: "A" | "B";
  params: SimpleParams;
  volume: number;
  regionStart: number;
  regionEnd: number;
  isPlaying: boolean;
  pauseOffset: number;
  playbackRate: number;
  sourceFilename: string | null;
  duration: number;
  // performance.now()-based start time for cursor sync
  perfStartedAt: number;
}

export interface PeakData {
  deckId: "A" | "B";
  peaks: number[]; // serialized from Float32Array
  duration: number;
  sourceFilename: string | null;
}

export type SyncMessage =
  | { type: "state"; payload: SyncState }
  | { type: "peaks"; payload: PeakData }
  | { type: "param-change"; deckId: "A" | "B"; key: string; value: number | boolean | string }
  | { type: "transport"; deckId: "A" | "B"; action: "play" | "stop" | "pause" }
  | { type: "volume"; deckId: "A" | "B"; value: number }
  | { type: "region"; deckId: "A" | "B"; start: number; end: number }
  | { type: "seek"; deckId: "A" | "B"; position: number }
  | { type: "request-state"; deckId: "A" | "B" };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function broadcast(msg: SyncMessage) {
  try {
    getChannel().postMessage(msg);
  } catch {
    // ignore if channel is closed
  }
}

export function onMessage(handler: (msg: SyncMessage) => void): () => void {
  const ch = getChannel();
  const listener = (e: MessageEvent) => handler(e.data as SyncMessage);
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}
