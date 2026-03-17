import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import {
  deleteSubmission,
  deleteImage,
  getAdminSubmissionsPage,
  getAdminImagesPage,
  getAdminSourceCounts,
  type AdminSourceCounts
} from '../../services/imageService'
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
type SubmissionStatus = 'pending' | 'approved' | 'denied' | 'tournament_approved'

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

interface BufferedPage {
  queryKey: string
  submissions: SubmissionItem[]
  images: SubmissionItem[]
  nextSubmissionCursor: string | null
  nextImageCursor: string | null
  hasMoreSubmissions: boolean
  hasMoreImages: boolean
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

function AdminReview({ onBack }: AdminReviewProps): React.JSX.Element {
  const PAGE_SIZE = 12
  const PRELOAD_TARGET_ITEMS = 36
  const PREFETCH_MAX_PAGES = 3

  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [firestoreImages, setFirestoreImages] = useState<SubmissionItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)
  const [filter, setFilter] = useState<string>('all') // pending, approved, denied, all
  const [sourceFilter, setSourceFilter] = useState<string>('all') // all, submissions, images
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null)
  const [submissionCursor, setSubmissionCursor] = useState<string | null>(null)
  const [imageCursor, setImageCursor] = useState<string | null>(null)
  const [hasMoreSubmissions, setHasMoreSubmissions] = useState<boolean>(true)
  const [hasMoreImages, setHasMoreImages] = useState<boolean>(true)
  const [loadedImageKeys, setLoadedImageKeys] = useState<Record<string, true>>({})
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const canTriggerAutoLoadRef = useRef<boolean>(true)
  const sentinelInViewRef = useRef<boolean>(false)
  const requestSequenceRef = useRef<number>(0)
  const activeQueryKeyRef = useRef<string>('')
  const [prefetchQueue, setPrefetchQueue] = useState<BufferedPage[]>([])
  const [isPrefetching, setIsPrefetching] = useState<boolean>(false)

  // Edit mode state
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editForm, setEditForm] = useState<Partial<EditFormState>>({})
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string>('')
  const [newPhoto, setNewPhoto] = useState<File | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<SubmissionItem | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  // Toast notifications (from PR)
  const [notifications, setNotifications] = useState<ToastNotification[]>([])

  // Playing area validation (from PR)
  const [playingArea, setPlayingArea] = useState<PlayingArea | null>(null)
  const [clickRejected, setClickRejected] = useState<boolean>(false)

  // Total counts from database
  const [totalCounts, setTotalCounts] = useState<AdminSourceCounts | null>(null)

  const loadedSourceCounts = useMemo(() => ({
    submission: submissions.length,
    image: firestoreImages.length,
    all: submissions.length + firestoreImages.length
  }), [firestoreImages.length, submissions.length])

  const BACKFILL_IMAGE_CURSOR_KEY = 'admin.imagePool.backfill.imageCursor.v1'
  const BACKFILL_SUBMISSION_CURSOR_KEY = 'admin.imagePool.backfill.submissionCursor.v1'

  const currentQueryKey = `${sourceFilter}:${filter}`

  const fetchRawPage = useCallback(async (options: {
    reset: boolean
    queryKey: string
    sourceFilterValue: string
    filterValue: string
    submissionCursorValue: string | null
    imageCursorValue: string | null
    hasMoreSubmissionsValue: boolean
    hasMoreImagesValue: boolean
  }): Promise<BufferedPage | null> => {
    const {
      reset,
      queryKey,
      sourceFilterValue,
      filterValue,
      submissionCursorValue,
      imageCursorValue,
      hasMoreSubmissionsValue,
      hasMoreImagesValue
    } = options
    const requestId = requestSequenceRef.current

    const includesSubmissions = sourceFilterValue !== 'image'
    const includesImages = sourceFilterValue !== 'submission' && (filterValue === 'all' || filterValue === 'approved')

    const currentSubmissionCursor = reset ? null : submissionCursorValue
    const currentImageCursor = reset ? null : imageCursorValue
    const allowSubmissionFetch = includesSubmissions && (reset || hasMoreSubmissionsValue)
    const allowImageFetch = includesImages && (reset || hasMoreImagesValue)

    const submissionPageSize = allowSubmissionFetch && allowImageFetch
      ? Math.max(1, Math.floor(PAGE_SIZE / 2))
      : (allowSubmissionFetch ? PAGE_SIZE : 0)
    const imagePageSize = allowSubmissionFetch && allowImageFetch
      ? PAGE_SIZE - submissionPageSize
      : (allowImageFetch ? PAGE_SIZE : 0)

    const [submissionPage, imagePage] = await Promise.all([
      submissionPageSize > 0
        ? getAdminSubmissionsPage({
            status: (filterValue === 'pending' || filterValue === 'approved' || filterValue === 'denied' || filterValue === 'tournament_approved') ? filterValue : 'all',
            pageSize: submissionPageSize,
            cursor: currentSubmissionCursor
          })
        : Promise.resolve(null),
      imagePageSize > 0
        ? getAdminImagesPage({
            pageSize: imagePageSize,
            cursor: currentImageCursor
          })
        : Promise.resolve(null)
    ])

    if (queryKey !== activeQueryKeyRef.current || requestId !== requestSequenceRef.current) return null

    const nextSubmissions = (submissionPage?.items ?? []).map((item) => {
      const normalizedBuilding = (item.buildingName || '').trim() || null
      return {
        id: item.id,
        photoURL: item.photoURL || undefined,
        location: item.location || undefined,
        floor: item.floor ?? null,
        difficulty: item.difficulty ?? null,
        photoName: item.photoName || undefined,
        buildingName: normalizedBuilding,
        status: item.status,
        _source: 'submission' as SubmissionSource,
        description: item.description || undefined,
        createdAt: (item.createdAt as FirestoreTimestamp | string | null | undefined) ?? null,
        reviewedAt: (item.reviewedAt as FirestoreTimestamp | string | null | undefined) ?? null
      } as SubmissionItem
    })

    const nextImages = (imagePage?.items ?? []).map((item) => ({
      id: item.id,
      photoURL: item.url || undefined,
      location: item.correctLocation || undefined,
      floor: item.correctFloor ?? null,
      difficulty: item.difficulty ?? null,
      photoName: item.description || item.id,
      status: 'approved',
      _source: 'image' as SubmissionSource,
      description: item.description || undefined
    } as SubmissionItem))

    return {
      queryKey,
      submissions: nextSubmissions,
      images: nextImages,
      nextSubmissionCursor: submissionPage?.nextCursor ?? (reset ? null : submissionCursorValue),
      nextImageCursor: imagePage?.nextCursor ?? (reset ? null : imageCursorValue),
      hasMoreSubmissions: submissionPage?.hasMore ?? false,
      hasMoreImages: imagePage?.hasMore ?? false
    }
  }, [PAGE_SIZE])

  const applyPage = useCallback((page: BufferedPage, reset: boolean): void => {
    setSubmissions(prev => {
      if (reset) return page.submissions
      const prevKeys = new Set(prev.map(item => `${item._source}-${item.id}`))
      const overlapping: string[] = []
      const uniqueIncoming: SubmissionItem[] = []
      page.submissions.forEach((item) => {
        const key = `${item._source}-${item.id}`
        if (prevKeys.has(key)) {
          overlapping.push(key)
          return
        }
        uniqueIncoming.push(item)
      })
      if (uniqueIncoming.length === 0) return prev
      return [...prev, ...uniqueIncoming]
    })
    setFirestoreImages(prev => {
      if (reset) return page.images
      const prevKeys = new Set(prev.map(item => `${item._source}-${item.id}`))
      const uniqueIncoming = page.images.filter((item) => !prevKeys.has(`${item._source}-${item.id}`))
      return uniqueIncoming.length === 0 ? prev : [...prev, ...uniqueIncoming]
    })
    setSubmissionCursor(page.nextSubmissionCursor)
    setImageCursor(page.nextImageCursor)
    setHasMoreSubmissions(page.hasMoreSubmissions)
    setHasMoreImages(page.hasMoreImages)
  }, [])

  const fetchPage = useCallback(async (options: {
    reset: boolean
    queryKey: string
    sourceFilterValue: string
    filterValue: string
    submissionCursorValue: string | null
    imageCursorValue: string | null
    hasMoreSubmissionsValue: boolean
    hasMoreImagesValue: boolean
  }): Promise<void> => {
    const page = await fetchRawPage(options)
    if (!page) return
    applyPage(page, options.reset)
    setLoading(false)
    setLoadingMore(false)
  }, [
    applyPage,
    fetchRawPage
  ])

  // Fetch images from Firestore images collection
  useEffect(() => {
    activeQueryKeyRef.current = currentQueryKey
    canTriggerAutoLoadRef.current = true
    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current
    setLoading(true)
    setLoadingMore(false)
    setLoadedImageKeys({})
    setSubmissions([])
    setFirestoreImages([])
    setSubmissionCursor(null)
    setImageCursor(null)
    setPrefetchQueue([])
    setIsPrefetching(false)
    setHasMoreSubmissions(sourceFilter !== 'image')
    setHasMoreImages(sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved'))

    void fetchPage({
      reset: true,
      queryKey: currentQueryKey,
      sourceFilterValue: sourceFilter,
      filterValue: filter,
      submissionCursorValue: null,
      imageCursorValue: null,
      hasMoreSubmissionsValue: sourceFilter !== 'image',
      hasMoreImagesValue: sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved')
    }).catch((error) => {
      if (requestId !== requestSequenceRef.current) return
      console.error('Error fetching admin review page:', error)
      setLoading(false)
      setLoadingMore(false)
    })
  }, [currentQueryKey, fetchPage, filter, sourceFilter])

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

    const backfillDelayHandle = window.setTimeout(() => {
      void runBackfillPasses().catch((error) => {
        console.error('Error backfilling imagePool:', error)
      })
    }, 1500)

    return () => {
      cancelled = true
      window.clearTimeout(backfillDelayHandle)
    }
  }, [])

  const loadNextPage = useCallback(async (): Promise<void> => {
    if (loading || loadingMore) return
    if (isPrefetching && prefetchQueue.length === 0) {
      return
    }
    const hasMoreFromState =
      (sourceFilter !== 'image' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved') && hasMoreImages)
    if (!hasMoreFromState && prefetchQueue.length === 0) return
    setLoadingMore(true)
    try {
      if (prefetchQueue.length > 0) {
        const [nextBufferedPage, ...remainingPages] = prefetchQueue
        if (nextBufferedPage.queryKey === currentQueryKey) {
          applyPage(nextBufferedPage, false)
        }
        setPrefetchQueue(remainingPages)
        setLoadingMore(false)
        return
      }
      await fetchPage({
        reset: false,
        queryKey: currentQueryKey,
        sourceFilterValue: sourceFilter,
        filterValue: filter,
        submissionCursorValue: submissionCursor,
        imageCursorValue: imageCursor,
        hasMoreSubmissionsValue: hasMoreSubmissions,
        hasMoreImagesValue: hasMoreImages
      })
    } catch (error) {
      console.error('Error loading more review items:', error)
      setLoadingMore(false)
    }
  }, [applyPage, currentQueryKey, fetchPage, filter, hasMoreImages, hasMoreSubmissions, imageCursor, isPrefetching, loading, loadingMore, prefetchQueue, sourceFilter, submissionCursor])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node) return
    const hasMore =
      (sourceFilter !== 'image' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved') && hasMoreImages) ||
      prefetchQueue.length > 0
    if (!hasMore) return

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries
      sentinelInViewRef.current = Boolean(entry?.isIntersecting)
      if (entry?.isIntersecting) {
        if (!canTriggerAutoLoadRef.current) return
        canTriggerAutoLoadRef.current = false
        void loadNextPage()
        return
      }
      canTriggerAutoLoadRef.current = true
    }, { rootMargin: '350px 0px' })
    observer.observe(node)
    return () => {
      sentinelInViewRef.current = false
      observer.disconnect()
    }
  }, [filter, hasMoreImages, hasMoreSubmissions, loadNextPage, prefetchQueue.length, sourceFilter])

  useEffect(() => {
    const hasMoreToLoad =
      (sourceFilter !== 'image' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved') && hasMoreImages) ||
      prefetchQueue.length > 0
    if (!hasMoreToLoad) return
    if (loading || loadingMore || isPrefetching) return
    if (loadedSourceCounts.all < PRELOAD_TARGET_ITEMS) {
      canTriggerAutoLoadRef.current = true
      void loadNextPage()
      return
    }
    if (!sentinelInViewRef.current) return
    canTriggerAutoLoadRef.current = true
    void loadNextPage()
  }, [PRELOAD_TARGET_ITEMS, filter, hasMoreImages, hasMoreSubmissions, isPrefetching, loadedSourceCounts.all, loading, loadingMore, loadNextPage, prefetchQueue.length, sourceFilter])

  useEffect(() => {
    const hasMore =
      (sourceFilter !== 'image' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved') && hasMoreImages)
    if (!hasMore || loading || loadingMore || isPrefetching || prefetchQueue.length >= PREFETCH_MAX_PAGES) return

    const queueTail = prefetchQueue[prefetchQueue.length - 1]
    const baseSubmissionCursor = queueTail ? queueTail.nextSubmissionCursor : submissionCursor
    const baseImageCursor = queueTail ? queueTail.nextImageCursor : imageCursor
    const baseHasMoreSubmissions = queueTail ? queueTail.hasMoreSubmissions : hasMoreSubmissions
    const baseHasMoreImages = queueTail ? queueTail.hasMoreImages : hasMoreImages

    setIsPrefetching(true)
    void fetchRawPage({
      reset: false,
      queryKey: currentQueryKey,
      sourceFilterValue: sourceFilter,
      filterValue: filter,
      submissionCursorValue: baseSubmissionCursor,
      imageCursorValue: baseImageCursor,
      hasMoreSubmissionsValue: baseHasMoreSubmissions,
      hasMoreImagesValue: baseHasMoreImages
    }).then((page) => {
      if (!page || page.queryKey !== currentQueryKey) return
      setPrefetchQueue((prev) => {
        if (prev.length >= PREFETCH_MAX_PAGES) return prev
        return [...prev, page]
      })
    }).catch((error) => {
      console.error('Error prefetching admin review page:', error)
    }).finally(() => {
      setIsPrefetching(false)
    })
  }, [
    PREFETCH_MAX_PAGES,
    currentQueryKey,
    fetchRawPage,
    filter,
    hasMoreImages,
    hasMoreSubmissions,
    imageCursor,
    isPrefetching,
    loading,
    loadingMore,
    prefetchQueue,
    sourceFilter,
    submissionCursor
  ])

  // Fetch playing area (from PR)
  useEffect(() => {
    async function fetchPlayingArea(): Promise<void> {
      const area = await getPlayingArea()
      setPlayingArea(area)
    }
    fetchPlayingArea()
  }, [])

  // Fetch total counts from database
  useEffect(() => {
    async function fetchTotalCounts(): Promise<void> {
      const counts = await getAdminSourceCounts()
      setTotalCounts(counts)
    }
    fetchTotalCounts()
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

  // Toast notification helper (from PR)
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
      const target = submissions.find((item) => item.id === submissionId)
      if (target) {
        const poolEntry = buildImagePoolEntryFromSubmissionDoc(submissionId, {
          photoURL: target.photoURL,
          difficulty: target.difficulty,
          location: target.location,
          floor: target.floor,
          buildingName: target.buildingName,
          description: target.description,
          status: 'approved'
        })
        if (poolEntry) {
          await upsertImagePoolEntry(poolEntry)
        }
      }
      setSubmissions(prev => prev.map((item) =>
        item.id === submissionId
          ? { ...item, status: 'approved', reviewedAt: new Date().toISOString() }
          : item
      ))
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(prev => prev ? { ...prev, status: 'approved', reviewedAt: new Date().toISOString() } : prev)
      }
      pushNotification('Approved', 'success')
    } catch (error) {
      console.error('Error approving submission:', error)
      pushNotification('Approve failed', 'error')
    }
  }

  const handleTournamentApprove = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'tournament_approved',
        reviewedAt: serverTimestamp()
      })
      const target = submissions.find((item) => item.id === submissionId)
      if (target) {
        const poolEntry = buildImagePoolEntryFromSubmissionDoc(submissionId, {
          photoURL: target.photoURL,
          difficulty: target.difficulty,
          location: target.location,
          floor: target.floor,
          buildingName: target.buildingName,
          description: target.description,
          status: 'tournament_approved'
        })
        if (poolEntry) {
          await upsertImagePoolEntry(poolEntry)
        }
      }
      setSubmissions(prev => prev.map((item) =>
        item.id === submissionId
          ? { ...item, status: 'tournament_approved', reviewedAt: new Date().toISOString() }
          : item
      ))
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(prev => prev ? { ...prev, status: 'tournament_approved', reviewedAt: new Date().toISOString() } : prev)
      }
      pushNotification('Tournament Approved', 'success')
    } catch (error) {
      console.error('Error tournament approving submission:', error)
      pushNotification('Tournament approve failed', 'error')
    }
  }

  const handleDeny = async (submissionId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'denied',
        reviewedAt: serverTimestamp()
      })
      await removeImagePoolEntry('submission', submissionId)
      setSubmissions(prev => prev.map((item) =>
        item.id === submissionId
          ? { ...item, status: 'denied', reviewedAt: new Date().toISOString() }
          : item
      ))
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(prev => prev ? { ...prev, status: 'denied', reviewedAt: new Date().toISOString() } : prev)
      }
      pushNotification('Denied', 'success')
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
      await removeImagePoolEntry('submission', submissionId)
      setSubmissions(prev => prev.map((item) =>
        item.id === submissionId
          ? { ...item, status: 'pending', reviewedAt: null }
          : item
      ))
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(prev => prev ? { ...prev, status: 'pending', reviewedAt: null } : prev)
      }
      pushNotification('Reset to pending', 'success')
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
        setSubmissions(prev => prev.map(item =>
          item.id === selectedSubmission.id
            ? {
                ...item,
                description: (editForm.description as string) || '',
                photoName: (editForm.photoName as string) || '',
                buildingName: normalizedBuilding,
                location: editForm.location!,
                floor: editForm.floor,
                difficulty: editForm.difficulty || null,
                status: (editForm.status as string) || item.status,
                photoURL
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

  // Combine all loaded sources; counts are fetched separately.
  const allItems: SubmissionItem[] = useMemo(() => [...submissions, ...firestoreImages], [submissions, firestoreImages])

  const loadedStatusCounts = useMemo(() => ({
    pending: submissions.filter((item) => item.status === 'pending').length,
    approved: submissions.filter((item) => item.status === 'approved').length + firestoreImages.length,
    tournament_approved: submissions.filter((item) => item.status === 'tournament_approved').length,
    denied: submissions.filter((item) => item.status === 'denied').length
  }), [firestoreImages.length, submissions])

  // Format count display as "loaded/total" when totals are available
  const formatSourceCount = (source: 'all' | 'submission' | 'image'): string => {
    const loaded = loadedSourceCounts[source]
    if (!totalCounts) return `${loaded}`

    let total: number
    if (source === 'all') {
      total = totalCounts.submissions + totalCounts.images
    } else if (source === 'submission') {
      total = totalCounts.submissions
    } else {
      total = totalCounts.images
    }

    return `${loaded}/${total}`
  }

  const formatStatusCount = (status: 'all' | 'pending' | 'approved' | 'tournament_approved' | 'denied'): string => {
    if (status === 'all') {
      return formatSourceCount('all')
    }

    const loaded = loadedStatusCounts[status]
    if (!totalCounts) return `${loaded}`

    let total: number
    if (status === 'approved') {
      // Approved includes both approved submissions and game images
      total = totalCounts.approved + totalCounts.images
    } else if (status === 'tournament_approved') {
      // Tournament approved count comes from loaded data (not stored in totalCounts)
      return `${loaded}`
    } else {
      total = totalCounts[status]
    }

    return `${loaded}/${total}`
  }

  const filteredSubmissions = useMemo(() => allItems.filter(item => {
    // Apply source filter
    if (sourceFilter !== 'all' && item._source !== sourceFilter) return false
    // Apply status filter (only relevant for submissions)
    if (filter === 'all') return true
    return item.status === filter
  }), [allItems, filter, sourceFilter])

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'approved': return 'badge-approved'
      case 'tournament_approved': return 'badge-tournament'
      case 'denied': return 'badge-denied'
      default: return 'badge-pending'
    }
  }

  const getSourceBadgeClass = (source: SubmissionSource): string => {
    switch (source) {
      case 'submission': return 'source-submission'
      case 'image': return 'source-image'
      default: return ''
    }
  }

  const getSourceLabel = (source: SubmissionSource): string => {
    switch (source) {
      case 'submission': return 'Submission'
      case 'image': return 'Game Image'
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

  const formatCoordinate = (value: number | undefined): string => {
    if (value === undefined) return '—'
    return Number(value).toFixed(2)
  }

  const roundCoordinate = (value: number): number => Math.round(value * 100) / 100

  const isEditable = Boolean(selectedSubmission)
  const hasMoreItems =
      (sourceFilter !== 'image' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && (filter === 'all' || filter === 'approved') && hasMoreImages) ||
    prefetchQueue.length > 0

  if (loading) {
    return (
      <div className="admin-review">
        <div className="loading">Loading review queue...</div>
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
          <span className="filter-label">Source:</span>
          <div className="filter-tabs">
            <button
              className={`filter-tab ${sourceFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              All ({formatSourceCount('all')})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'submission' ? 'active' : ''}`}
              onClick={() => setSourceFilter('submission')}
            >
              Submissions ({formatSourceCount('submission')})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'image' ? 'active' : ''}`}
              onClick={() => setSourceFilter('image')}
            >
              Game Images ({formatSourceCount('image')})
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
              All ({formatStatusCount('all')})
            </button>
            <button
              className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Pending ({formatStatusCount('pending')})
            </button>
            <button
              className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
              onClick={() => setFilter('approved')}
            >
              Approved ({formatStatusCount('approved')})
            </button>
            <button
              className={`filter-tab filter-tab-tournament ${filter === 'tournament_approved' ? 'active' : ''}`}
              onClick={() => setFilter('tournament_approved')}
            >
              Tournament ({formatStatusCount('tournament_approved')})
            </button>
            <button
              className={`filter-tab ${filter === 'denied' ? 'active' : ''}`}
              onClick={() => setFilter('denied')}
            >
              Denied ({formatStatusCount('denied')})
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
            <div key={`${submission._source}-${submission.id}`} className="submission-card">
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
                {!loadedImageKeys[`${submission._source}-${submission.id}`] && (
                  <div className="card-image-placeholder">Loading image...</div>
                )}
                <img
                  src={submission.photoURL || ''}
                  alt="Submitted photo"
                  loading="lazy"
                  decoding="async"
                  onLoad={() => {
                    const key = `${submission._source}-${submission.id}`
                    setLoadedImageKeys(prev => (prev[key] ? prev : { ...prev, [key]: true }))
                  }}
                  className={loadedImageKeys[`${submission._source}-${submission.id}`] ? 'is-loaded' : 'is-loading'}
                />
                <span className={`difficulty-badge difficulty-badge-${submission.difficulty || 'none'} image-difficulty-badge`}>
                  {submission.difficulty ? submission.difficulty.charAt(0).toUpperCase() + submission.difficulty.slice(1) : 'Not set'}
                </span>
                <span className={`source-badge ${getSourceBadgeClass(submission._source)}`}>
                  {getSourceLabel(submission._source)}
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

              {submission._source === 'submission' && submission.status === 'pending' && (
                <>
                  <div className="card-actions">
                    <button
                      className="approve-button"
                      onClick={() => handleApprove(submission.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="tournament-approve-button"
                      onClick={() => handleTournamentApprove(submission.id)}
                    >
                      Tournament
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

              {submission._source === 'submission' && submission.status !== 'pending' && (
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

              {submission._source === 'image' && (
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
              )}
            </div>
          ))}
        </div>
      )}
      {hasMoreItems && <div ref={loadMoreRef} className="load-more-sentinel" />}
      {(loadingMore || isPrefetching) && (
        <div className="loading-more-indicator active" aria-live="polite">
          <span className="loading-more-spinner" />
          <span>
            {loadingMore
              ? 'Loading more images...'
              : 'Preparing more images...'}
          </span>
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
                        <span className="detail-combined-key">Building</span>
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
                        <span className="detail-combined-key">Location</span>
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
                        <span className="detail-combined-key">Floor</span>
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
                          <span className="detail-combined-key">Description</span>
                          <span className="detail-combined-value detail-description">{selectedSubmission.description}</span>
                        </div>
                      )}
                      {selectedSubmission._source === 'submission' && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">File</span>
                          <span className="detail-combined-value">{selectedSubmission.photoName || '\u2014'}</span>
                        </div>
                      )}
                      <div className="detail-combined-row">
                        <span className="detail-combined-key">ID</span>
                        <span className="detail-combined-value detail-id-value">{selectedSubmission.id}</span>
                      </div>
                      {selectedSubmission.createdAt && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">Submitted</span>
                          <span className="detail-combined-value">{formatDate(selectedSubmission.createdAt)}</span>
                        </div>
                      )}
                      {selectedSubmission.reviewedAt && (
                        <div className="detail-combined-row">
                          <span className="detail-combined-key">Reviewed</span>
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
                            <span className="edit-image-overlay-icon" aria-hidden="true">+</span>
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

            {selectedSubmission._source === 'submission' && selectedSubmission.status === 'pending' && (
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
                  className="tournament-approve-button"
                  onClick={() => {
                    handleTournamentApprove(selectedSubmission.id)
                    setSelectedSubmission(null)
                  }}
                >
                  Tournament
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

            {!isEditing && selectedSubmission._source === 'submission' && selectedSubmission.status !== 'pending' && (
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
