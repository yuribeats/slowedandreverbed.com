import { ProcessingParams } from "./types";
import { generateImpulseResponse } from "./impulse-response";

export interface RenderInput {
  channelData: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  params: ProcessingParams;
}

export async function renderOffline(input: RenderInput): Promise<{
  channelData: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  length: number;
}> {
  const { channelData, sampleRate, numberOfChannels, length, params } = input;

  const outputLength = Math.ceil((length / params.rate) * 1.0) +
    Math.ceil(params.reverbDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(
    numberOfChannels,
    outputLength,
    sampleRate
  );

  // Create source buffer
  const sourceBuffer = offlineCtx.createBuffer(
    numberOfChannels,
    length,
    sampleRate
  );
  for (let c = 0; c < numberOfChannels; c++) {
    sourceBuffer.getChannelData(c).set(channelData[c]);
  }

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.playbackRate.value = params.rate;

  // EQ chain
  const lowShelf = offlineCtx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 200;
  lowShelf.gain.value = params.eqLow;

  const peaking = offlineCtx.createBiquadFilter();
  peaking.type = "peaking";
  peaking.frequency.value = 2500;
  peaking.Q.value = 1.0;
  peaking.gain.value = params.eqMid;

  const highShelf = offlineCtx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 8000;
  highShelf.gain.value = params.eqHigh;

  // Reverb
  const irData = generateImpulseResponse(
    sampleRate,
    params.reverbDuration,
    params.reverbDecay
  );
  const irBuffer = offlineCtx.createBuffer(2, irData[0].length, sampleRate);
  irBuffer.getChannelData(0).set(irData[0]);
  irBuffer.getChannelData(1).set(irData[1]);

  const convolver = offlineCtx.createConvolver();
  convolver.buffer = irBuffer;

  const dryGain = offlineCtx.createGain();
  dryGain.gain.value = 1 - params.reverbWet;

  const wetGain = offlineCtx.createGain();
  wetGain.gain.value = params.reverbWet;

  // Connect signal chain
  source.connect(lowShelf);
  lowShelf.connect(peaking);
  peaking.connect(highShelf);

  highShelf.connect(dryGain);
  highShelf.connect(convolver);
  convolver.connect(wetGain);

  dryGain.connect(offlineCtx.destination);
  wetGain.connect(offlineCtx.destination);

  source.start(0);

  const rendered = await offlineCtx.startRendering();

  // Extract channel data
  const outputChannels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    outputChannels.push(new Float32Array(rendered.getChannelData(c)));
  }

  return {
    channelData: outputChannels,
    sampleRate: rendered.sampleRate,
    numberOfChannels: rendered.numberOfChannels,
    length: rendered.length,
  };
}
