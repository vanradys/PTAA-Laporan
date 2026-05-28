declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }

  interface Process {
    env: ProcessEnv;
    cwd(): string;
    nextTick(callback: () => void): void;
  }

  interface Global {
    process: Process;
    Buffer: typeof Buffer;
  }
}

declare var process: NodeJS.Process;
declare var global: NodeJS.Global;
declare class Buffer {
  static from(value: string | ArrayLike<number> | ArrayBuffer | SharedArrayBuffer): Buffer;
  static alloc(size: number): Buffer;
}
