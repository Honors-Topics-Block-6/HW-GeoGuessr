/**
 * Compresses an image file using pica (Lanczos3 resampling) and returns a
 * Base64 data URL encoded as WebP.
 *
 * Pica's Lanczos3 filter produces clean downscales without the aliasing
 * artifacts that canvas bilinear/bicubic interpolation can introduce.
 *
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Base64 data URL of the compressed image (WebP)
 */

import Pica from 'pica'

const pica = new Pica()

export interface CompressImageOptions {
  /** Max width in pixels (default 1600) */
  maxWidth?: number;
  /** Max height in pixels (default 1600) */
  maxHeight?: number;
  /** WebP quality 0-1 (default 0.82) */
  quality?: number;
}

export async function compressImage(
  file: File,
  { maxWidth = 1600, maxHeight = 1600, quality = 0.82 }: CompressImageOptions = {}
): Promise<string> {
  const imageBitmap = await createImageBitmap(file)

  let targetW = imageBitmap.width
  let targetH = imageBitmap.height

  if (targetW > maxWidth || targetH > maxHeight) {
    const ratio = Math.min(maxWidth / targetW, maxHeight / targetH)
    targetW = Math.round(targetW * ratio)
    targetH = Math.round(targetH * ratio)
  }

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = imageBitmap.width
  srcCanvas.height = imageBitmap.height
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.drawImage(imageBitmap, 0, 0)
  imageBitmap.close()

  const destCanvas = document.createElement('canvas')
  destCanvas.width = targetW
  destCanvas.height = targetH

  await pica.resize(srcCanvas, destCanvas)

  const blob = await pica.toBlob(destCanvas, 'image/webp', quality)

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to convert compressed image to data URL'))
    reader.readAsDataURL(blob)
  })
}
