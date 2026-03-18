export interface ProcessingParams {
  rate: number;
  reverbWet: number;
  reverbDuration: number;
  reverbDecay: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

export interface SimpleParams {
  rate: number;     // 0.5–1.0
  reverb: number;   // 0–1
  tone: number;     // -1 to 1 (dark to bright)
}

export interface EQBand {
  type: BiquadFilterType;
  frequency: number;
  gain: number;
}

export const SIMPLE_DEFAULTS: SimpleParams = {
  rate: 0.85,
  reverb: 0.5,
  tone: -0.3,  // slightly dark
};

export function expandParams(s: SimpleParams): ProcessingParams {
  // Tone: boost the direction you're turning.
  // Negative = dark (bass boost + high cut), Positive = bright (high boost + bass cut)
  // ±15dB swing for dramatic effect
  const toneMag = Math.abs(s.tone);
  const toneSign = s.tone < 0 ? -1 : 1;
  // Exponential curve for more impact at extremes
  const toneAmount = Math.pow(toneMag, 0.7) * 15 * toneSign;

  // Reverb: use a sqrt curve so lower values still have audible wetness.
  // At 0.25 knob → ~0.4 wet. At 0.5 → ~0.57 wet. At 1.0 → 0.8 wet.
  const reverbCurve = Math.sqrt(s.reverb);

  return {
    rate: s.rate,
    reverbWet: reverbCurve * 0.8,
    reverbDuration: 2.5 + s.reverb * 3.5,
    reverbDecay: 2.0 + s.reverb * 2.0,
    eqLow: -toneAmount,
    eqMid: 0,
    eqHigh: toneAmount,
  };
}

export const DEFAULTS: ProcessingParams = expandParams(SIMPLE_DEFAULTS);
