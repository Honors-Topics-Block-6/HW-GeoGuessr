import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase'
import MapSelector from './MapSelector'
import PhotoUpload from './PhotoUpload'
import './SubmissionForm.css'

function SubmissionForm() {
  const [photo, setPhoto] = useState(null)
  const [location, setLocation] = useState(null)
  const [floor, setFloor] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handlePhotoSelect = (file) => {
    setPhoto(file)
    setSubmitSuccess(false)
    setSubmitError('')
  }

  const handleLocationSelect = (position) => {
    setLocation(position)
    setSubmitSuccess(false)
    setSubmitError('')
  }

  const handleFloorChange = (e) => {
    setFloor(e.target.value)
    setSubmitSuccess(false)
    setSubmitError('')
  }

  const resetForm = () => {
    setPhoto(null)
    setLocation(null)
    setFloor('')
    // Don't reset submitSuccess here - it should persist to show the success message
    setSubmitError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validation
    if (!photo) {
      setSubmitError('Please upload a photo')
      return
    }
    if (!location) {
      setSubmitError('Please select a location on the map')
      return
    }
    if (!floor || isNaN(parseInt(floor))) {
      setSubmitError('Please enter a valid floor number')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')

    try {
      // Upload photo to Firebase Storage
      const timestamp = Date.now()
      const fileName = `submissions/${timestamp}_${photo.name}`
      const storageRef = ref(storage, fileName)

      await uploadBytes(storageRef, photo)
      const photoURL = await getDownloadURL(storageRef)

      // Save submission to Firestore
      await addDoc(collection(db, 'submissions'), {
        photoURL,
        photoName: photo.name,
        location: {
          x: location.x,
          y: location.y
        },
        floor: parseInt(floor),
        status: 'pending', // pending, approved, denied
        createdAt: serverTimestamp(),
        reviewedAt: null
      })

      setSubmitSuccess(true)
      resetForm()
    } catch (error) {
      console.error('Error submitting:', error)
      setSubmitError('Failed to submit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="submission-form">
      <h2>Submit a New Photo</h2>

      {submitSuccess && (
        <div className="success-message">
          Photo submitted successfully! It will be reviewed by an admin.
        </div>
      )}

      {submitError && (
        <div className="error-message">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <PhotoUpload onPhotoSelect={handlePhotoSelect} selectedPhoto={photo} />

        <MapSelector onLocationSelect={handleLocationSelect} selectedLocation={location} />

        <div className="floor-input">
          <h3>Floor Number</h3>
          <input
            type="number"
            value={floor}
            onChange={handleFloorChange}
            placeholder="Enter floor number (e.g., 1, 2, 3)"
            min="1"
            max="3"
          />
          <p className="floor-hint">Floors 1-3 only</p>
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Photo'}
        </button>
      </form>
    </div>
  )
}

export default SubmissionForm
