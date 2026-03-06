import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { collection, query, orderBy, doc, updateDoc, serverTimestamp, getDocs, where, getCountFromServer, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../../firebase'
import { getAllImages, getAllSampleImages, deleteSubmission, deleteImage } from '../../services/imageService'
import {
  backfillImagePool,
  type BackfillImagePoolResult,
  buildImagePoolEntryFromImageDoc,
  buildImagePoolEntryFromSubmissionDoc,
  removeImagePoolEntry,
  upsertImagePoolEntry
} from '../../services/imagePoolService'
import MapPicker from '../MapPicker/MapPicker'
import { compressImage } from '../../utils/compressImage'
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

type ToastType = 'info' | 'success' | 'error'

interface ToastNotification {
  id: number
  message: string
  type: ToastType
}

interface StatusCounts {
  all: number
  pending: number
  approved: number
  denied: number
}

function AdminReview({ onBack }: AdminReviewProps): React.JSX.Element {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [firestoreImages, setFirestoreImages] = useState<SubmissionItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filter, setFilter] = useState<string>('pending') // pending, approved, denied, all
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [buildingFilter, setBuildingFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null)
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    all: 0,
    pending: 0,
    approved: 0,
    denied: 0
  })

  // Edit mode state
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editForm, setEditForm] = useState<Partial<EditFormState>>({})
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string>('')
  const [newPhoto, setNewPhoto] = useState<File | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<SubmissionItem | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [notifications, setNotifications] = useState<ToastNotification[]>([])
  const [playingArea, setPlayingArea] = useState<PlayingArea | null>(null)
  const [clickRejected, setClickRejected] = useState<boolean>(false)

  const BACKFILL_IMAGE_CURSOR_KEY = 'admin.imagePool.backfill.imageCursor.v1'
  const BACKFILL_SUBMISSION_CURSOR_KEY = 'admin.imagePool.backfill.submissionCursor.v1'

  const mapSubmissionDoc = (docSnap: QueryDocumentSnapshot<DocumentData>): SubmissionItem => {
    const data = docSnap.data() as SubmissionItem & { building?: string | null }
    const normalizedBuilding = (data.building || data.buildingName || '').trim() || null
    return {
      ...data,
      id: docSnap.id,
      buildingName: normalizedBuilding,
      _source: 'submission' as SubmissionSource
    } as SubmissionItem
  }

  const refreshStatusCounts = useCallback(async (): Promise<void> => {
    try {
      const baseRef = collection(db, 'submissions')
      const [allSnap, pendingSnap, approvedSnap, deniedSnap] = await Promise.all([
        getCountFromServer(query(baseRef)),
        getCountFromServer(query(baseRef, where('status', '==', 'pending'))),
        getCountFromServer(query(baseRef, where('status', '==', 'approved'))),
        getCountFromServer(query(baseRef, where('status', '==', 'denied')))
      ])
      setStatusCounts({
        all: allSnap.data().count,
        pending: pendingSnap.data().count,
        approved: approvedSnap.data().count,
        denied: deniedSnap.data().count
      })
    } catch (error) {
      console.error('Error fetching status counts:', error)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function fetchAllSubmissions(): Promise<void> {
      try {
        const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'))
        const snapshot = await getDocs(q)
        if (cancelled) return
        setSubmissions(snapshot.docs.map(mapSubmissionDoc))
      } catch (error) {
        console.error('Error fetching submissions:', error)
        pushNotification('Failed to load submissions', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchAllSubmissions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void refreshStatusCounts()
  }, [refreshStatusCounts])

  // Fetch images from Firestore images collection
  useEffect(() => {
    let cancelled = false
    async function runBackfillPasses(): Promise<void> {
      let imageCursor = window.localStorage.getItem(BACKFILL_IMAGE_CURSOR_KEY)
      let submissionCursor = window.localStorage.getItem(BACKFILL_SUBMISSION_CURSOR_KEY)

      // Run a few paced passes per mount to avoid backend throttling.
      for (let pass = 0; pass < 4; pass += 1) {
        if (cancelled) return
        const result: BackfillImagePoolResult = await backfillImagePool({
          imageCursor,
          submissionCursor,
          maxDocsPerSource: 20,
          commitChunkSize: 10,
          maxRetriesPerChunk: 5
        })

        imageCursor = result.nextImageCursor
        submissionCursor = result.nextSubmissionCursor

        if (imageCursor) {
          window.localStorage.setItem(BACKFILL_IMAGE_CURSOR_KEY, imageCursor)
        } else {
          window.localStorage.removeItem(BACKFILL_IMAGE_CURSOR_KEY)
        }
        if (submissionCursor) {
          window.localStorage.setItem(BACKFILL_SUBMISSION_CURSOR_KEY, submissionCursor)
        } else {
          window.localStorage.removeItem(BACKFILL_SUBMISSION_CURSOR_KEY)
        }

        if (result.done) {
          window.localStorage.removeItem(BACKFILL_IMAGE_CURSOR_KEY)
          window.localStorage.removeItem(BACKFILL_SUBMISSION_CURSOR_KEY)
          break
        }
      }
    }

    void runBackfillPasses().catch((error) => {
      console.error('Error backfilling imagePool:', error)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function runBackfillPasses(): Promise<void> {
      let imageCursor = window.localStorage.getItem(BACKFILL_IMAGE_CURSOR_KEY)
      let submissionCursor = window.localStorage.getItem(BACKFILL_SUBMISSION_CURSOR_KEY)

      // Run a few paced passes per mount to avoid backend throttling.
      for (let pass = 0; pass < 4; pass += 1) {
        if (cancelled) return
        const result: BackfillImagePoolResult = await backfillImagePool({
          imageCursor,
          submissionCursor,
          maxDocsPerSource: 20,
          commitChunkSize: 10,
          maxRetriesPerChunk: 5
        })

        imageCursor = result.nextImageCursor
        submissionCursor = result.nextSubmissionCursor

        if (imageCursor) {
          window.localStorage.setItem(BACKFILL_IMAGE_CURSOR_KEY, imageCursor)
        } else {
          window.localStorage.removeItem(BACKFILL_IMAGE_CURSOR_KEY)
        }
        if (submissionCursor) {
          window.localStorage.setItem(BACKFILL_SUBMISSION_CURSOR_KEY, submissionCursor)
        } else {
          window.localStorage.removeItem(BACKFILL_SUBMISSION_CURSOR_KEY)
        }

        if (result.done) {
          window.localStorage.removeItem(BACKFILL_IMAGE_CURSOR_KEY)
          window.localStorage.removeItem(BACKFILL_SUBMISSION_CURSOR_KEY)
          break
        }
      }
    }

    void runBackfillPasses().catch((error) => {
      console.error('Error backfilling imagePool:', error)
    })

    return () => {
      cancelled = true
    }
  }, [])

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
    async function fetchPlayingArea(): Promise<void> {
      const area = await getPlayingArea()
      setPlayingArea(area)
    }
    fetchPlayingArea()
  }, [])

  useEffect(() => {
    if (selectedSubmission || deleteTarget) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedSubmission, deleteTarget])

  const pushNotification = (message: string, type: ToastType = 'info'): void => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setNotifications(prev => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setNotifications(prev => prev.filter(notification => notification.id !== id))
    }, 2800)
  }

  const handleApprove = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'approved',
        reviewedAt: serverTimestamp()
      })
      void refreshStatusCounts()
      setSubmissions(prev => prev.map(item => (
        item.id === submissionId ? { ...item, status: 'approved', reviewedAt: new Date().toISOString() } : item
      )))
      const target = submissions.find((item) => item.id === submissionId)
      if (target) {
        const poolEntry = buildImagePoolEntryFromSubmissionDoc(submissionId, {
          photoURL: target.photoURL,
          difficulty: target.difficulty,
          location: target.location,
          floor: target.floor,
          buildingName: target.buildingName,
          description: target.description
        })
        if (poolEntry) {
          await upsertImagePoolEntry(poolEntry)
        }
      }
    } catch (error) {
      console.error('Error approving submission:', error)
      pushNotification('Approve failed', 'error')
    }
  }

  const handleDeny = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'denied',
        reviewedAt: serverTimestamp()
      })
      void refreshStatusCounts()
      setSubmissions(prev => prev.map(item => (
        item.id === submissionId ? { ...item, status: 'denied', reviewedAt: new Date().toISOString() } : item
      )))
      await removeImagePoolEntry('submission', submissionId)
    } catch (error) {
      console.error('Error denying submission:', error)
      pushNotification('Deny failed', 'error')
    }
  }

  const handleResetToPending = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'pending',
        reviewedAt: null
      })
      void refreshStatusCounts()
      setSubmissions(prev => prev.map(item => (
        item.id === submissionId ? { ...item, status: 'pending', reviewedAt: null } : item
      )))
      await removeImagePoolEntry('submission', submissionId)
    } catch (error) {
      console.error('Error resetting submission:', error)
      pushNotification('Reset failed', 'error')
    }
  }

  // Edit mode handlers
  const handleStartEdit = (): void => {
    if (!selectedSubmission) return
    setEditForm({
      description: selectedSubmission.description || '',
      photoName: selectedSubmission.photoName || '',
      buildingName: selectedSubmission.buildingName || '',
      location: selectedSubmission.location
        ? {
            x: roundCoordinate(selectedSubmission.location.x),
            y: roundCoordinate(selectedSubmission.location.y)
          }
        : { x: 0, y: 0 },
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

  const handleCloseModal = (notifyUnsaved: boolean = false): void => {
    const wasEditing = isEditing
    handleCancelEdit()
    setSelectedSubmission(null)
    if (notifyUnsaved && wasEditing) {
      pushNotification('Unsaved changes discarded', 'info')
    }
  }

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (deleteTarget) {
        event.preventDefault()
        handleCancelDelete()
        return
      }
      if (selectedSubmission) {
        event.preventDefault()
        handleCloseModal(true)
      }
    }

    window.addEventListener('keydown', handleEscapeKey)
    return () => window.removeEventListener('keydown', handleEscapeKey)
  }, [selectedSubmission, deleteTarget, isEditing])

  const handleNumberInputWheel = (e: React.WheelEvent<HTMLInputElement>): void => {
    e.currentTarget.blur()
  }

  const handleEditPhotoSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (!file) return
    setNewPhoto(file)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!selectedSubmission) return

    const hasPhotoChange = Boolean(newPhoto)
    const hasDescriptionChange = (editForm.description || '') !== (selectedSubmission.description || '')
    const hasPhotoNameChange = (editForm.photoName || '') !== (selectedSubmission.photoName || '')
    const hasBuildingChange = (editForm.buildingName || '').trim() !== (selectedSubmission.buildingName || '')
    const hasDifficultyChange = (editForm.difficulty || null) !== (selectedSubmission.difficulty || null)
    const hasStatusChange = (editForm.status || '') !== (selectedSubmission.status || '')
    const hasFloorChange = (editForm.floor ?? null) !== (selectedSubmission.floor ?? null)
    const hasLocationChange =
      (editForm.location?.x ?? null) !== (selectedSubmission.location?.x ?? null) ||
      (editForm.location?.y ?? null) !== (selectedSubmission.location?.y ?? null)
    const hasAnyChange =
      hasPhotoChange ||
      hasDescriptionChange ||
      hasPhotoNameChange ||
      hasBuildingChange ||
      hasDifficultyChange ||
      hasStatusChange ||
      hasFloorChange ||
      hasLocationChange

    if (!hasAnyChange) {
      setIsEditing(false)
      pushNotification('Nothing to save', 'info')
      return
    }

    // Validation
    if (!editForm.location || editForm.location.x === undefined || editForm.location.y === undefined) {
      pushNotification('Location is required', 'error')
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
        const normalizedBuilding = (editForm.buildingName || '').trim() || null;
        const updateData: Record<string, unknown> = {
          description: editForm.description,
          photoName: editForm.photoName,
          buildingName: normalizedBuilding,
          location: editForm.location,
          difficulty: editForm.difficulty || null,
          status: editForm.status,
          photoURL: photoURL,
        };
        if (editForm.floor !== undefined) {
          updateData.floor = editForm.floor;
        }
        await updateDoc(doc(db, 'submissions', selectedSubmission.id), updateData)
        void refreshStatusCounts()
        setSubmissions(prev => prev.map(item =>
          item.id === selectedSubmission.id
            ? {
                ...item,
                description: editForm.description,
                photoName: editForm.photoName,
                buildingName: normalizedBuilding,
                location: editForm.location || item.location,
                difficulty: editForm.difficulty || null,
                status: editForm.status || item.status,
                floor: editForm.floor ?? item.floor,
                photoURL: photoURL
              }
            : item
        ))
        if ((editForm.status || '').toLowerCase() === 'approved') {
          const poolEntry = buildImagePoolEntryFromSubmissionDoc(selectedSubmission.id, updateData as Record<string, unknown>)
          if (poolEntry) {
            await upsertImagePoolEntry(poolEntry)
          }
        } else {
          await removeImagePoolEntry('submission', selectedSubmission.id)
        }
        // Real-time listener will auto-update submissions state
      } else if (selectedSubmission?._source === 'image') {
        const updateData: Record<string, unknown> = {
          description: editForm.description,
          correctLocation: editForm.location,
          difficulty: editForm.difficulty || null,
          url: photoURL,
        };
        if (editForm.floor !== undefined) {
          updateData.correctFloor = editForm.floor;
        }
        await updateDoc(doc(db, 'images', selectedSubmission.id), updateData)
        const poolEntry = buildImagePoolEntryFromImageDoc(selectedSubmission.id, updateData)
        if (poolEntry) {
          await upsertImagePoolEntry(poolEntry)
        }
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
      pushNotification('Saved', 'success')
    } catch (error) {
      console.error('Error saving edit:', error)
      setSaveError('Failed to save changes. Please try again.')
      pushNotification('Save failed', 'error')
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
        await removeImagePoolEntry('submission', deleteTarget.id)
        setSubmissions(prev => prev.filter(item => item.id !== deleteTarget.id))
        void refreshStatusCounts()
      } else if (deleteTarget._source === 'image') {
        await deleteImage(deleteTarget.id)
        await removeImagePoolEntry('image', deleteTarget.id)
        setFirestoreImages(prev => prev.filter(img => img.id !== deleteTarget.id))
      }

      // Close modals and clear state
      if (selectedSubmission && selectedSubmission.id === deleteTarget.id) {
        setSelectedSubmission(null)
        handleCancelEdit()
      }
      setDeleteTarget(null)
      pushNotification('Deleted', 'success')
    } catch (error) {
      console.error('Error deleting photo:', error)
      pushNotification('Delete failed', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const allItems: SubmissionItem[] = submissions

  const availableBuildings: string[] = useMemo(() => {
    const names = new Set<string>()
    for (const item of [...submissions, ...firestoreImages]) {
      if (item.buildingName) names.add(item.buildingName)
    }
    return Array.from(names).sort()
  }, [submissions, firestoreImages])

  const filteredSubmissions = useMemo(() => {
    let items = allItems.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false
      if (difficultyFilter !== 'all' && (item.difficulty || 'none') !== difficultyFilter) return false
      if (buildingFilter !== 'all' && (item.buildingName || '') !== buildingFilter) return false
      return true
    })

    items.sort((a, b) => {
      const getTime = (ts: FirestoreTimestamp | string | null | undefined): number => {
        if (!ts) return 0
        if (typeof ts === 'object' && ts !== null && 'toDate' in ts) return ts.toDate().getTime()
        return new Date(ts as string).getTime()
      }
      const timeA = getTime(a.createdAt)
      const timeB = getTime(b.createdAt)
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB
    })

    return items
  }, [allItems, filter, difficultyFilter, buildingFilter, sortOrder])

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
    return date.toLocaleString()
  }

  const formatCoordinate = (value: number | undefined): string => {
    if (value === undefined) return '—'
    return Number(value).toFixed(2)
  }

  const roundCoordinate = (value: number): number => Math.round(value * 100) / 100

  const isEditable = Boolean(selectedSubmission)

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
      </div>

      <div className="filter-section">
        <div className="filter-group">
          <span className="filter-label">Status:</span>
          <div className="filter-tabs">
            <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All ({statusCounts.all})
            </button>
            <button className={`filter-tab ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
              Pending ({statusCounts.pending})
            </button>
            <button className={`filter-tab ${filter === 'approved' ? 'active' : ''}`} onClick={() => setFilter('approved')}>
              Approved ({statusCounts.approved})
            </button>
            <button className={`filter-tab ${filter === 'denied' ? 'active' : ''}`} onClick={() => setFilter('denied')}>
              Denied ({statusCounts.denied})
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Difficulty:</span>
          <div className="filter-tabs">
            <button className={`filter-tab ${difficultyFilter === 'all' ? 'active' : ''}`} onClick={() => setDifficultyFilter('all')}>
              All
            </button>
            {DIFFICULTY_OPTIONS.map(d => (
              <button
                key={d}
                className={`filter-tab filter-tab-difficulty-${d} ${difficultyFilter === d ? 'active' : ''}`}
                onClick={() => setDifficultyFilter(d)}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
            <button className={`filter-tab ${difficultyFilter === 'none' ? 'active' : ''}`} onClick={() => setDifficultyFilter('none')}>
              Not set
            </button>
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Building:</span>
          <select
            className="filter-select"
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
          >
            <option value="all">All buildings</option>
            {availableBuildings.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label filter-label-sort">Sort:</span>
          <button
            className="filter-sort-button"
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
          >
            {sortOrder === 'newest' ? '↓ Newest first' : '↑ Oldest first'}
          </button>
        </div>

      </div>

      {filteredSubmissions.length === 0 ? (
        <div className="no-submissions">
          No {filter === 'all' ? '' : filter} submissions found.
        </div>
      ) : (
        <>
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
                <span className={`difficulty-badge difficulty-badge-${submission.difficulty || 'none'} image-difficulty-badge`}>
                  {submission.difficulty ? submission.difficulty.charAt(0).toUpperCase() + submission.difficulty.slice(1) : 'Not set'}
                </span>
                <span className="image-click-hint">Click image for details</span>
              </div>

              <div className="card-details">
                <div className="detail-row">
                  <strong>Location:</strong>
                  <span>
                    X: {formatCoordinate(submission.location?.x)}, Y: {formatCoordinate(submission.location?.y)}
                  </span>
                </div>
                <div className="detail-row">
                  <strong>Floor:</strong>
                  <span>{submission.floor ?? '—'}</span>
                </div>
                {submission.description && (
                  <div className="detail-row">
                    <strong>Description:</strong>
                    <span>{submission.description}</span>
                  </div>
                )}
                {submission.reviewedAt && (
                  <div className="detail-row">
                    <strong>Reviewed:</strong>
                    <span>{formatDate(submission.reviewedAt)}</span>
                  </div>
                )}
              </div>

              {submission.status === 'pending' && (
                <>
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
                  <div className="card-actions card-actions-delete-row">
                    <button
                      className="edit-button preview-edit-button"
                      onClick={() => setSelectedSubmission(submission)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-photo-button preview-delete-button"
                      onClick={() => handleDeleteClick(submission)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}

              {submission.status !== 'pending' && (
                <>
                  <div className="card-actions card-actions-reset-row">
                    <button
                      className="reset-button preview-reset-button"
                      onClick={() => handleResetToPending(submission.id)}
                    >
                      Reset to Pending
                    </button>
                  </div>
                  <div className="card-actions card-actions-delete-row">
                    <button
                      className="edit-button preview-edit-button"
                      onClick={() => setSelectedSubmission(submission)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-photo-button preview-delete-button"
                      onClick={() => handleDeleteClick(submission)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
            ))}
          </div>
        </>
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
        <div className="modal-overlay" onClick={() => handleCloseModal()}>
          <button className="modal-close modal-close-outside" onClick={() => handleCloseModal()}>
            ×
          </button>
          <div className="modal-shell modal-shell-wide" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="modal-inner-actions">
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
                  {isEditable && <button className="edit-button" onClick={handleStartEdit}>Edit</button>}
                  {isEditable && <button className="delete-photo-button modal-inner-delete-button" onClick={() => handleDeleteClick(selectedSubmission)}>Delete</button>}
                </>
              )}
            </div>

            <div className="modal-content modal-content-wide">
              <div className="modal-details modal-details-wide">
                <div className="detail-three-layout">
                  <div className="detail-column-data">
                    <div className="detail-card detail-combined-card">
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">Difficulty</span>
                        {isEditing ? (
                          <select
                            className="detail-inline-select"
                            value={editForm.difficulty || DIFFICULTY_OPTIONS[0]}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm(prev => ({ ...prev, difficulty: e.target.value }))}
                          >
                            {DIFFICULTY_OPTIONS.map(d => (
                              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="detail-combined-value">
                            <span className={`difficulty-badge difficulty-badge-${selectedSubmission.difficulty || 'none'}`}>
                              {selectedSubmission.difficulty ? selectedSubmission.difficulty.charAt(0).toUpperCase() + selectedSubmission.difficulty.slice(1) : 'Not set'}
                            </span>
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
                            <label className="detail-coordinate-field">
                              <span className="detail-coordinate-label">X:</span>
                              <input
                                className="detail-inline-input detail-inline-number detail-coordinate-input"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={editForm.location?.x ?? ''}
                                onWheel={handleNumberInputWheel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({
                                  ...prev,
                                  location: { ...(prev.location || { x: 0, y: 0 }), x: parseFloat(e.target.value) || 0 }
                                }))}
                              />
                            </label>
                            <label className="detail-coordinate-field">
                              <span className="detail-coordinate-label">Y:</span>
                              <input
                                className="detail-inline-input detail-inline-number detail-coordinate-input"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={editForm.location?.y ?? ''}
                                onWheel={handleNumberInputWheel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({
                                  ...prev,
                                  location: { ...(prev.location || { x: 0, y: 0 }), y: parseFloat(e.target.value) || 0 }
                                }))}
                              />
                            </label>
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
                            onWheel={handleNumberInputWheel}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const value = e.target.value
                              setEditForm(prev => ({ ...prev, floor: value === '' ? null : parseInt(value, 10) }))
                            }}
                          />
                        ) : (
                          <span className="detail-combined-value">{selectedSubmission.floor ? `Floor ${selectedSubmission.floor}` : '\u2014'}</span>
                        )}
                      </div>
                      {selectedSubmission.description && (
                        <div className="detail-combined-row detail-combined-row-top">
                          <span className="detail-combined-key">📝 Description</span>
                          <span className="detail-combined-value detail-description">{selectedSubmission.description}</span>
                        </div>
                      )}
                      {selectedSubmission._source === 'submission' && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">📄 File</span>
                          <span className="detail-combined-value">{selectedSubmission.photoName || '\u2014'}</span>
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

                  <div className="detail-column-image">
                    <div className="detail-photo-card">
                      <img
                        src={newPhoto ? URL.createObjectURL(newPhoto) : selectedSubmission.photoURL}
                        alt="Full size"
                        className="modal-image modal-image-inline"
                      />
                      {isEditing && (
                        <label className="edit-image-overlay" htmlFor="admin-edit-image-upload">
                          <span className="edit-image-overlay-content">
                            <span className="edit-image-overlay-icon" aria-hidden="true">📷</span>
                            <span className="edit-image-overlay-text">
                              {newPhoto ? 'New image selected - click to change' : 'Click to upload new image'}
                            </span>
                          </span>
                        </label>
                      )}
                    </div>
                    {isEditing && (
                      <input
                        id="admin-edit-image-upload"
                        type="file"
                        accept="image/*,.heic,.heif"
                        className="edit-image-upload-input"
                        onChange={handleEditPhotoSelect}
                      />
                    )}
                  </div>

                  <div className="detail-column-map">
                    <div className="detail-map-wrapper">
                      <MapPicker
                        markerPosition={isEditing ? (editForm.location ?? null) : (selectedSubmission.location ?? null)}
                        onMapClick={isEditing ? (coords: Location) => {
                          if (!isPointInPlayingArea(coords, playingArea)) {
                            setClickRejected(true)
                            window.setTimeout(() => setClickRejected(false), 350)
                            return
                          }
                          setEditForm(prev => ({ ...prev, location: coords }))
                        } : () => {}}
                        clickRejected={isEditing && clickRejected}
                        playingArea={isEditing ? playingArea : null}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {selectedSubmission.status === 'pending' && (
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

            {!isEditing && selectedSubmission.status !== 'pending' && (
              <div className="modal-bottom-actions">
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
          </div>
        </div>,
        document.body
      )}

      {notifications.length > 0 && createPortal(
        <div className="ui-notification-stack">
          {notifications.map(notification => (
            <div key={notification.id} className={`ui-notification ui-notification-${notification.type}`}>
              <div className="ui-notification-message">{notification.message}</div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default AdminReview
