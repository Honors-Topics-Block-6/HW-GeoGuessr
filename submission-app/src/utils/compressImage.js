/**
 * Compresses an image file using canvas and returns a Base64 data URL.
 * Resizes to fit within maxWidth/maxHeight while maintaining aspect ratio,
 * then compresses as JPEG at the given quality.
 *
 * @param {File} file - The image file to compress
 * @param {Object} options
 * @param {number} options.maxWidth - Max width in pixels (default 800)
 * @param {number} options.maxHeight - Max height in pixels (default 800)
 * @param {number} options.quality - JPEG quality 0-1 (default 0.7)
 * @returns {Promise<string>} Base64 data URL of the compressed image
 */
export function compressImage(file, { maxWidth = 800, maxHeight = 800, quality = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')

        let { width, height } = img

        // Scale down to fit within max dimensions while keeping aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl)
      }

      img.onerror = () => reject(new Error('Failed to load image for compression'))
      img.src = event.target.result
    }

    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}
