import { useState, useRef } from 'react'
import './PhotoUpload.css'

function PhotoUpload({ onPhotoSelect, selectedPhoto }) {
  const [preview, setPreview] = useState(selectedPhoto ? URL.createObjectURL(selectedPhoto) : null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file))
      onPhotoSelect(file)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
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

  const handleClick = () => {
    inputRef.current.click()
  }

  const handleRemove = () => {
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
