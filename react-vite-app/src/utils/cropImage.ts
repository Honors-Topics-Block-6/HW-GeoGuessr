export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageOptions {
  /** Output square size in pixels (default 512) */
  size?: number;
  /** Output mime type (default image/jpeg) */
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Encoder quality (only applies to lossy formats, default 0.85) */
  quality?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = src;
  });
}

export async function cropImageToBlob(
  imageSrc: string,
  crop: CropAreaPixels,
  { size = 512, type = 'image/jpeg', quality = 0.85 }: CropImageOptions = {}
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not supported in this browser.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size,
    size
  );

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });

  if (!blob) {
    throw new Error('Failed to export cropped image.');
  }

  return blob;
}
