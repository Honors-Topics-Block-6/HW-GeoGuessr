import { useState, useEffect, useCallback } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { compressImage } from '../../utils/compressImage'
import { getRegions, getPlayingArea, getFloorsForPoint, isPointInPlayingArea } from '../../services/regionService'
import MapPicker from '../MapPicker/MapPicker'
import FloorSelector from '../FloorSelector/FloorSelector'
import PhotoUpload from './PhotoUpload'
import './SubmissionForm.css'

// All possible floors when override is enabled
const ALL_FLOORS = [1, 2, 3]

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard']

function SubmissionForm() {
  const [photo, setPhoto] = useState(null)
  const [location, setLocation] = useState(null)
  const [floor, setFloor] = useState(null)
  const [difficulty, setDifficulty] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Region/playing area state (matching game behavior)
  const [regions, setRegions] = useState([])
  const [playingArea, setPlayingArea] = useState(null)
  const [availableFloors, setAvailableFloors] = useState(null)
  const [clickRejected, setClickRejected] = useState(false)

  // Override: allows picking any location with any floor
  const [overrideRestrictions, setOverrideRestrictions] = useState(false)

  // Load regions and playing area on mount
  useEffect(() => {
    async function loadData() {
      const [fetchedRegions, fetchedPlayingArea] = await Promise.all([
        getRegions(),
        getPlayingArea()
      ])
      setRegions(fetchedRegions)
      setPlayingArea(fetchedPlayingArea)
    }
    loadData()
  }, [])

  const handlePhotoSelect = (file) => {
    setPhoto(file)
    setSubmitSuccess(false)
    setSubmitError('')
  }

  const handleMapClick = useCallback((coords) => {
    setSubmitSuccess(false)
    setSubmitError('')

    // Check playing area restriction (skip if override is on)
    if (!overrideRestrictions && !isPointInPlayingArea(coords, playingArea)) {
      setClickRejected(true)
      setTimeout(() => setClickRejected(false), 500)
      return
    }

    setLocation(coords)
    setClickRejected(false)

    if (overrideRestrictions) {
      // In override mode, always show all floors
      setAvailableFloors(ALL_FLOORS)
    } else {
      // Determine available floors based on region (matching game behavior)
      const floors = getFloorsForPoint(coords, regions)
      setAvailableFloors(floors)

      // Reset floor selection if current selection is not in available floors
      if (floors === null || (floor && !floors.includes(floor))) {
        setFloor(null)
      }
    }
  }, [overrideRestrictions, playingArea, regions, floor])

  const handleFloorSelect = useCallback((selectedFloor) => {
    setFloor(selectedFloor)
    setSubmitSuccess(false)
    setSubmitError('')
  }, [])

  const handleOverrideChange = useCallback((e) => {
    const checked = e.target.checked
    setOverrideRestrictions(checked)

    if (checked) {
      // When enabling override, show all floors immediately if a location is selected
      if (location) {
        setAvailableFloors(ALL_FLOORS)
      }
    } else {
      // When disabling override, re-evaluate floors based on regions
      if (location) {
        const inPlayingArea = isPointInPlayingArea(location, playingArea)
        if (!inPlayingArea) {
          // Location is outside playing area, clear it
          setLocation(null)
          setFloor(null)
          setAvailableFloors(null)
        } else {
          const floors = getFloorsForPoint(location, regions)
          setAvailableFloors(floors)
          if (floors === null || (floor && !floors.includes(floor))) {
            setFloor(null)
          }
        }
      }
    }
  }, [location, playingArea, regions, floor])

  const resetForm = () => {
    setPhoto(null)
    setLocation(null)
    setFloor(null)
    setDifficulty(null)
    setAvailableFloors(null)
    // Don't reset submitSuccess here - it should persist to show the success message
    setSubmitError('')
  }

  // Determine if floor selection should be shown
  const isInRegion = availableFloors !== null && availableFloors.length > 0

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
    if (isInRegion && floor === null) {
      setSubmitError('Please select a floor')
      return
    }
    if (!difficulty) {
      setSubmitError('Please select a difficulty')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')

    try {
      // Compress image and convert to Base64 data URL
      const photoDataUrl = await compressImage(photo)

      // Save submission with embedded image to Firestore
      await addDoc(collection(db, 'submissions'), {
        photoURL: photoDataUrl,
        photoName: photo.name,
        location: {
          x: location.x,
          y: location.y
        },
        floor: floor ?? null,
        difficulty: difficulty,
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

        <div className="location-section">
          <MapPicker
            markerPosition={location}
            onMapClick={handleMapClick}
            clickRejected={clickRejected}
            playingArea={overrideRestrictions ? null : playingArea}
          />

          <div className="override-control">
            <label className="override-label">
              <input
                type="checkbox"
                checked={overrideRestrictions}
                onChange={handleOverrideChange}
              />
              <span>Allow any location and floor</span>
            </label>
            <p className="override-hint">
              Bypasses playing area and region restrictions
            </p>
          </div>

          {isInRegion && (
            <FloorSelector
              selectedFloor={floor}
              onFloorSelect={handleFloorSelect}
              floors={availableFloors}
            />
          )}

          {/* Difficulty selector */}
          <div className="difficulty-selector">
            <div className="difficulty-selector-header">
              <span className="difficulty-selector-icon">🎯</span>
              <span>Select Difficulty</span>
            </div>
            <div className="difficulty-selector-buttons">
              {DIFFICULTY_OPTIONS.map((diff) => (
                <button
                  key={diff}
                  type="button"
                  className={`difficulty-selector-button ${difficulty === diff ? 'selected' : ''} difficulty-${diff}`}
                  onClick={() => { setDifficulty(diff); setSubmitError(''); setSubmitSuccess(false); }}
                >
                  {diff.charAt(0).toUpperCase() + diff.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Status indicators matching game style */}
          <div className="location-status">
            <div className={`status-item ${location ? 'complete' : ''}`}>
              <span className="status-icon">{location ? '\u2713' : '\u25CB'}</span>
              <span>Location selected</span>
            </div>
            {isInRegion && (
              <div className={`status-item ${floor ? 'complete' : ''}`}>
                <span className="status-icon">{floor ? '\u2713' : '\u25CB'}</span>
                <span>Floor selected</span>
              </div>
            )}
            <div className={`status-item ${difficulty ? 'complete' : ''}`}>
              <span className="status-icon">{difficulty ? '\u2713' : '\u25CB'}</span>
              <span>Difficulty selected</span>
            </div>
          </div>
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
