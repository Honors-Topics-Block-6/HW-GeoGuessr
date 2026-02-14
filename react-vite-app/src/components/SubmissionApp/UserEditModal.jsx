import { useState } from 'react'
import { isHardcodedAdmin } from '../../services/userService'
import './UserEditModal.css'

function UserEditModal({ user, onSave, onClose, isSaving }) {
  // System fields that are never editable
  const systemFields = ['uid', 'id', 'createdAt']
  // Known fields we render explicitly with nice UI
  const knownFields = ['uid', 'id', 'email', 'username', 'isAdmin', 'createdAt', 'totalXp', 'gamesPlayed', 'lastGameAt']

  // Extra/dynamic fields beyond the known set
  const extraFields = Object.keys(user).filter(
    key => !knownFields.includes(key)
  )

  const toDatetimeLocal = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    if (isNaN(date.getTime())) return ''
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const [formData, setFormData] = useState({
    username: user.username || '',
    email: user.email || '',
    isAdmin: user.isAdmin || false,
    totalXp: user.totalXp ?? 0,
    gamesPlayed: user.gamesPlayed ?? 0,
    lastGameAt: toDatetimeLocal(user.lastGameAt),
    // Initialize extra fields
    ...Object.fromEntries(
      extraFields.map(key => [
        key,
        typeof user[key] === 'object' ? JSON.stringify(user[key]) : String(user[key] ?? '')
      ])
    ),
  })
  const [error, setError] = useState(null)

  const hardcoded = isHardcodedAdmin(user.id)

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

    // XP & Stats — compare numerically
    const newTotalXp = Number(formData.totalXp)
    if (!isNaN(newTotalXp) && newTotalXp !== (user.totalXp ?? 0)) {
      updates.totalXp = newTotalXp
    }
    const newGamesPlayed = Number(formData.gamesPlayed)
    if (!isNaN(newGamesPlayed) && newGamesPlayed !== (user.gamesPlayed ?? 0)) {
      updates.gamesPlayed = newGamesPlayed
    }

    // lastGameAt — compare as date
    if (formData.lastGameAt) {
      const newDate = new Date(formData.lastGameAt)
      const oldDate = user.lastGameAt
        ? (user.lastGameAt.toDate ? user.lastGameAt.toDate() : new Date(user.lastGameAt))
        : null
      if (!oldDate || newDate.getTime() !== oldDate.getTime()) {
        updates.lastGameAt = newDate
      }
    } else if (user.lastGameAt) {
      // Cleared the date
      updates.lastGameAt = null
    }

    // Extra/dynamic fields
    for (const field of extraFields) {
      const original = typeof user[field] === 'object'
        ? JSON.stringify(user[field])
        : String(user[field] ?? '')
      if (formData[field] !== original) {
        // Try to parse back to number or JSON if applicable
        const val = formData[field]
        if (val === '') {
          updates[field] = ''
        } else if (!isNaN(Number(val)) && val.trim() !== '') {
          updates[field] = Number(val)
        } else {
          try {
            updates[field] = JSON.parse(val)
          } catch {
            updates[field] = val
          }
        }
      }
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

  return (
    <div className="user-modal-overlay" onClick={onClose}>
      <div className="user-modal-content" onClick={e => e.stopPropagation()}>
        <button className="user-modal-close" onClick={onClose}>&times;</button>

        <h3 className="user-modal-title">Edit User</h3>

        {error && <div className="user-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="user-modal-form">
          {/* ────── Identity Section ────── */}
          <div className="user-modal-section">
            <div className="user-modal-section-header">Identity</div>

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
          </div>

          {/* ────── Permissions Section ────── */}
          <div className="user-modal-section">
            <div className="user-modal-section-header">Permissions</div>

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
          </div>

          {/* ────── XP & Stats Section ────── */}
          <div className="user-modal-section">
            <div className="user-modal-section-header">
              XP &amp; Stats
              <span className="user-modal-section-hint">Directly overwrite player progression values</span>
            </div>

            <div className="user-modal-field-row">
              {/* Editable: Total XP */}
              <div className="user-modal-field">
                <label className="user-modal-label" htmlFor="edit-totalXp">Total XP</label>
                <div className="user-modal-number-wrapper">
                  <span className="user-modal-number-icon">✦</span>
                  <input
                    id="edit-totalXp"
                    type="number"
                    min="0"
                    className="user-modal-input user-modal-input-number"
                    value={formData.totalXp}
                    onChange={(e) => handleChange('totalXp', e.target.value)}
                    disabled={isSaving}
                  />
                  <span className="user-modal-number-unit">XP</span>
                </div>
                <span className="user-modal-field-hint">
                  {user.totalXp != null ? `Currently ${Number(user.totalXp).toLocaleString()} XP` : 'No XP recorded'}
                </span>
              </div>

              {/* Editable: Games Played */}
              <div className="user-modal-field">
                <label className="user-modal-label" htmlFor="edit-gamesPlayed">Games Played</label>
                <div className="user-modal-number-wrapper">
                  <span className="user-modal-number-icon">🎮</span>
                  <input
                    id="edit-gamesPlayed"
                    type="number"
                    min="0"
                    className="user-modal-input user-modal-input-number"
                    value={formData.gamesPlayed}
                    onChange={(e) => handleChange('gamesPlayed', e.target.value)}
                    disabled={isSaving}
                  />
                  <span className="user-modal-number-unit">games</span>
                </div>
                <span className="user-modal-field-hint">
                  {user.gamesPlayed != null ? `Currently ${Number(user.gamesPlayed).toLocaleString()} games` : 'No games recorded'}
                </span>
              </div>
            </div>

            {/* Editable: Last Game At */}
            <div className="user-modal-field">
              <label className="user-modal-label" htmlFor="edit-lastGameAt">Last Game At</label>
              <input
                id="edit-lastGameAt"
                type="datetime-local"
                className="user-modal-input"
                value={formData.lastGameAt}
                onChange={(e) => handleChange('lastGameAt', e.target.value)}
                disabled={isSaving}
              />
              <span className="user-modal-field-hint">
                {user.lastGameAt ? `Currently ${formatDate(user.lastGameAt)}` : 'Never played'}
              </span>
            </div>
          </div>

          {/* ────── Timestamps Section ────── */}
          <div className="user-modal-section">
            <div className="user-modal-section-header">Timestamps</div>

            {/* Read-only: Created At */}
            <div className="user-modal-field">
              <label className="user-modal-label">Created</label>
              <span className="user-modal-value">{formatDate(user.createdAt)}</span>
            </div>
          </div>

          {/* ────── Extra/Dynamic Fields Section ────── */}
          {extraFields.length > 0 && (
            <div className="user-modal-section">
              <div className="user-modal-section-header">
                Other Fields
                <span className="user-modal-section-hint">Additional data stored on this user</span>
              </div>

              {extraFields.map(field => (
                <div className="user-modal-field" key={field}>
                  <label className="user-modal-label" htmlFor={`edit-extra-${field}`}>{field}</label>
                  <input
                    id={`edit-extra-${field}`}
                    type="text"
                    className="user-modal-input"
                    value={formData[field]}
                    onChange={(e) => handleChange(field, e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              ))}
            </div>
          )}

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
    </div>
  )
}

export default UserEditModal
