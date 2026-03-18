export interface ProcessingParams {
  rate: number;
  reverbWet: number;
  reverbDuration: number;
  reverbDecay: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  eqBumpFreq: number;
  eqBumpGain: number;
}

export interface SimpleParams {
  speed: number;    // -0.5 to +0.5 (0 = no change, negative = slow, positive = fast)
  reverb: number;   // 0–1
  tone: number;     // -1 to 1 (dark to bright)
}

export interface EQBand {
  type: BiquadFilterType;
  frequency: number;
  gain: number;
}

export const SIMPLE_DEFAULTS: SimpleParams = {
  speed: -0.15,    // slightly slowed (~0.85x)
  reverb: 0.5,
  tone: -0.3,
};

export function expandParams(s: SimpleParams): ProcessingParams {
  // Speed: 0 = 1.0x, -0.5 = 0.5x, +0.5 = 1.5x
  const rate = 1.0 + s.speed;

  // Tone: ±20dB swing with exponential curve for dramatic effect
  const toneMag = Math.abs(s.tone);
  const toneSign = s.tone < 0 ? -1 : 1;
  const toneAmount = Math.pow(toneMag, 0.6) * 20 * toneSign;

  // Reverb: sqrt curve for audible presence at low settings
  const reverbCurve = Math.sqrt(s.reverb);

  // Resonant bump: sweeps frequency with tone direction, gain scales with magnitude
  const bumpFreq = s.tone > 0
    ? 2000 + s.tone * 6000     // bright: 2kHz → 8kHz
    : 800 - toneMag * 600;     // dark: 800Hz → 200Hz
  const bumpGain = Math.pow(toneMag, 0.6) * 12; // up to 12dB resonant peak

  return {
    rate,
    reverbWet: reverbCurve * 0.8,
    reverbDuration: 2.5 + s.reverb * 3.5,
    reverbDecay: 2.0 + s.reverb * 2.0,
    eqLow: -toneAmount * 0.3,
    eqMid: 0,
    eqHigh: toneAmount,
    eqBumpFreq: bumpFreq,
    eqBumpGain: bumpGain,
  };
}

export const DEFAULTS: ProcessingParams = expandParams(SIMPLE_DEFAULTS);
