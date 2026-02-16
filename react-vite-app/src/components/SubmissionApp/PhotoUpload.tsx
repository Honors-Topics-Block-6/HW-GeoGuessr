import { useState, useEffect, useRef } from 'react'
import './PhotoUpload.css'

export interface PhotoUploadProps {
  onPhotoSelect: (file: File | null) => void
  selectedPhoto: File | null
}

function PhotoUpload({ onPhotoSelect, selectedPhoto }: PhotoUploadProps): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(selectedPhoto ? URL.createObjectURL(selectedPhoto) : null)
  const [dragActive, setDragActive] = useState<boolean>(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync preview state when selectedPhoto is cleared by parent (e.g., after form submission)
  useEffect(() => {
    if (!selectedPhoto) {
      setPreview(null) // eslint-disable-line react-hooks/set-state-in-effect -- Intentional: syncing derived state from prop
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }, [selectedPhoto])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file))
      onPhotoSelect(file)
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
      if (file.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(file))
        onPhotoSelect(file)
      }
    }
  }

  const handleClick = (): void => {
    inputRef.current?.click()
  }

  const handleRemove = (): void => {
    setPreview(null)
    onPhotoSelect(null)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div className="photo-upload">
      <h3>Upload Photo</h3>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="file-input"
      />

      {!preview ? (
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
            <p className="file-types">PNG, JPG, GIF up to 10MB</p>
          </div>
        </div>
      ) : (
        <div className="preview-container">
          <img src={preview} alt="Preview" className="preview-image" />
          <button className="remove-button" onClick={handleRemove}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export default PhotoUpload
