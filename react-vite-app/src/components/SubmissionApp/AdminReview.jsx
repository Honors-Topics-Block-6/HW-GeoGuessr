import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { getAllImages, getAllSampleImages } from '../../services/imageService'
import MapPicker from '../MapPicker/MapPicker'
import FloorSelector from '../FloorSelector/FloorSelector'
import PhotoUpload from './PhotoUpload'
import { compressImage } from '../../utils/compressImage'
import './AdminReview.css'

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard']

function AdminReview({ onBack }) {
  const [submissions, setSubmissions] = useState([])
  const [firestoreImages, setFirestoreImages] = useState([])
  const [sampleImages, setSampleImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // pending, approved, denied, all
  const [sourceFilter, setSourceFilter] = useState('all') // all, submissions, images, testing
  const [selectedSubmission, setSelectedSubmission] = useState(null)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [newPhoto, setNewPhoto] = useState(null)

  // Fetch submissions from Firestore (real-time)
  useEffect(() => {
    const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        _source: 'submission'
      }))
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
    async function fetchImages() {
      const images = await getAllImages()
      setFirestoreImages(images.map(img => ({
        id: img.id,
        photoURL: img.url,
        location: img.correctLocation,
        floor: img.correctFloor,
        difficulty: img.difficulty || null,
        photoName: img.description || img.id,
        status: 'approved',
        _source: 'image',
        description: img.description
      })))

      const samples = getAllSampleImages()
      setSampleImages(samples.map(img => ({
        id: img.id,
        photoURL: img.url,
        location: img.correctLocation,
        floor: img.correctFloor,
        photoName: img.description || img.id,
        status: 'testing',
        _source: 'testing',
        description: img.description
      })))
    }
    fetchImages()
  }, [])

  const handleApprove = async (submissionId) => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'approved',
        reviewedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error approving submission:', error)
    }
  }

  const handleDeny = async (submissionId) => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'denied',
        reviewedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error denying submission:', error)
    }
  }

  const handleResetToPending = async (submissionId) => {
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
  const handleStartEdit = () => {
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

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditForm({})
    setNewPhoto(null)
    setSaveError('')
  }

  const handleCloseModal = () => {
    handleCancelEdit()
    setSelectedSubmission(null)
  }

  const handleSaveEdit = async () => {
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
      let photoURL = selectedSubmission.photoURL

      // If new photo was uploaded, compress it
      if (newPhoto) {
        photoURL = await compressImage(newPhoto)
      }

      if (selectedSubmission._source === 'submission') {
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
      } else if (selectedSubmission._source === 'image') {
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
                location: editForm.location,
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

  // Combine all image sources
  const allItems = [...submissions, ...firestoreImages, ...sampleImages]

  const filteredSubmissions = allItems.filter(item => {
    // Apply source filter
    if (sourceFilter !== 'all' && item._source !== sourceFilter) return false
    // Apply status filter (only relevant for submissions)
    if (filter === 'all') return true
    return item.status === filter
  })

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'approved': return 'badge-approved'
      case 'denied': return 'badge-denied'
      case 'testing': return 'badge-testing'
      default: return 'badge-pending'
    }
  }

  const getSourceBadgeClass = (source) => {
    switch (source) {
      case 'submission': return 'source-submission'
      case 'image': return 'source-image'
      case 'testing': return 'source-testing'
      default: return ''
    }
  }

  const getSourceLabel = (source) => {
    switch (source) {
      case 'submission': return 'Submission'
      case 'image': return 'Game Image'
      case 'testing': return 'Testing Data'
      default: return source
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
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
        <button className="back-button" onClick={onBack}>
          ← Back to Submission
        </button>
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

      {selectedSubmission && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
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
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  {/* Photo Name (submissions only) */}
                  {selectedSubmission._source === 'submission' && (
                    <div className="edit-field">
                      <label htmlFor="edit-photoname">File Name</label>
                      <input
                        id="edit-photoname"
                        type="text"
                        value={editForm.photoName}
                        onChange={e => setEditForm(prev => ({ ...prev, photoName: e.target.value }))}
                      />
                    </div>
                  )}

                  {/* Status (submissions only) */}
                  {selectedSubmission._source === 'submission' && (
                    <div className="edit-field">
                      <label htmlFor="edit-status">Status</label>
                      <select
                        id="edit-status"
                        value={editForm.status}
                        onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
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
                      markerPosition={editForm.location}
                      onMapClick={(coords) => setEditForm(prev => ({ ...prev, location: coords }))}
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
                          onChange={e => setEditForm(prev => ({
                            ...prev,
                            location: { ...prev.location, x: parseFloat(e.target.value) || 0 }
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
                          onChange={e => setEditForm(prev => ({
                            ...prev,
                            location: { ...prev.location, y: parseFloat(e.target.value) || 0 }
                          }))}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Floor via FloorSelector */}
                  <div className="edit-field">
                    <FloorSelector
                      selectedFloor={editForm.floor}
                      onFloorSelect={(f) => setEditForm(prev => ({ ...prev, floor: f }))}
                    />
                  </div>

                  {/* Difficulty */}
                  <div className="edit-field">
                    <label htmlFor="edit-difficulty">Difficulty</label>
                    <select
                      id="edit-difficulty"
                      value={editForm.difficulty || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, difficulty: e.target.value || null }))}
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
                    {isEditable && (
                      <button className="edit-button" onClick={handleStartEdit}>
                        Edit
                      </button>
                    )}
                  </div>
                  <p><strong>Source:</strong> <span className={getSourceBadgeClass(selectedSubmission._source)}>{getSourceLabel(selectedSubmission._source)}</span></p>
                  <p><strong>Status:</strong> <span className={getStatusBadgeClass(selectedSubmission.status)}>{selectedSubmission.status}</span></p>
                  {selectedSubmission.description && (
                    <p><strong>Description:</strong> {selectedSubmission.description}</p>
                  )}
                  <p><strong>Location:</strong> X: {selectedSubmission.location?.x}, Y: {selectedSubmission.location?.y}</p>
                  <p><strong>Floor:</strong> {selectedSubmission.floor}</p>
                  <p>
                    <strong>Difficulty:</strong>{' '}
                    <span className={`difficulty-badge difficulty-badge-${selectedSubmission.difficulty || 'none'}`}>
                      {selectedSubmission.difficulty ? selectedSubmission.difficulty.charAt(0).toUpperCase() + selectedSubmission.difficulty.slice(1) : 'Not set'}
                    </span>
                  </p>
                  <p><strong>File Name:</strong> {selectedSubmission.photoName}</p>
                  {selectedSubmission.createdAt && (
                    <p><strong>Submitted:</strong> {formatDate(selectedSubmission.createdAt)}</p>
                  )}
                  {selectedSubmission.reviewedAt && (
                    <p><strong>Reviewed:</strong> {formatDate(selectedSubmission.reviewedAt)}</p>
                  )}

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
        </div>
      )}
    </div>
  )
}

export default AdminReview
