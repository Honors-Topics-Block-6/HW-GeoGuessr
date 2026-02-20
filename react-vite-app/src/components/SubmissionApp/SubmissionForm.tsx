import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, addDoc, serverTimestamp, increment } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { getUserDoc, updateUserDoc } from '../../services/userService'
import { compressImage } from '../../utils/compressImage'
import { getRegions, getPlayingArea, getFloorsForPoint, isPointInPlayingArea } from '../../services/regionService'
import type { Point, Region as RegionData, PlayingArea as PlayingAreaData } from '../../services/regionService'
import MapPicker from '../MapPicker/MapPicker'
import type { MapCoordinates } from '../MapPicker/MapPicker'
import FloorSelector from '../FloorSelector/FloorSelector'
import PhotoUpload from './PhotoUpload'
import './SubmissionForm.css'

// All possible floors when override is enabled
const ALL_FLOORS: number[] = [1, 2, 3]

const DIFFICULTY_OPTIONS: string[] = ['easy', 'medium', 'hard']
const BUILDING_OPTIONS: string[] = [
  'Copses Family Pool',
  'Taper Athletic Pavilion',
  'Ted Slavin Field',
  'Pool House',
  'Harvard Westlake Driveway',
  'Munger Science Center',
  'Sprague Plaza',
  'Ahmanson Lecture Hall',
  'Seaver Academic Center',
  'Wellness Center',
  'Buisness Office',
  'Security Kiosk',
  'Kutler Center',
  'Flag Court Cafe',
  'Learning Center',
  'Mudd Library',
  "St. Saviour's Chapel",
  'Feldman-Horn',
  'Rugby Hall',
  'Rugby Tower',
  'Drama Lab',
  'Chalmers Hall',
  'Weiler Hall'
]
const SORTED_BUILDING_OPTIONS = [...BUILDING_OPTIONS].sort((a, b) => (
  a.localeCompare(b, 'en', { sensitivity: 'base' })
))

type MapCoords = MapCoordinates

export interface SubmissionFormProps {}

function SubmissionForm(_props: SubmissionFormProps): React.JSX.Element {
  const { user } = useAuth()
  const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const [photo, setPhoto] = useState<File | null>(null)
  const [location, setLocation] = useState<MapCoords | null>(null)
  const [floor, setFloor] = useState<number | null>(null)
  const [difficulty, setDifficulty] = useState<string | null>(null)
  const [building, setBuilding] = useState<string | null>(null)
  const [isBuildingOpen, setIsBuildingOpen] = useState<boolean>(false)
  const buildingMenuRef = useRef<HTMLDivElement | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string>('')

  // Region/playing area state (matching game behavior)
  const [regions, setRegions] = useState<RegionData[]>([])
  const [playingArea, setPlayingArea] = useState<PlayingAreaData | null>(null)
  const [availableFloors, setAvailableFloors] = useState<number[] | null>(null)
  const [clickRejected, setClickRejected] = useState<boolean>(false)

  // Override: allows picking any location with any floor
  const [overrideRestrictions, setOverrideRestrictions] = useState<boolean>(false)

  // Load regions and playing area on mount
  useEffect(() => {
    async function loadData(): Promise<void> {
      const [fetchedRegions, fetchedPlayingArea] = await Promise.all([
        getRegions(),
        getPlayingArea()
      ])
      setRegions(fetchedRegions)
      setPlayingArea(fetchedPlayingArea)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (!isBuildingOpen) return

    const handleOutsideClick = (event: MouseEvent): void => {
      if (!buildingMenuRef.current) return
      if (!buildingMenuRef.current.contains(event.target as Node)) {
        setIsBuildingOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isBuildingOpen])

  const handlePhotoSelect = (file: File | null): void => {
    setPhoto(file)
    setSubmitSuccess(false)
    setSubmitError('')
  }

  const handleMapClick = useCallback((coords: MapCoords): void => {
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

  const handleFloorSelect = useCallback((selectedFloor: number): void => {
    setFloor(selectedFloor)
    setSubmitSuccess(false)
    setSubmitError('')
  }, [])

  const handleOverrideChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
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

  const resetForm = (): void => {
    setPhoto(null)
    setLocation(null)
    setFloor(null)
    setDifficulty(null)
    setAvailableFloors(null)
    setBuilding(null)
    // Don't reset submitSuccess here - it should persist to show the success message
    setSubmitError('')
  }

  // Determine if floor selection should be shown
  const isInRegion: boolean = availableFloors !== null && availableFloors.length > 0

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
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
    if (!building) {
      setSubmitError('Please select a building/location')
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
        building,
        difficulty: difficulty,
        status: 'pending', // pending, approved, denied
        submitterUid: user?.uid ?? null,
        createdAt: serverTimestamp(),
        reviewedAt: null
      })

      if (user?.uid) {
        const userDoc = await getUserDoc(user.uid)
        const todayKey = getLocalDateKey(new Date())
        const existingDailyStats = userDoc?.dailyStats ?? {}
        const dayStats = existingDailyStats[todayKey] ?? {
          gamesPlayed: 0,
          totalScore: 0,
          totalGuessTimeSeconds: 0,
          fiveKCount: 0,
          twentyFiveKCount: 0,
          photosSubmittedCount: 0,
          buildingStats: {}
        }
        await updateUserDoc(user.uid, {
          photosSubmittedCount: increment(1),
          dailyStats: {
            ...existingDailyStats,
            [todayKey]: {
              ...dayStats,
              photosSubmittedCount: dayStats.photosSubmittedCount + 1
            }
          }
        })
      }

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

          <div className="building-selector" ref={buildingMenuRef}>
            <label className="building-selector-label" htmlFor="buildingSelect">
              Building / Location
            </label>
            <button
              id="buildingSelect"
              type="button"
              className="building-selector-button"
              aria-haspopup="listbox"
              aria-expanded={isBuildingOpen}
              onClick={() => setIsBuildingOpen((open) => !open)}
            >
              {building ?? 'Select a building/location'}
            </button>
            {isBuildingOpen && (
              <div className="building-selector-menu" role="listbox">
                {SORTED_BUILDING_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={building === option}
                    className={`building-selector-option ${building === option ? 'selected' : ''}`}
                    onClick={() => {
                      setBuilding(option)
                      setIsBuildingOpen(false)
                      setSubmitError('')
                      setSubmitSuccess(false)
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isInRegion && (
            <FloorSelector
              selectedFloor={floor}
              onFloorSelect={handleFloorSelect}
              floors={availableFloors!}
            />
          )}

          {/* Difficulty selector */}
          <div className="difficulty-selector">
            <div className="difficulty-selector-header">
              <span className="difficulty-selector-icon">🎯</span>
              <span>Select Difficulty</span>
            </div>
            <div className="difficulty-selector-buttons">
              {DIFFICULTY_OPTIONS.map((diff: string) => (
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
            <div className={`status-item ${building ? 'complete' : ''}`}>
              <span className="status-icon">{building ? '\u2713' : '\u25CB'}</span>
              <span>Building selected</span>
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
