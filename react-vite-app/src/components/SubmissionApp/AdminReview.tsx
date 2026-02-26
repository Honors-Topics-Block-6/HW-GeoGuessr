import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { getAllImages, deleteSubmission, deleteImage } from '../../services/imageService'
import MapPicker from '../MapPicker/MapPicker'
import { getPlayingArea, isPointInPlayingArea, type PlayingArea } from '../../services/regionService'
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

type SubmissionSource = 'submission' | 'image'
type SubmissionStatus = 'pending' | 'approved' | 'denied'

export interface SubmissionItem {
  id: string
  photoURL?: string
  location?: Location
  floor?: number | null
  difficulty?: string | null
  photoName?: string
  buildingName?: string | null
  status: string
  _source: SubmissionSource
  description?: string
  createdAt?: FirestoreTimestamp | string | null
  reviewedAt?: FirestoreTimestamp | string | null
}

export interface EditFormState {
  description: string
  photoName: string
  buildingName: string
  location: Location | null
  floor: number | null
  difficulty: string | null
  status: string
}

export interface AdminReviewProps {
  onBack?: () => void
}

function AdminReview({ onBack: _onBack }: AdminReviewProps): React.JSX.Element {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [firestoreImages, setFirestoreImages] = useState<SubmissionItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filter, setFilter] = useState<string>('pending') // pending, approved, denied, all
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null)

  // Edit mode state
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editForm, setEditForm] = useState<Partial<EditFormState>>({})
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string>('')
  const [playingArea, setPlayingArea] = useState<PlayingArea | null>(null)
  const [clickRejected, setClickRejected] = useState<boolean>(false)

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

  // Fetch images from Firestore images collection
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
    }
    fetchImages()
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadPlayingArea(): Promise<void> {
      const area = await getPlayingArea()
      if (isMounted) {
        setPlayingArea(area)
      }
    }

    loadPlayingArea()

    return () => {
      isMounted = false
    }
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
      buildingName: selectedSubmission.buildingName || '',
      location: selectedSubmission.location ? { ...selectedSubmission.location } : { x: 0, y: 0 },
      floor: selectedSubmission.floor,
      difficulty: selectedSubmission.difficulty || null,
      status: selectedSubmission.status,
    })
    setSaveError('')
    setIsEditing(true)
  }

  const handleCancelEdit = (): void => {
    setIsEditing(false)
    setEditForm({})
    setSaveError('')
    setClickRejected(false)
  }

  const handleCloseModal = (): void => {
    handleCancelEdit()
    setSelectedSubmission(null)
  }

  useEffect(() => {
    if (!selectedSubmission) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleCloseModal()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedSubmission])

  useEffect(() => {
    const isAnyModalOpen = Boolean(selectedSubmission || deleteTarget)
    if (!isAnyModalOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [selectedSubmission, deleteTarget])

  const handleModalMapClick = (coords: Location): void => {
    if (!isEditing) return

    if (!isPointInPlayingArea(coords, playingArea)) {
      setClickRejected(true)
      window.setTimeout(() => setClickRejected(false), 350)
      return
    }

    setClickRejected(false)
    setEditForm(prev => ({ ...prev, location: coords }))
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!selectedSubmission) return

    // Validation
    if (!editForm.location || editForm.location.x === undefined || editForm.location.y === undefined) {
      setSaveError('Location is required')
      return
    }
    if (editForm.floor === null || editForm.floor === undefined) {
      setSaveError('Floor is required')
      return
    }

    const changedFields: string[] = []
    const normalizedBuildingName = (editForm.buildingName || '').trim() || null
    const originalBuildingName = selectedSubmission.buildingName || null
    if (normalizedBuildingName !== originalBuildingName) changedFields.push('Building Name')
    if ((editForm.description || '') !== (selectedSubmission.description || '')) changedFields.push('Description')
    if (selectedSubmission._source === 'submission' && (editForm.photoName || '') !== (selectedSubmission.photoName || '')) {
      changedFields.push('File Name')
    }
    if ((editForm.difficulty || null) !== (selectedSubmission.difficulty || null)) changedFields.push('Difficulty')
    if ((editForm.floor ?? null) !== (selectedSubmission.floor ?? null)) changedFields.push('Floor')
    if (selectedSubmission._source === 'submission' && (editForm.status || selectedSubmission.status) !== selectedSubmission.status) {
      changedFields.push('Status')
    }

    const originalX = selectedSubmission.location?.x ?? null
    const originalY = selectedSubmission.location?.y ?? null
    const nextX = editForm.location.x
    const nextY = editForm.location.y
    if (originalX === null || originalY === null || Math.abs(originalX - nextX) > 0.0001 || Math.abs(originalY - nextY) > 0.0001) {
      changedFields.push('Location Coordinates')
    }

    if (changedFields.length === 0) {
      setSaveError('No changes to save.')
      return
    }

    const shouldSave = window.confirm(`Save these changes?\n- ${changedFields.join('\n- ')}`)
    if (!shouldSave) return

    setIsSaving(true)
    setSaveError('')

    try {
      if (selectedSubmission._source === 'submission') {
        await updateDoc(doc(db, 'submissions', selectedSubmission.id), {
          description: editForm.description,
          photoName: editForm.photoName,
          buildingName: normalizedBuildingName,
          location: editForm.location,
          floor: editForm.floor,
          difficulty: editForm.difficulty || null,
          status: editForm.status,
        })
        // Real-time listener will auto-update submissions state
      } else if (selectedSubmission._source === 'image') {
        await updateDoc(doc(db, 'images', selectedSubmission.id), {
          description: editForm.description,
          correctLocation: editForm.location,
          correctFloor: editForm.floor,
          difficulty: editForm.difficulty || null,
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
              }
            : img
        ))
      }

      setIsEditing(false)
      setSelectedSubmission(null)
      window.alert(`Saved changes:\n- ${changedFields.join('\n- ')}`)
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

  // Combine all reviewable sources
  const allItems: SubmissionItem[] = [...submissions, ...firestoreImages]

  const filteredSubmissions = allItems.filter(item => {
    // Apply status filter
    if (filter === 'all') return true
    return item.status === filter
  })

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'approved': return 'badge-approved'
      case 'denied': return 'badge-denied'
      default: return 'badge-pending'
    }
  }

  const formatDate = (timestamp: FirestoreTimestamp | string | null | undefined): string => {
    if (!timestamp) return 'N/A'
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? timestamp.toDate()
      : new Date(timestamp as string)
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="admin-review">
        <div className="loading">Loading submissions...</div>
      </div>
    )
  }

  return (
    <div className="admin-review">
      <div className="filter-section">
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
          </div>
        </div>
      </div>

      {filteredSubmissions.length === 0 ? (
        <div className={`no-submissions ${filter === 'pending' ? 'pending-empty' : ''}`}>
          {filter === 'pending' ? 'No pending submissions!' : `No ${filter === 'all' ? '' : `${filter} `}submissions found.`}
        </div>
      ) : (
        <div className="submissions-grid">
          {filteredSubmissions.map(submission => (
            <div key={submission.id} className="submission-card">
              <div
                className="card-image"
                onClick={() => setSelectedSubmission(submission)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedSubmission(submission)
                  }
                }}
              >
                <img src={submission.photoURL} alt="Submitted photo" />
                <span className={`status-badge ${getStatusBadgeClass(submission.status)}`}>
                  {submission.status}
                </span>
                <span className="image-click-hint">Click image for details</span>
              </div>

              <div className="card-details">
                {submission.description && (
                  <div className="detail-row">
                    <strong>Description:</strong>
                    <span>{submission.description}</span>
                  </div>
                )}
                <div className="detail-row detail-row-meta">
                  <span className={`difficulty-badge difficulty-badge-${submission.difficulty || 'none'}`}>
                    {submission.difficulty ? submission.difficulty.charAt(0).toUpperCase() + submission.difficulty.slice(1) : 'Not set'}
                  </span>
                  {submission.createdAt && (
                    <span className="submitted-inline">Submitted: {formatDate(submission.createdAt)}</span>
                  )}
                </div>
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

              <div className="card-actions">
                <button
                  className="delete-photo-button"
                  onClick={() => handleDeleteClick(submission)}
                >
                  Delete
                </button>
              </div>
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
          <div className="modal-shell" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <>
              <div className="modal-side-actions-left">
                {isEditing ? (
                  <>
                    <button className="save-button" onClick={handleSaveEdit} disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="cancel-edit-button" onClick={handleCancelEdit} disabled={isSaving}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="edit-button" onClick={handleStartEdit}>Edit</button>
                    <button className="delete-photo-button" onClick={() => handleDeleteClick(selectedSubmission)}>Delete</button>
                  </>
                )}
              </div>
            </>

            <div className="modal-content">
              <div className="modal-details">
                {saveError && <div className="edit-error">{saveError}</div>}

                <div
                  className={`detail-split-layout${selectedSubmission.status === 'pending' ? ' pending-layout' : ''}${selectedSubmission.status === 'approved' ? ' approved-layout' : ''}`}
                >
                  <div className="detail-main-column">
                    <div className="detail-photo-card">
                      <img src={selectedSubmission.photoURL} alt="Full size" className="modal-image modal-image-inline" />
                    </div>

                    <div className="detail-card detail-combined-card">
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">🎯 Difficulty</span>
                        {isEditing ? (
                          <select
                            className="detail-inline-select"
                            value={editForm.difficulty || ''}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm(prev => ({ ...prev, difficulty: e.target.value || null }))}
                          >
                            <option value="">No difficulty</option>
                            {DIFFICULTY_OPTIONS.map(d => (
                              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="detail-combined-value">
                            {selectedSubmission.difficulty ? selectedSubmission.difficulty.charAt(0).toUpperCase() + selectedSubmission.difficulty.slice(1) : 'No difficulty'}
                          </span>
                        )}
                      </div>
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">🏫 Building</span>
                        {isEditing ? (
                          <input
                            className="detail-inline-input"
                            type="text"
                            value={editForm.buildingName || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, buildingName: e.target.value }))}
                          />
                        ) : (
                          <span className="detail-combined-value">{selectedSubmission.buildingName || '\u2014'}</span>
                        )}
                      </div>
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">📍 Location</span>
                        {isEditing ? (
                          <div className="detail-coordinates-edit">
                            <input
                              className="detail-inline-input detail-inline-number"
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
                            <input
                              className="detail-inline-input detail-inline-number"
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
                          </div>
                        ) : (
                          <span className="detail-combined-value">
                            X: {selectedSubmission.location?.x !== undefined ? Number(selectedSubmission.location.x).toFixed(1) : '\u2014'},
                            Y: {selectedSubmission.location?.y !== undefined ? Number(selectedSubmission.location.y).toFixed(1) : '\u2014'}
                          </span>
                        )}
                      </div>
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">🏢 Floor</span>
                        {isEditing ? (
                          <input
                            className="detail-inline-input detail-inline-number"
                            type="number"
                            min="1"
                            step="1"
                            value={editForm.floor ?? ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const value = e.target.value
                              setEditForm(prev => ({ ...prev, floor: value === '' ? null : parseInt(value, 10) }))
                            }}
                          />
                        ) : (
                          <span className="detail-combined-value">{selectedSubmission.floor ? `Floor ${selectedSubmission.floor}` : '\u2014'}</span>
                        )}
                      </div>
                      {(isEditing || selectedSubmission.description) && (
                        <div className="detail-combined-row detail-combined-row-top">
                          <span className="detail-combined-key">📝 Description</span>
                          {isEditing ? (
                            <textarea
                              className="detail-inline-textarea"
                              value={editForm.description || ''}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            />
                          ) : (
                            <span className="detail-combined-value detail-description">{selectedSubmission.description}</span>
                          )}
                        </div>
                      )}
                      {selectedSubmission._source === 'submission' && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">📄 File</span>
                          {isEditing ? (
                            <input
                              className="detail-inline-input"
                              type="text"
                              value={editForm.photoName || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, photoName: e.target.value }))}
                            />
                          ) : (
                            <span className="detail-combined-value">{selectedSubmission.photoName || '\u2014'}</span>
                          )}
                        </div>
                      )}
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">🆔 ID</span>
                        <span className="detail-combined-value detail-id-value">{selectedSubmission.id}</span>
                      </div>
                      {selectedSubmission.createdAt && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">📅 Submitted</span>
                          <span className="detail-combined-value">{formatDate(selectedSubmission.createdAt)}</span>
                        </div>
                      )}
                      {selectedSubmission.reviewedAt && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">✅ Reviewed</span>
                          <span className="detail-combined-value">{formatDate(selectedSubmission.reviewedAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="detail-map-column">
                    <div className="detail-map-wrapper">
                      <MapPicker
                        markerPosition={isEditing ? (editForm.location ?? null) : (selectedSubmission.location ?? null)}
                        onMapClick={isEditing ? handleModalMapClick : () => {}}
                        clickRejected={clickRejected}
                        playingArea={isEditing ? playingArea : null}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {!isEditing && selectedSubmission._source === 'submission' && selectedSubmission.status === 'pending' && (
              <div className="modal-bottom-actions">
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
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default AdminReview
