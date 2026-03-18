import { renderOffline } from "@yuribeats/audio-utils";
import type { ProcessingParams } from "@yuribeats/audio-utils";

interface RenderMessage {
  type: "RENDER";
  channelData: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  params: ProcessingParams;
}

self.onmessage = async (e: MessageEvent<RenderMessage>) => {
  const msg = e.data;
  if (msg.type !== "RENDER") return;

  try {
    self.postMessage({ type: "PROGRESS", value: 0.1 });

    const result = await renderOffline({
      channelData: msg.channelData,
      sampleRate: msg.sampleRate,
      numberOfChannels: msg.numberOfChannels,
      length: msg.length,
      params: msg.params,
    });

    self.postMessage({ type: "PROGRESS", value: 0.9 });

    // Transfer buffers back
    const transferable = result.channelData.map((ch) => ch.buffer as ArrayBuffer);
    const message = {
      type: "COMPLETE",
      channelData: result.channelData,
      sampleRate: result.sampleRate,
      numberOfChannels: result.numberOfChannels,
      length: result.length,
    };
    (self as unknown as Worker).postMessage(message, transferable);
  } catch (err) {
    self.postMessage({
      type: "ERROR",
      message: err instanceof Error ? err.message : "Render failed",
    });
  }
};
