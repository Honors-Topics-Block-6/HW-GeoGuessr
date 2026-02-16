import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { getAllImages, getAllSampleImages, deleteSubmission, deleteImage } from '../../services/imageService'
import MapPicker from '../MapPicker/MapPicker'
import FloorSelector from '../FloorSelector/FloorSelector'
import PhotoUpload from './PhotoUpload'
import { compressImage } from '../../utils/compressImage'
import './AdminReview.css'

const DIFFICULTY_OPTIONS: string[] = ['easy', 'medium', 'hard']

export interface FirestoreTimestamp {
  toDate: () => Date
  seconds?: number
}

export interface Location {
  x: number
  y: number
}

type SubmissionSource = 'submission' | 'image' | 'testing'
type SubmissionStatus = 'pending' | 'approved' | 'denied' | 'testing'

export interface SubmissionItem {
  id: string
  photoURL?: string
  location?: Location
  floor?: number | null
  difficulty?: string | null
  photoName?: string
  status: string
  _source: SubmissionSource
  description?: string
  createdAt?: FirestoreTimestamp | string | null
  reviewedAt?: FirestoreTimestamp | string | null
}

export interface EditFormState {
  description: string
  photoName: string
  location: Location | null
  floor: number | null
  difficulty: string | null
  status: string
}

export interface AdminReviewProps {
  onBack?: () => void
}

function AdminReview({ onBack }: AdminReviewProps): React.JSX.Element {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [firestoreImages, setFirestoreImages] = useState<SubmissionItem[]>([])
  const [sampleImages, setSampleImages] = useState<SubmissionItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filter, setFilter] = useState<string>('all') // pending, approved, denied, all
  const [sourceFilter, setSourceFilter] = useState<string>('all') // all, submissions, images, testing
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null)

  // Edit mode state
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editForm, setEditForm] = useState<Partial<EditFormState>>({})
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string>('')
  const [newPhoto, setNewPhoto] = useState<File | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<SubmissionItem | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  // Fetch submissions from Firestore (real-time)
  useEffect(() => {
    const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs: SubmissionItem[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        _source: 'submission' as SubmissionSource
      } as SubmissionItem))
      setSubmissions(subs)
      setLoading(false)
    }, (error) => {
      console.error('Error fetching submissions:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Fetch images from Firestore images collection and sample/testing images
  useEffect(() => {
    async function fetchImages(): Promise<void> {
      const images = await getAllImages()
      setFirestoreImages((images as Array<{
        id: string
        url?: string
        correctLocation?: Location
        correctFloor?: number
        difficulty?: string
        description?: string
      }>).map(img => ({
        id: img.id,
        photoURL: img.url,
        location: img.correctLocation,
        floor: img.correctFloor,
        difficulty: img.difficulty || null,
        photoName: img.description || img.id,
        status: 'approved',
        _source: 'image' as SubmissionSource,
        description: img.description
      })))

      const samples = getAllSampleImages()
      setSampleImages((samples as Array<{
        id: string
        url?: string
        correctLocation?: Location
        correctFloor?: number
        description?: string
      }>).map(img => ({
        id: img.id,
        photoURL: img.url,
        location: img.correctLocation,
        floor: img.correctFloor,
        photoName: img.description || img.id,
        status: 'testing',
        _source: 'testing' as SubmissionSource,
        description: img.description
      })))
    }
    fetchImages()
  }, [])

  const handleApprove = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'approved',
        reviewedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error approving submission:', error)
    }
  }

  const handleDeny = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'denied',
        reviewedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error denying submission:', error)
    }
  }

  const handleResetToPending = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'pending',
        reviewedAt: null
      })
    } catch (error) {
      console.error('Error resetting submission:', error)
    }
  }

  // Edit mode handlers
  const handleStartEdit = (): void => {
    if (!selectedSubmission) return
    setEditForm({
      description: selectedSubmission.description || '',
      photoName: selectedSubmission.photoName || '',
      location: selectedSubmission.location ? { ...selectedSubmission.location } : { x: 0, y: 0 },
      floor: selectedSubmission.floor,
      difficulty: selectedSubmission.difficulty || null,
      status: selectedSubmission.status,
    })
    setNewPhoto(null)
    setSaveError('')
    setIsEditing(true)
  }

  const handleCancelEdit = (): void => {
    setIsEditing(false)
    setEditForm({})
    setNewPhoto(null)
    setSaveError('')
  }

  const handleCloseModal = (): void => {
    handleCancelEdit()
    setSelectedSubmission(null)
  }

  const handleSaveEdit = async (): Promise<void> => {
    // Validation
    if (!editForm.location || editForm.location.x === undefined || editForm.location.y === undefined) {
      setSaveError('Location is required')
      return
    }
    if (editForm.floor === null || editForm.floor === undefined) {
      setSaveError('Floor is required')
      return
    }

    setIsSaving(true)
    setSaveError('')

    try {
      let photoURL = selectedSubmission?.photoURL

      // If new photo was uploaded, compress it
      if (newPhoto) {
        photoURL = await compressImage(newPhoto)
      }

      if (selectedSubmission?._source === 'submission') {
        await updateDoc(doc(db, 'submissions', selectedSubmission.id), {
          description: editForm.description,
          photoName: editForm.photoName,
          location: editForm.location,
          floor: editForm.floor,
          difficulty: editForm.difficulty || null,
          status: editForm.status,
          photoURL: photoURL,
        })
        // Real-time listener will auto-update submissions state
      } else if (selectedSubmission?._source === 'image') {
        await updateDoc(doc(db, 'images', selectedSubmission.id), {
          description: editForm.description,
          correctLocation: editForm.location,
          correctFloor: editForm.floor,
          difficulty: editForm.difficulty || null,
          url: photoURL,
        })
        // Manually update firestoreImages state (no real-time listener)
        setFirestoreImages(prev => prev.map(img =>
          img.id === selectedSubmission.id
            ? {
                ...img,
                description: editForm.description,
                photoName: editForm.description || selectedSubmission.id,
                location: editForm.location!,
                floor: editForm.floor,
                difficulty: editForm.difficulty || null,
                photoURL: photoURL,
              }
            : img
        ))
      }

      setIsEditing(false)
      setSelectedSubmission(null)
    } catch (error) {
      console.error('Error saving edit:', error)
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // Delete handlers
  const handleDeleteClick = (item: SubmissionItem): void => {
    setDeleteTarget(item)
  }

  const handleCancelDelete = (): void => {
    setDeleteTarget(null)
    setIsDeleting(false)
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return

    setIsDeleting(true)
    try {
      if (deleteTarget._source === 'submission') {
        await deleteSubmission(deleteTarget.id)
      } else if (deleteTarget._source === 'image') {
        await deleteImage(deleteTarget.id)
        setFirestoreImages(prev => prev.filter(img => img.id !== deleteTarget.id))
      }

      // Close modals and clear state
      if (selectedSubmission && selectedSubmission.id === deleteTarget.id) {
        setSelectedSubmission(null)
        handleCancelEdit()
      }
      setDeleteTarget(null)
    } catch (error) {
      console.error('Error deleting photo:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  // Combine all image sources
  const allItems: SubmissionItem[] = [...submissions, ...firestoreImages, ...sampleImages]

  const filteredSubmissions = allItems.filter(item => {
    // Apply source filter
    if (sourceFilter !== 'all' && item._source !== sourceFilter) return false
    // Apply status filter (only relevant for submissions)
    if (filter === 'all') return true
    return item.status === filter
  })

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'approved': return 'badge-approved'
      case 'denied': return 'badge-denied'
      case 'testing': return 'badge-testing'
      default: return 'badge-pending'
    }
  }

  const getSourceBadgeClass = (source: string): string => {
    switch (source) {
      case 'submission': return 'source-submission'
      case 'image': return 'source-image'
      case 'testing': return 'source-testing'
      default: return ''
    }
  }

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'submission': return 'Submission'
      case 'image': return 'Game Image'
      case 'testing': return 'Testing Data'
      default: return source
    }
  }

  const formatDate = (timestamp: FirestoreTimestamp | string | null | undefined): string => {
    if (!timestamp) return 'N/A'
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? timestamp.toDate()
      : new Date(timestamp as string)
    return date.toLocaleString()
  }

  const isEditable = selectedSubmission && selectedSubmission._source !== 'testing'

  if (loading) {
    return (
      <div className="admin-review">
        <div className="loading">Loading submissions...</div>
      </div>
    )
  }

  return (
    <div className="admin-review">
      <div className="admin-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ← Back to Submission
          </button>
        )}
        <h2>Admin Review Panel</h2>
      </div>

      <div className="filter-section">
        <div className="filter-group">
          <span className="filter-label">Source:</span>
          <div className="filter-tabs">
            <button
              className={`filter-tab ${sourceFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              All ({allItems.length})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'submission' ? 'active' : ''}`}
              onClick={() => setSourceFilter('submission')}
            >
              Submissions ({submissions.length})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'image' ? 'active' : ''}`}
              onClick={() => setSourceFilter('image')}
            >
              Game Images ({firestoreImages.length})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'testing' ? 'active' : ''}`}
              onClick={() => setSourceFilter('testing')}
            >
              Testing Data ({sampleImages.length})
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Status:</span>
          <div className="filter-tabs">
            <button
              className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Pending ({allItems.filter(s => s.status === 'pending').length})
            </button>
            <button
              className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
              onClick={() => setFilter('approved')}
            >
              Approved ({allItems.filter(s => s.status === 'approved').length})
            </button>
            <button
              className={`filter-tab ${filter === 'denied' ? 'active' : ''}`}
              onClick={() => setFilter('denied')}
            >
              Denied ({allItems.filter(s => s.status === 'denied').length})
            </button>
            <button
              className={`filter-tab ${filter === 'testing' ? 'active' : ''}`}
              onClick={() => setFilter('testing')}
            >
              Testing ({allItems.filter(s => s.status === 'testing').length})
            </button>
          </div>
        </div>
      </div>

      {filteredSubmissions.length === 0 ? (
        <div className="no-submissions">
          No {filter === 'all' ? '' : filter} submissions found.
        </div>
      ) : (
        <div className="submissions-grid">
          {filteredSubmissions.map(submission => (
            <div key={submission.id} className="submission-card">
              <div className="card-image">
                <img src={submission.photoURL} alt="Submitted photo" />
                <span className={`status-badge ${getStatusBadgeClass(submission.status)}`}>
                  {submission.status}
                </span>
                <span className={`source-badge ${getSourceBadgeClass(submission._source)}`}>
                  {getSourceLabel(submission._source)}
                </span>
              </div>

              <div className="card-details">
                {submission.description && (
                  <div className="detail-row">
                    <strong>Description:</strong>
                    <span>{submission.description}</span>
                  </div>
                )}
                <div className="detail-row">
                  <strong>Location:</strong>
                  <span>X: {submission.location?.x}, Y: {submission.location?.y}</span>
                </div>
                <div className="detail-row">
                  <strong>Floor:</strong>
                  <span>{submission.floor}</span>
                </div>
                <div className="detail-row">
                  <strong>Difficulty:</strong>
                  <span className={`difficulty-badge difficulty-badge-${submission.difficulty || 'none'}`}>
                    {submission.difficulty ? submission.difficulty.charAt(0).toUpperCase() + submission.difficulty.slice(1) : 'Not set'}
                  </span>
                </div>
                {submission.createdAt && (
                  <div className="detail-row">
                    <strong>Submitted:</strong>
                    <span>{formatDate(submission.createdAt)}</span>
                  </div>
                )}
                {submission.reviewedAt && (
                  <div className="detail-row">
                    <strong>Reviewed:</strong>
                    <span>{formatDate(submission.reviewedAt)}</span>
                  </div>
                )}
              </div>

              {submission._source === 'submission' && submission.status === 'pending' && (
                <div className="card-actions">
                  <button
                    className="approve-button"
                    onClick={() => handleApprove(submission.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="deny-button"
                    onClick={() => handleDeny(submission.id)}
                  >
                    Deny
                  </button>
                </div>
              )}

              {submission.status !== 'pending' && (
                <div className="card-actions">
                  <button
                    className="reset-button"
                    onClick={() => handleResetToPending(submission.id)}
                  >
                    Reset to Pending
                  </button>
                </div>
              )}

              {submission._source !== 'testing' && (
                <div className="card-actions">
                  <button
                    className="delete-photo-button"
                    onClick={() => handleDeleteClick(submission)}
                  >
                    Delete
                  </button>
                </div>
              )}

              <button
                className="view-details-button"
                onClick={() => setSelectedSubmission(submission)}
              >
                View Full Details
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && createPortal(
        <div className="delete-confirm-overlay" onClick={handleCancelDelete}>
          <div className="delete-confirm-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <img
              src={deleteTarget.photoURL}
              alt="Photo to delete"
              className="delete-confirm-image"
            />
            <div className="delete-confirm-body">
              <h3 className="delete-confirm-title">Delete Photo</h3>
              <p className="delete-confirm-message">
                Are you sure you want to permanently delete this photo? This action cannot be undone.
              </p>
              <div className="delete-confirm-actions">
                <button
                  className="delete-confirm-button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  className="delete-cancel-button"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedSubmission && createPortal(
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <button className="modal-close" onClick={handleCloseModal}>
              ×
            </button>

            {/* Image display / replacement */}
            {isEditing ? (
              <div className="edit-photo-section">
                <img
                  src={newPhoto ? URL.createObjectURL(newPhoto) : selectedSubmission.photoURL}
                  alt="Current"
                  className="modal-image"
                />
                <div className="replace-photo-controls">
                  <PhotoUpload onPhotoSelect={setNewPhoto} selectedPhoto={newPhoto} />
                </div>
              </div>
            ) : (
              <img src={selectedSubmission.photoURL} alt="Full size" className="modal-image" />
            )}

            <div className="modal-details">
              {isEditing ? (
                /* Edit mode form */
                <div className="edit-form">
                  <div className="modal-details-header">
                    <h3>Edit Image</h3>
                  </div>

                  {saveError && <div className="edit-error">{saveError}</div>}

                  {/* Description */}
                  <div className="edit-field">
                    <label htmlFor="edit-description">Description</label>
                    <input
                      id="edit-description"
                      type="text"
                      value={editForm.description || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  {/* Photo Name (submissions only) */}
                  {selectedSubmission._source === 'submission' && (
                    <div className="edit-field">
                      <label htmlFor="edit-photoname">File Name</label>
                      <input
                        id="edit-photoname"
                        type="text"
                        value={editForm.photoName || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, photoName: e.target.value }))}
                      />
                    </div>
                  )}

                  {/* Status (submissions only) */}
                  {selectedSubmission._source === 'submission' && (
                    <div className="edit-field">
                      <label htmlFor="edit-status">Status</label>
                      <select
                        id="edit-status"
                        value={editForm.status || ''}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="denied">Denied</option>
                      </select>
                    </div>
                  )}

                  {/* Location via MapPicker */}
                  <div className="edit-field">
                    <label>Location</label>
                    <MapPicker
                      markerPosition={editForm.location ?? null}
                      onMapClick={(coords: Location) => setEditForm(prev => ({ ...prev, location: coords }))}
                    />
                    <div className="coordinate-inputs">
                      <label>
                        X:
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editForm.location?.x ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({
                            ...prev,
                            location: { ...(prev.location || { x: 0, y: 0 }), x: parseFloat(e.target.value) || 0 }
                          }))}
                        />
                      </label>
                      <label>
                        Y:
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editForm.location?.y ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({
                            ...prev,
                            location: { ...(prev.location || { x: 0, y: 0 }), y: parseFloat(e.target.value) || 0 }
                          }))}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Floor via FloorSelector */}
                  <div className="edit-field">
                    <FloorSelector
                      selectedFloor={editForm.floor ?? null}
                      onFloorSelect={(f: number) => setEditForm(prev => ({ ...prev, floor: f }))}
                    />
                  </div>

                  {/* Difficulty */}
                  <div className="edit-field">
                    <label htmlFor="edit-difficulty">Difficulty</label>
                    <select
                      id="edit-difficulty"
                      value={editForm.difficulty || ''}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm(prev => ({ ...prev, difficulty: e.target.value || null }))}
                    >
                      <option value="">Not set</option>
                      {DIFFICULTY_OPTIONS.map(d => (
                        <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Save / Cancel buttons */}
                  <div className="edit-actions">
                    <button
                      className="save-button"
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      className="cancel-edit-button"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Read-only view mode */
                <>
                  <div className="modal-details-header">
                    <h3>Image Details</h3>
                    <div className="modal-header-actions">
                      {isEditable && (
                        <button className="edit-button" onClick={handleStartEdit}>
                          Edit
                        </button>
                      )}
                      {isEditable && (
                        <button className="delete-photo-button" onClick={() => handleDeleteClick(selectedSubmission)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="detail-badges-row">
                    <span className={`detail-badge ${getSourceBadgeClass(selectedSubmission._source)}`}>
                      {getSourceLabel(selectedSubmission._source)}
                    </span>
                    <span className={`detail-badge ${getStatusBadgeClass(selectedSubmission.status)}`}>
                      {selectedSubmission.status}
                    </span>
                    <span className={`detail-badge difficulty-badge difficulty-badge-${selectedSubmission.difficulty || 'none'}`}>
                      {selectedSubmission.difficulty ? selectedSubmission.difficulty.charAt(0).toUpperCase() + selectedSubmission.difficulty.slice(1) : 'No difficulty'}
                    </span>
                  </div>

                  {/* Description card */}
                  {selectedSubmission.description && (
                    <div className="detail-card">
                      <div className="detail-card-label">Description</div>
                      <div className="detail-card-value detail-description">{selectedSubmission.description}</div>
                    </div>
                  )}

                  {/* Info grid */}
                  <div className="detail-info-grid">
                    <div className="detail-info-item">
                      <span className="detail-info-icon">📍</span>
                      <div className="detail-info-content">
                        <span className="detail-info-label">Coordinates</span>
                        <span className="detail-info-value">
                          X: {selectedSubmission.location?.x !== undefined ? Number(selectedSubmission.location.x).toFixed(1) : '\u2014'},
                          Y: {selectedSubmission.location?.y !== undefined ? Number(selectedSubmission.location.y).toFixed(1) : '\u2014'}
                        </span>
                      </div>
                    </div>
                    <div className="detail-info-item">
                      <span className="detail-info-icon">🏢</span>
                      <div className="detail-info-content">
                        <span className="detail-info-label">Floor</span>
                        <span className="detail-info-value">
                          {selectedSubmission.floor ? `Floor ${selectedSubmission.floor}` : '\u2014'}
                        </span>
                      </div>
                    </div>
                    {selectedSubmission.photoName && (
                      <div className="detail-info-item">
                        <span className="detail-info-icon">📄</span>
                        <div className="detail-info-content">
                          <span className="detail-info-label">File Name</span>
                          <span className="detail-info-value">{selectedSubmission.photoName}</span>
                        </div>
                      </div>
                    )}
                    <div className="detail-info-item">
                      <span className="detail-info-icon">🆔</span>
                      <div className="detail-info-content">
                        <span className="detail-info-label">ID</span>
                        <span className="detail-info-value detail-id-value">{selectedSubmission.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Location map */}
                  {selectedSubmission.location && (
                    <div className="detail-card detail-map-card">
                      <div className="detail-card-label">Location on Map</div>
                      <div className="detail-map-wrapper">
                        <MapPicker
                          markerPosition={selectedSubmission.location}
                          onMapClick={() => {}}
                        />
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  {(selectedSubmission.createdAt || selectedSubmission.reviewedAt) && (
                    <div className="detail-timestamps">
                      {selectedSubmission.createdAt && (
                        <div className="detail-timestamp-item">
                          <span className="detail-timestamp-icon">📅</span>
                          <div>
                            <span className="detail-timestamp-label">Submitted</span>
                            <span className="detail-timestamp-value">{formatDate(selectedSubmission.createdAt)}</span>
                          </div>
                        </div>
                      )}
                      {selectedSubmission.reviewedAt && (
                        <div className="detail-timestamp-item">
                          <span className="detail-timestamp-icon">✅</span>
                          <div>
                            <span className="detail-timestamp-label">Reviewed</span>
                            <span className="detail-timestamp-value">{formatDate(selectedSubmission.reviewedAt)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  {selectedSubmission._source === 'submission' && selectedSubmission.status === 'pending' && (
                    <div className="modal-actions">
                      <button
                        className="approve-button"
                        onClick={() => {
                          handleApprove(selectedSubmission.id)
                          setSelectedSubmission(null)
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="deny-button"
                        onClick={() => {
                          handleDeny(selectedSubmission.id)
                          setSelectedSubmission(null)
                        }}
                      >
                        Deny
                      </button>
                    </div>
                  )}

                  {selectedSubmission.status !== 'pending' && (
                    <div className="modal-actions">
                      <button
                        className="reset-button"
                        onClick={() => {
                          handleResetToPending(selectedSubmission.id)
                          setSelectedSubmission(null)
                        }}
                      >
                        Reset to Pending
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default AdminReview
