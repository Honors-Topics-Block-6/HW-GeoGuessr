import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import './AdminReview.css'

function AdminReview() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending') // pending, approved, denied, all
  const [selectedSubmission, setSelectedSubmission] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setSubmissions(subs)
      setLoading(false)
    }, (error) => {
      console.error('Error fetching submissions:', error)
      setLoading(false)
    })

    return () => unsubscribe()
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

  const filteredSubmissions = submissions.filter(sub => {
    if (filter === 'all') return true
    return sub.status === filter
  })

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'approved': return 'badge-approved'
      case 'denied': return 'badge-denied'
      default: return 'badge-pending'
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
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending ({submissions.filter(s => s.status === 'pending').length})
        </button>
        <button
          className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          Approved ({submissions.filter(s => s.status === 'approved').length})
        </button>
        <button
          className={`filter-tab ${filter === 'denied' ? 'active' : ''}`}
          onClick={() => setFilter('denied')}
        >
          Denied ({submissions.filter(s => s.status === 'denied').length})
        </button>
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({submissions.length})
        </button>
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
              </div>

              <div className="card-details">
                <div className="detail-row">
                  <strong>Location:</strong>
                  <span>X: {submission.location?.x}, Y: {submission.location?.y}</span>
                </div>
                <div className="detail-row">
                  <strong>Floor:</strong>
                  <span>{submission.floor}</span>
                </div>
                <div className="detail-row">
                  <strong>Submitted:</strong>
                  <span>{formatDate(submission.createdAt)}</span>
                </div>
                {submission.reviewedAt && (
                  <div className="detail-row">
                    <strong>Reviewed:</strong>
                    <span>{formatDate(submission.reviewedAt)}</span>
                  </div>
                )}
              </div>

              {submission.status === 'pending' && (
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
              <h3>Submission Details</h3>
              <p><strong>Status:</strong> <span className={getStatusBadgeClass(selectedSubmission.status)}>{selectedSubmission.status}</span></p>
              <p><strong>Location:</strong> X: {selectedSubmission.location?.x}, Y: {selectedSubmission.location?.y}</p>
              <p><strong>Floor:</strong> {selectedSubmission.floor}</p>
              <p><strong>File Name:</strong> {selectedSubmission.photoName}</p>
              <p><strong>Submitted:</strong> {formatDate(selectedSubmission.createdAt)}</p>
              {selectedSubmission.reviewedAt && (
                <p><strong>Reviewed:</strong> {formatDate(selectedSubmission.reviewedAt)}</p>
              )}

              {selectedSubmission.status === 'pending' && (
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
