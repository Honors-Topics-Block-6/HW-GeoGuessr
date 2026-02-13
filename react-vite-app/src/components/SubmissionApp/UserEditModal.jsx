import { useState } from 'react'
import { createPortal } from 'react-dom'
import { isHardcodedAdmin } from '../../services/userService'
import './UserEditModal.css'

function UserEditModal({ user, onSave, onClose, isSaving }) {
  const [formData, setFormData] = useState({
    username: user.username || '',
    email: user.email || '',
    isAdmin: user.isAdmin || false,
  })
  const [error, setError] = useState(null)

  const hardcoded = isHardcodedAdmin(user.id)

  // Identify extra fields beyond the standard set
  const standardFields = ['uid', 'email', 'username', 'isAdmin', 'createdAt']
  const extraFields = Object.keys(user).filter(
    key => !standardFields.includes(key) && key !== 'id'
  )

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Build updates object with only changed fields
    const updates = {}
    if (formData.username !== (user.username || '')) {
      updates.username = formData.username
    }
    if (formData.email !== (user.email || '')) {
      updates.email = formData.email
    }
    if (formData.isAdmin !== (user.isAdmin || false)) {
      updates.isAdmin = formData.isAdmin
    }

    // Nothing changed — just close
    if (Object.keys(updates).length === 0) {
      onClose()
      return
    }

    try {
      await onSave(user.id, updates)
    } catch (err) {
      setError(err.message || 'Failed to update user.')
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return createPortal(
    <div className="user-modal-overlay" onClick={onClose}>
      <div className="user-modal-content" onClick={e => e.stopPropagation()}>
        <button className="user-modal-close" onClick={onClose}>&times;</button>

        <h3 className="user-modal-title">Edit User</h3>

        {error && <div className="user-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="user-modal-form">
          {/* Read-only: UID */}
          <div className="user-modal-field">
            <label className="user-modal-label">User ID</label>
            <span className="user-modal-value user-modal-uid">{user.id}</span>
          </div>

          {/* Editable: Username */}
          <div className="user-modal-field">
            <label className="user-modal-label" htmlFor="edit-username">Username</label>
            <input
              id="edit-username"
              type="text"
              className="user-modal-input"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
              disabled={isSaving}
            />
          </div>

          {/* Editable: Email */}
          <div className="user-modal-field">
            <label className="user-modal-label" htmlFor="edit-email">Email</label>
            <input
              id="edit-email"
              type="email"
              className="user-modal-input"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={isSaving}
            />
          </div>

          {/* Editable: Admin toggle (unless hardcoded) */}
          <div className="user-modal-field">
            <label className="user-modal-label">Admin Status</label>
            {hardcoded ? (
              <span className="user-modal-value user-modal-locked">
                Always Admin (Permanent)
              </span>
            ) : (
              <label className="user-modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.isAdmin}
                  onChange={(e) => handleChange('isAdmin', e.target.checked)}
                  disabled={isSaving}
                />
                <span>{formData.isAdmin ? 'Admin' : 'Not Admin'}</span>
              </label>
            )}
          </div>

          {/* Read-only: Created At */}
          <div className="user-modal-field">
            <label className="user-modal-label">Created</label>
            <span className="user-modal-value">{formatDate(user.createdAt)}</span>
          </div>

          {/* Any extra/dynamic fields — displayed read-only */}
          {extraFields.map(field => (
            <div className="user-modal-field" key={field}>
              <label className="user-modal-label">{field}</label>
              <span className="user-modal-value">
                {typeof user[field] === 'object'
                  ? JSON.stringify(user[field])
                  : String(user[field])}
              </span>
            </div>
          ))}

          {/* Actions */}
          <div className="user-modal-actions">
            <button
              type="submit"
              className="user-modal-save"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="user-modal-cancel"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default UserEditModal
