export interface ProcessingParams {
  rate: number;
  reverbWet: number;
  reverbDuration: number;
  reverbDecay: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

export interface EQBand {
  type: BiquadFilterType;
  frequency: number;
  gain: number;
}

export const DEFAULTS: ProcessingParams = {
  rate: 0.85,
  reverbWet: 0.45,
  reverbDuration: 4.0,
  reverbDecay: 2.5,
  eqLow: 3,
  eqMid: -3,
  eqHigh: -4,
};
