/**
 * Compresses an image file using pica (Lanczos3 resampling) and returns a
 * Base64 data URL encoded as WebP.
 *
 * HEIC/HEIF files are automatically converted to JPEG first via heic-to.
 * Iteratively lowers quality until the Base64 output fits within maxBytes.
 *
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Base64 data URL of the compressed image (WebP)
 */

import Pica from 'pica'
import { heicTo } from 'heic-to'

const picaInstance = Pica()

const HEIC_TYPES = ['image/heic', 'image/heif']
const HEIC_EXTENSIONS = ['.heic', '.heif']

export function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.includes(file.type.toLowerCase())) return true
  const name = file.name.toLowerCase()
  return HEIC_EXTENSIONS.some(ext => name.endsWith(ext))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

/**
 * Converts a HEIC/HEIF file to a JPEG File.
 * Tries native browser decoding first (Safari), then falls back to heic-to
 * (which bundles libheif 1.21.2 and supports modern iPhone HEIC files).
 */
async function convertHeicToJpeg(file: File): Promise<File> {
  const jpegName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg')

  // Safari can decode HEIC natively — draw to canvas and export as JPEG
  try {
    console.log('[convertHeicToJpeg] Trying native createImageBitmap…')
    const bitmap = await withTimeout(createImageBitmap(file), 15_000, 'createImageBitmap')
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        0.92
      )
    })
    console.log('[convertHeicToJpeg] Native path succeeded')
    return new File([blob], jpegName, { type: 'image/jpeg' })
  } catch (nativeErr) {
    console.warn('[convertHeicToJpeg] Native decoding failed, falling back to heic-to:', nativeErr)
  }

  console.log('[convertHeicToJpeg] Using heic-to library…')
  const jpegBlob = await withTimeout(
    heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 }),
    30_000,
    'heic-to conversion'
  )
  console.log('[convertHeicToJpeg] heic-to succeeded')
  return new File([jpegBlob], jpegName, { type: 'image/jpeg' })
}

/**
 * If the file is HEIC/HEIF, converts it to JPEG so the browser can display
 * and process it. Non-HEIC files are returned as-is.
 *
 * Call this at file-selection time so previews work in all browsers.
 */
export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file
  console.log('[normalizeImageFile] HEIC detected — converting to JPEG…')
  const converted = await convertHeicToJpeg(file)
  console.log(`[normalizeImageFile] Converted: ${(converted.size / 1024).toFixed(1)}KB`)
  return converted
}

export interface CompressImageOptions {
  /** Max width in pixels (default 600) */
  maxWidth?: number;
  /** Max height in pixels (default 600) */
  maxHeight?: number;
  /** Starting WebP quality 0-1 (default 0.55) */
  quality?: number;
  /** Max size in bytes for the final Base64 data URL (default 50 000) */
  maxBytes?: number;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to convert compressed image to data URL'))
    reader.readAsDataURL(blob)
  })
}

export async function compressImage(
  file: File,
  {
    maxWidth = 600,
    maxHeight = 600,
    quality = 0.55,
    maxBytes = 50_000,
  }: CompressImageOptions = {}
): Promise<string> {
  if (isHeicFile(file)) {
    console.log('[compressImage] HEIC file detected, converting…')
    file = await convertHeicToJpeg(file)
  }

  const rawSizeKB = (file.size / 1024).toFixed(1)
  console.log(`[compressImage] Raw file: ${file.name} — ${rawSizeKB}KB (${file.type})`)

  const imageBitmap = await withTimeout(
    createImageBitmap(file),
    15_000,
    'createImageBitmap (compress)'
  )

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

  await picaInstance.resize(srcCanvas, destCanvas)

  const MIN_QUALITY = 0.2
  const QUALITY_STEP = 0.05
  let currentQuality = quality

  let dataUrl = await blobToDataURL(
    await picaInstance.toBlob(destCanvas, 'image/webp', currentQuality)
  )

  while (dataUrl.length > maxBytes && currentQuality > MIN_QUALITY) {
    currentQuality = Math.max(currentQuality - QUALITY_STEP, MIN_QUALITY)
    dataUrl = await blobToDataURL(
      await picaInstance.toBlob(destCanvas, 'image/webp', currentQuality)
    )
  }

  const compressedSizeKB = (dataUrl.length / 1024).toFixed(1)
  console.log(`[compressImage] Compressed: ${compressedSizeKB}KB (quality: ${currentQuality.toFixed(2)}, ${targetW}x${targetH})`)
  console.log(`[compressImage] Base64 data URL:\n${dataUrl}`)

  return dataUrl
}
