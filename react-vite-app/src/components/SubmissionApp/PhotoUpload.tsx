import { useState, useEffect, useRef } from 'react'
import { isHeicFile, normalizeImageFile } from '../../utils/compressImage'
import './PhotoUpload.css'

export interface PhotoUploadProps {
  onPhotoSelect: (file: File | null) => void
  selectedPhoto: File | null
}

function PhotoUpload({ onPhotoSelect, selectedPhoto }: PhotoUploadProps): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState<boolean>(false)
  const [converting, setConverting] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  // Sync preview state with selectedPhoto prop and handle object URL cleanup
  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    if (selectedPhoto) {
      const newUrl = URL.createObjectURL(selectedPhoto)
      previewUrlRef.current = newUrl
      setPreview(newUrl)
    } else {
      setPreview(null)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }

    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [selectedPhoto])

  const isImageFile = (file: File): boolean =>
    file.type.startsWith('image/') || isHeicFile(file)

  const processFile = async (file: File): Promise<void> => {
    setError('')
    try {
      setConverting(true)
      const normalized = await normalizeImageFile(file)
      onPhotoSelect(normalized)
    } catch (err) {
      console.error('[PhotoUpload] HEIC conversion failed:', err)
      setError('Could not process this image. Please convert it to JPG or PNG first.')
    } finally {
      setConverting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file && isImageFile(file)) {
      processFile(file)
    }
  }

  const handleDrag = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (isImageFile(file)) {
        processFile(file)
      }
    }
  }

  const handleClick = (): void => {
    inputRef.current?.click()
  }

  const handleRemove = (): void => {
    onPhotoSelect(null)
  }

  return (
    <div className="photo-upload">
      <h3>Upload Photo</h3>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handleFileChange}
        className="file-input"
      />

      {error && <p className="photo-upload-error" style={{ color: '#e74c3c', fontSize: '0.9rem' }}>{error}</p>}

      {converting ? (
        <div className="drop-zone">
          <div className="drop-zone-content">
            <p>Converting HEIC image…</p>
          </div>
        </div>
      ) : !preview ? (
        <div
          className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
          onClick={handleClick}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="drop-zone-content">
            <span className="upload-icon">📷</span>
            <p>Click to upload or drag and drop</p>
            <p className="file-types">PNG, JPG, GIF, HEIC up to 10MB</p>
          </div>
        </div>
      ) : (
        <div className="preview-container">
          <img src={preview} alt="Preview" className="preview-image" />
          <button type="button" className="remove-button" onClick={handleRemove}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export default PhotoUpload
