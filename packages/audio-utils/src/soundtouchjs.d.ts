declare module "soundtouchjs" {
  export class SoundTouch {
    pitch: number;
    pitchSemitones: number;
    rate: number;
    tempo: number;
  }
  export class SimpleFilter {
    constructor(source: { extract(target: Float32Array, numFrames: number): number }, soundtouch: SoundTouch, onEnd?: () => void);
    extract(target: Float32Array, numFrames: number): number;
    readonly sourcePosition: number;
  }
  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames: number, position?: number): number;
  }
  export function getWebAudioNode(context: AudioContext, filter: SimpleFilter, sourcePositionCallback?: (pos: number) => void, bufferSize?: number): ScriptProcessorNode;
}
