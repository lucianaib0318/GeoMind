declare module "gif-encoder-2" {
  export default class GIFEncoder {
    constructor(width: number, height: number, algorithm?: "neuquant" | "octree", useOptimizer?: boolean, totalFrames?: number);
    out: {
      getData(): Buffer;
    };
    addFrame(input: Uint8Array | Buffer | Uint8ClampedArray): void;
    finish(): void;
    setDelay(delayMs: number): void;
    setRepeat(repeat: number): void;
    start(): void;
  }
}

declare module "pngjs" {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
    };
  }
}
