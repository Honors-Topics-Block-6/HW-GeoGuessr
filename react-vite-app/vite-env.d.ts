/// <reference types="vite/client" />

declare module 'heic-to' {
  export function heicTo(options: { blob: Blob; type?: string; quality?: number }): Promise<Blob>;
}

declare module 'pica' {
  interface PicaOptions {
    features?: string[];
    tiles?: number;
    createImageBitmap?: (input: Blob | ImageBitmapSource) => Promise<ImageBitmap>;
  }
  interface PicaInstance {
    resize(
      from: HTMLCanvasElement | HTMLImageElement,
      to: HTMLCanvasElement,
      options?: { quality?: number }
    ): Promise<HTMLCanvasElement>;
    toBlob(
      canvas: HTMLCanvasElement,
      mimeType: string,
      quality?: number
    ): Promise<Blob>;
  }
  function Pica(options?: PicaOptions): PicaInstance;
  export default Pica;
}

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
