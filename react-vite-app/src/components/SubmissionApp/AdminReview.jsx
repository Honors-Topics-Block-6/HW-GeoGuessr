import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { getAllImages, getAllSampleImages } from '../../services/imageService'
import './AdminReview.css'

function AdminReview({ onBack }) {
  const [submissions, setSubmissions] = useState([])
  const [firestoreImages, setFirestoreImages] = useState([])
  const [sampleImages, setSampleImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // pending, approved, denied, all
  const [sourceFilter, setSourceFilter] = useState('all') // all, submissions, images, testing
  const [selectedSubmission, setSelectedSubmission] = useState(null)

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
        <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedSubmission(null)}>
              ×
            </button>
            <img src={selectedSubmission.photoURL} alt="Full size" className="modal-image" />
            <div className="modal-details">
              <h3>Image Details</h3>
              <p><strong>Source:</strong> <span className={getSourceBadgeClass(selectedSubmission._source)}>{getSourceLabel(selectedSubmission._source)}</span></p>
              <p><strong>Status:</strong> <span className={getStatusBadgeClass(selectedSubmission.status)}>{selectedSubmission.status}</span></p>
              {selectedSubmission.description && (
                <p><strong>Description:</strong> {selectedSubmission.description}</p>
              )}
              <p><strong>Location:</strong> X: {selectedSubmission.location?.x}, Y: {selectedSubmission.location?.y}</p>
              <p><strong>Floor:</strong> {selectedSubmission.floor}</p>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminReview
