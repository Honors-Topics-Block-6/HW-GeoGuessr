import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import {
  getAllSampleImages,
  deleteSubmission,
  deleteImage,
  getAdminSourceCounts,
  getAdminSubmissionsPage,
  getAdminImagesPage
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
  includeTesting: boolean
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

function AdminReview({ onBack }: AdminReviewProps): React.JSX.Element {
  const PAGE_SIZE = 12
  const PREFETCH_MAX_PAGES = 3
  const TESTING_COUNT = useMemo(() => getAllSampleImages().length, [])
  const ADMIN_REVIEW_DEBUG_RUN_ID = useMemo(() => `admin-review-${Date.now()}`, [])

  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [firestoreImages, setFirestoreImages] = useState<SubmissionItem[]>([])
  const [sampleImages, setSampleImages] = useState<SubmissionItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)
  const [filter, setFilter] = useState<string>('all') // pending, approved, denied, all
  const [sourceFilter, setSourceFilter] = useState<string>('all') // all, submissions, images, testing
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null)
  const [submissionCursor, setSubmissionCursor] = useState<string | null>(null)
  const [imageCursor, setImageCursor] = useState<string | null>(null)
  const [hasMoreSubmissions, setHasMoreSubmissions] = useState<boolean>(true)
  const [hasMoreImages, setHasMoreImages] = useState<boolean>(true)
  const [loadedImageKeys, setLoadedImageKeys] = useState<Record<string, true>>({})
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const requestSequenceRef = useRef<number>(0)
  const activeQueryKeyRef = useRef<string>('')
  const [prefetchQueue, setPrefetchQueue] = useState<BufferedPage[]>([])
  const [isPrefetching, setIsPrefetching] = useState<boolean>(false)
  const [sourceCounts, setSourceCounts] = useState({
    all: TESTING_COUNT,
    submission: 0,
    image: 0,
    testing: TESTING_COUNT
  })
  const [statusCounts, setStatusCounts] = useState({
    pending: 0,
    approved: 0,
    denied: 0,
    testing: TESTING_COUNT
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

  const BACKFILL_IMAGE_CURSOR_KEY = 'admin.imagePool.backfill.imageCursor.v1'
  const BACKFILL_SUBMISSION_CURSOR_KEY = 'admin.imagePool.backfill.submissionCursor.v1'

  const currentQueryKey = `${sourceFilter}:${filter}`

  const refreshCounts = useCallback(async (): Promise<void> => {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H1',location:'AdminReview.tsx:refreshCounts:start',message:'refreshCounts called',data:{queryKey:currentQueryKey,sourceFilter,filter},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const sourceMeta = await getAdminSourceCounts()
      setSourceCounts({
        submission: sourceMeta.submissions,
        image: sourceMeta.images,
        testing: TESTING_COUNT,
        all: sourceMeta.submissions + sourceMeta.images + TESTING_COUNT
      })
      setStatusCounts({
        pending: sourceMeta.pending,
        approved: sourceMeta.approved + sourceMeta.images,
        denied: sourceMeta.denied,
        testing: TESTING_COUNT
      })
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H1',location:'AdminReview.tsx:refreshCounts:error',message:'refreshCounts failed',data:{error:error instanceof Error ? error.message : String(error),queryKey:currentQueryKey},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.error('Error fetching admin source counts:', error)
    }
  }, [ADMIN_REVIEW_DEBUG_RUN_ID, TESTING_COUNT, currentQueryKey, filter, sourceFilter])

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
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H3',location:'AdminReview.tsx:fetchRawPage:start',message:'fetchRawPage start',data:{reset,queryKey,sourceFilterValue,filterValue,submissionCursorValue,imageCursorValue,hasMoreSubmissionsValue,hasMoreImagesValue,requestId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const includesSubmissions = sourceFilterValue !== 'image' && sourceFilterValue !== 'testing'
    const includesImages = sourceFilterValue !== 'submission' && sourceFilterValue !== 'testing' && (filterValue === 'all' || filterValue === 'approved')
    const includesTesting = sourceFilterValue === 'all' || sourceFilterValue === 'testing'

    if (sourceFilterValue === 'testing') {
      if (queryKey !== activeQueryKeyRef.current || requestId !== requestSequenceRef.current) return null
      return {
        queryKey,
        submissions: [],
        images: [],
        includeTesting: true,
        nextSubmissionCursor: null,
        nextImageCursor: null,
        hasMoreSubmissions: false,
        hasMoreImages: false
      }
    }

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
            status: (filterValue === 'pending' || filterValue === 'approved' || filterValue === 'denied') ? filterValue : 'all',
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

    if (queryKey !== activeQueryKeyRef.current || requestId !== requestSequenceRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H4',location:'AdminReview.tsx:fetchRawPage:stale',message:'discarded stale page',data:{queryKey,activeQueryKey:activeQueryKeyRef.current,requestId,currentRequestId:requestSequenceRef.current},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return null
    }

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

    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H3',location:'AdminReview.tsx:fetchRawPage:result',message:'fetchRawPage built page',data:{queryKey,nextSubmissionsCount:nextSubmissions.length,nextImagesCount:nextImages.length,firstSubmissionId:nextSubmissions[0]?.id ?? null,lastSubmissionId:nextSubmissions[nextSubmissions.length-1]?.id ?? null,firstImageId:nextImages[0]?.id ?? null,lastImageId:nextImages[nextImages.length-1]?.id ?? null,nextSubmissionCursor:submissionPage?.nextCursor ?? (reset ? null : submissionCursorValue),nextImageCursor:imagePage?.nextCursor ?? (reset ? null : imageCursorValue)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return {
      queryKey,
      submissions: nextSubmissions,
      images: nextImages,
      includeTesting: includesTesting,
      nextSubmissionCursor: submissionPage?.nextCursor ?? (reset ? null : submissionCursorValue),
      nextImageCursor: imagePage?.nextCursor ?? (reset ? null : imageCursorValue),
      hasMoreSubmissions: submissionPage?.hasMore ?? false,
      hasMoreImages: imagePage?.hasMore ?? false
    }
  }, [
    ADMIN_REVIEW_DEBUG_RUN_ID,
    PAGE_SIZE
  ])

  const applyPage = useCallback((page: BufferedPage, reset: boolean): void => {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H2',location:'AdminReview.tsx:applyPage:start',message:'applyPage called',data:{queryKey:page.queryKey,reset,newSubmissions:page.submissions.length,newImages:page.images.length,nextSubmissionCursor:page.nextSubmissionCursor,nextImageCursor:page.nextImageCursor,hasMoreSubmissions:page.hasMoreSubmissions,hasMoreImages:page.hasMoreImages},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setSubmissions(prev => {
      if (reset) return page.submissions
      const prevKeys = new Set(prev.map(item => `${item._source}-${item.id}`))
      const overlapping = page.submissions
        .map(item => `${item._source}-${item.id}`)
        .filter((key) => prevKeys.has(key))
      if (overlapping.length > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H1',location:'AdminReview.tsx:applyPage:duplicateDetected',message:'duplicate submission keys detected during merge',data:{overlapCount:overlapping.length,overlapSample:overlapping.slice(0,5),prevCount:prev.length,incomingCount:page.submissions.length},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }
      return [...prev, ...page.submissions]
    })
    setFirestoreImages(prev => reset ? page.images : [...prev, ...page.images])
    setSampleImages(page.includeTesting ? getAllSampleImages().map(img => ({
      id: img.id,
      photoURL: img.url,
      location: img.correctLocation,
      floor: img.correctFloor,
      photoName: img.description || img.id,
      status: 'testing',
      _source: 'testing' as SubmissionSource,
      description: img.description
    })) : [])
    setSubmissionCursor(page.nextSubmissionCursor)
    setImageCursor(page.nextImageCursor)
    setHasMoreSubmissions(page.hasMoreSubmissions)
    setHasMoreImages(page.hasMoreImages)
  }, [ADMIN_REVIEW_DEBUG_RUN_ID])

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

  // Fetch images from Firestore images collection and sample/testing images
  useEffect(() => {
    activeQueryKeyRef.current = currentQueryKey
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
    setHasMoreSubmissions(sourceFilter !== 'image' && sourceFilter !== 'testing')
    setHasMoreImages(sourceFilter !== 'submission' && sourceFilter !== 'testing' && (filter === 'all' || filter === 'approved'))

    void fetchPage({
      reset: true,
      queryKey: currentQueryKey,
      sourceFilterValue: sourceFilter,
      filterValue: filter,
      submissionCursorValue: null,
      imageCursorValue: null,
      hasMoreSubmissionsValue: sourceFilter !== 'image' && sourceFilter !== 'testing',
      hasMoreImagesValue: sourceFilter !== 'submission' && sourceFilter !== 'testing' && (filter === 'all' || filter === 'approved')
    }).catch((error) => {
      if (requestId !== requestSequenceRef.current) return
      console.error('Error fetching admin review page:', error)
      setLoading(false)
      setLoadingMore(false)
    })
  }, [currentQueryKey, fetchPage, filter, sourceFilter])

  useEffect(() => {
    void refreshCounts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H1',location:'AdminReview.tsx:loadNextPage:entry',message:'loadNextPage invoked',data:{loading,loadingMore,prefetchQueueLength:prefetchQueue.length,submissionCursor,imageCursor,hasMoreSubmissions,hasMoreImages,currentQueryKey},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (loading || loadingMore) return
    const hasMoreFromState =
      (sourceFilter !== 'image' && sourceFilter !== 'testing' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && sourceFilter !== 'testing' && (filter === 'all' || filter === 'approved') && hasMoreImages)
    if (!hasMoreFromState && prefetchQueue.length === 0) return
    setLoadingMore(true)
    try {
      if (prefetchQueue.length > 0) {
        const [nextBufferedPage, ...remainingPages] = prefetchQueue
        // #region agent log
        fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H2',location:'AdminReview.tsx:loadNextPage:consumeQueue',message:'consuming prefetched page',data:{queueLengthBefore:prefetchQueue.length,pageQueryKey:nextBufferedPage.queryKey,currentQueryKey,nextSubmissionCursor:nextBufferedPage.nextSubmissionCursor,nextImageCursor:nextBufferedPage.nextImageCursor},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (nextBufferedPage.queryKey === currentQueryKey) {
          applyPage(nextBufferedPage, false)
        }
        setPrefetchQueue(remainingPages)
        setLoadingMore(false)
        return
      }
      // #region agent log
      fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_REVIEW_DEBUG_RUN_ID,hypothesisId:'H3',location:'AdminReview.tsx:loadNextPage:networkFetch',message:'loading next page from network',data:{submissionCursor,imageCursor,hasMoreSubmissions,hasMoreImages,currentQueryKey},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
  }, [ADMIN_REVIEW_DEBUG_RUN_ID, applyPage, currentQueryKey, fetchPage, filter, hasMoreImages, hasMoreSubmissions, imageCursor, loading, loadingMore, prefetchQueue, sourceFilter, submissionCursor])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node) return
    const hasMore =
      (sourceFilter !== 'image' && sourceFilter !== 'testing' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && sourceFilter !== 'testing' && (filter === 'all' || filter === 'approved') && hasMoreImages) ||
      prefetchQueue.length > 0
    if (!hasMore) return

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries
      if (entry?.isIntersecting) {
        void loadNextPage()
      }
    }, { rootMargin: '350px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [filter, hasMoreImages, hasMoreSubmissions, loadNextPage, prefetchQueue.length, sourceFilter])

  useEffect(() => {
    const hasMore =
      (sourceFilter !== 'image' && sourceFilter !== 'testing' && hasMoreSubmissions) ||
      (sourceFilter !== 'submission' && sourceFilter !== 'testing' && (filter === 'all' || filter === 'approved') && hasMoreImages)
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
          description: target.description
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
      void refreshCounts()
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
      await removeImagePoolEntry('submission', submissionId)
      setSubmissions(prev => prev.map((item) =>
        item.id === submissionId
          ? { ...item, status: 'denied', reviewedAt: new Date().toISOString() }
          : item
      ))
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(prev => prev ? { ...prev, status: 'denied', reviewedAt: new Date().toISOString() } : prev)
      }
      void refreshCounts()
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
      await removeImagePoolEntry('submission', submissionId)
      setSubmissions(prev => prev.map((item) =>
        item.id === submissionId
          ? { ...item, status: 'pending', reviewedAt: null }
          : item
      ))
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(prev => prev ? { ...prev, status: 'pending', reviewedAt: null } : prev)
      }
      void refreshCounts()
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
        if ((editForm.status || '').toLowerCase() === 'approved') {
          const poolEntry = buildImagePoolEntryFromSubmissionDoc(selectedSubmission.id, updateData as Record<string, unknown>)
          if (poolEntry) {
            await upsertImagePoolEntry(poolEntry)
          }
        } else {
          await removeImagePoolEntry('submission', selectedSubmission.id)
        }
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
        void refreshCounts()
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
        void refreshCounts()
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
      void refreshCounts()
    } catch (error) {
      console.error('Error deleting photo:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  // Combine all loaded sources; counts are fetched separately.
  const allItems: SubmissionItem[] = useMemo(() => [...submissions, ...firestoreImages, ...sampleImages], [submissions, firestoreImages, sampleImages])

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

  const formatCoordinate = (value: number | undefined): string => {
    if (value === undefined) return '—'
    return Number(value).toFixed(2)
  }

  const roundCoordinate = (value: number): number => Math.round(value * 100) / 100

  const isEditable = selectedSubmission && selectedSubmission._source !== 'testing'
  const hasMoreItems =
    (sourceFilter !== 'image' && sourceFilter !== 'testing' && hasMoreSubmissions) ||
    (sourceFilter !== 'submission' && sourceFilter !== 'testing' && (filter === 'all' || filter === 'approved') && hasMoreImages) ||
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
              All ({sourceCounts.all})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'submission' ? 'active' : ''}`}
              onClick={() => setSourceFilter('submission')}
            >
              Submissions ({sourceCounts.submission})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'image' ? 'active' : ''}`}
              onClick={() => setSourceFilter('image')}
            >
              Game Images ({sourceCounts.image})
            </button>
            <button
              className={`filter-tab ${sourceFilter === 'testing' ? 'active' : ''}`}
              onClick={() => setSourceFilter('testing')}
            >
              Testing Data ({sourceCounts.testing})
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
              Pending ({statusCounts.pending})
            </button>
            <button
              className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
              onClick={() => setFilter('approved')}
            >
              Approved ({statusCounts.approved})
            </button>
            <button
              className={`filter-tab ${filter === 'denied' ? 'active' : ''}`}
              onClick={() => setFilter('denied')}
            >
              Denied ({statusCounts.denied})
            </button>
            <button
              className={`filter-tab ${filter === 'testing' ? 'active' : ''}`}
              onClick={() => setFilter('testing')}
            >
              Testing ({statusCounts.testing})
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
              <div className="card-image">
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
                <span className={`status-badge ${getStatusBadgeClass(submission.status)}`}>
                  {submission.status}
                </span>
                <span className={`source-badge ${getSourceBadgeClass(submission._source)}`}>
                  {getSourceLabel(submission._source)}
                </span>
              </div>

              <div className="card-details">
                {submission.buildingName && (
                  <div className="detail-row">
                    <strong>Building:</strong>
                    <span>{submission.buildingName}</span>
                  </div>
                )}
                {submission.description && (
                  <div className="detail-row">
                    <strong>Description:</strong>
                    <span>{submission.description}</span>
                  </div>
                )}
                <div className="detail-row">
                  <strong>Location:</strong>
                  <span>
                    X: {formatCoordinate(submission.location?.x)}, Y: {formatCoordinate(submission.location?.y)}
                  </span>
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
      {hasMoreItems && <div ref={loadMoreRef} className="load-more-sentinel" />}

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

                  {/* Building Name (submissions only) */}
                  {selectedSubmission._source === 'submission' && (
                    <div className="edit-field">
                      <label htmlFor="edit-buildingname">Building Name</label>
                      <input
                        id="edit-buildingname"
                        type="text"
                        value={editForm.buildingName || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, buildingName: e.target.value }))}
                      />
                    </div>
                  )}

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
                      onMapClick={(coords: Location) => setEditForm(prev => ({
                        ...prev,
                        location: {
                          x: roundCoordinate(coords.x),
                          y: roundCoordinate(coords.y)
                        }
                      }))}
                    />
                    <div className="coordinate-inputs">
                      <label>
                        X:
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={editForm.location?.x ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({
                            ...prev,
                            location: {
                              ...(prev.location || { x: 0, y: 0 }),
                              x: roundCoordinate(parseFloat(e.target.value) || 0)
                            }
                          }))}
                        />
                      </label>
                      <label>
                        Y:
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={editForm.location?.y ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({
                            ...prev,
                            location: {
                              ...(prev.location || { x: 0, y: 0 }),
                              y: roundCoordinate(parseFloat(e.target.value) || 0)
                            }
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

                  {/* Building Name card */}
                  {selectedSubmission.buildingName && (
                    <div className="detail-card">
                      <div className="detail-card-label">Building Name</div>
                      <div className="detail-card-value">{selectedSubmission.buildingName}</div>
                    </div>
                  )}

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
                          X: {formatCoordinate(selectedSubmission.location?.x)},
                          Y: {formatCoordinate(selectedSubmission.location?.y)}
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
