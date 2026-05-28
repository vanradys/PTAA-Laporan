interface ImportMetaEnv {
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly [key: string]: string | boolean | undefined;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
