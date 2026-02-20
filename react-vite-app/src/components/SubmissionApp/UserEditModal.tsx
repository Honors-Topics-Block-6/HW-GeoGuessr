import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { isHardcodedAdmin } from '../../services/userService'
import type { UserDocWithId } from '../../services/userService'
import { getUserFriendships, getUserFriendRequests, adminRemoveFriend } from '../../services/friendService'
import type { FriendDoc, FriendRequestDoc } from '../../services/friendService'
import './UserEditModal.css'

export type UserFriend = FriendDoc
export type FriendRequest = FriendRequestDoc
export type EditableUser = UserDocWithId

export interface UserEditModalProps {
  user: EditableUser
  onSave: (uid: string, updates: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isSaving: boolean
}

interface FormData {
  username: string
  email: string
  isAdmin: boolean
  emailVerified: boolean
  totalXp: number | string
  gamesPlayed: number | string
  lastGameAt: string
  [key: string]: string | number | boolean
}

function UserEditModal({ user, onSave, onClose, isSaving }: UserEditModalProps): React.JSX.Element {
  // Known fields we render explicitly with nice UI
  const knownFields: string[] = ['uid', 'id', 'email', 'username', 'isAdmin', 'emailVerified', 'verified', 'createdAt', 'lastActive', 'totalXp', 'gamesPlayed', 'lastGameAt', 'permissions']

  // Extra/dynamic fields beyond the known set
  const extraFields: string[] = Object.keys(user).filter(
    key => !knownFields.includes(key)
  )

  const toDatetimeLocal = (timestamp: unknown): string => {
    if (!timestamp) return ''
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? (timestamp as { toDate: () => Date }).toDate()
      : new Date(timestamp as string)
    if (isNaN(date.getTime())) return ''
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const [userFriends, setUserFriends] = useState<UserFriend[]>([])
  const [userFriendRequests, setUserFriendRequests] = useState<FriendRequest[]>([])
  const [friendsLoading, setFriendsLoading] = useState<boolean>(true)
  const [removingFriend, setRemovingFriend] = useState<string | null>(null)

  // Fetch friends and requests for this user
  useEffect(() => {
    let cancelled = false
    const fetchFriendData = async (): Promise<void> => {
      setFriendsLoading(true)
      try {
        const [friends, requests] = await Promise.all([
          getUserFriendships(user.id),
          getUserFriendRequests(user.id)
        ])
        if (!cancelled) {
          setUserFriends(friends as UserFriend[])
          setUserFriendRequests(requests as FriendRequest[])
        }
      } catch (err) {
        console.error('Failed to load friend data:', err)
      } finally {
        if (!cancelled) setFriendsLoading(false)
      }
    }
    fetchFriendData()
    return () => { cancelled = true }
  }, [user.id])

  const handleRemoveFriend = async (friendUid: string): Promise<void> => {
    setRemovingFriend(friendUid)
    try {
      await adminRemoveFriend(user.id, friendUid)
      setUserFriends(prev => prev.filter(f => f.friendUid !== friendUid))
    } catch (err) {
      console.error('Failed to remove friend:', err)
    } finally {
      setRemovingFriend(null)
    }
  }

  const [formData, setFormData] = useState<FormData>({
    username: user.username || '',
    email: user.email || '',
    isAdmin: user.isAdmin || false,
    emailVerified: user.emailVerified || false,
    totalXp: user.totalXp ?? 0,
    gamesPlayed: user.gamesPlayed ?? 0,
    lastGameAt: toDatetimeLocal(user.lastGameAt),
    // Initialize extra fields
    ...Object.fromEntries(
      extraFields.map(key => {
        const val = (user as unknown as Record<string, unknown>)[key]
        return [key, typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')]
      })
    ),
  })
  const [error, setError] = useState<string | null>(null)

  const hardcoded: boolean = isHardcodedAdmin(user.id)

  const handleChange = (field: string, value: string | number | boolean): void => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)

    // Build updates object with only changed fields
    const updates: Record<string, unknown> = {}

    if (formData.username !== (user.username || '')) {
      updates.username = formData.username
    }
    if (formData.email !== (user.email || '')) {
      updates.email = formData.email
    }
    if (formData.isAdmin !== (user.isAdmin || false)) {
      updates.isAdmin = formData.isAdmin
    }
    if (formData.emailVerified !== (user.emailVerified || false)) {
      updates.emailVerified = formData.emailVerified
    }

    // XP & Stats -- compare numerically
    const newTotalXp = Number(formData.totalXp)
    if (!isNaN(newTotalXp) && newTotalXp !== (user.totalXp ?? 0)) {
      updates.totalXp = newTotalXp
    }
    const newGamesPlayed = Number(formData.gamesPlayed)
    if (!isNaN(newGamesPlayed) && newGamesPlayed !== (user.gamesPlayed ?? 0)) {
      updates.gamesPlayed = newGamesPlayed
    }

    // lastGameAt -- compare as date
    if (formData.lastGameAt) {
      const newDate = new Date(formData.lastGameAt)
      const oldTimestamp = user.lastGameAt
      const oldDate = oldTimestamp
        ? (typeof oldTimestamp === 'object' && oldTimestamp !== null && 'toDate' in oldTimestamp
          ? (oldTimestamp as { toDate: () => Date }).toDate()
          : new Date(oldTimestamp as string))
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
      const userVal = (user as unknown as Record<string, unknown>)[field]
      const original = typeof userVal === 'object'
        ? JSON.stringify(userVal)
        : String(userVal ?? '')
      if (formData[field] !== original) {
        // Try to parse back to number or JSON if applicable
        const val = formData[field] as string
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

    // Nothing changed -- just close
    if (Object.keys(updates).length === 0) {
      onClose()
      return
    }

    try {
      await onSave(user.id, updates)
    } catch (err) {
      setError((err as Error).message || 'Failed to update user.')
    }
  }

  const formatDate = (timestamp: unknown): string => {
    if (!timestamp) return 'N/A'
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? (timestamp as { toDate: () => Date }).toDate()
      : new Date(timestamp as string)
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
      <div className="user-modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="user-modal-close" onClick={onClose}>&times;</button>

        <h3 className="user-modal-title">Edit User</h3>

        {error && <div className="user-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="user-modal-form">
          {/* Identity Section */}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('username', e.target.value)}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('email', e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Permissions Section */}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('isAdmin', e.target.checked)}
                    disabled={isSaving}
                  />
                  <span>{formData.isAdmin ? 'Admin' : 'Not Admin'}</span>
                </label>
              )}
            </div>

            {/* Editable: Email Verified toggle */}
            <div className="user-modal-field">
              <label className="user-modal-label">Email Verified</label>
              <label className="user-modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.emailVerified}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('emailVerified', e.target.checked)}
                  disabled={isSaving}
                />
                <span>{formData.emailVerified ? 'Verified' : 'Not Verified'}</span>
              </label>
            </div>
          </div>

          {/* XP & Stats Section */}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('totalXp', e.target.value)}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('gamesPlayed', e.target.value)}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('lastGameAt', e.target.value)}
                disabled={isSaving}
              />
              <span className="user-modal-field-hint">
                {user.lastGameAt ? `Currently ${formatDate(user.lastGameAt)}` : 'Never played'}
              </span>
            </div>
          </div>

          {/* Timestamps Section */}
          <div className="user-modal-section">
            <div className="user-modal-section-header">Timestamps</div>

            {/* Read-only: Created At */}
            <div className="user-modal-field">
              <label className="user-modal-label">Created</label>
              <span className="user-modal-value">{formatDate(user.createdAt)}</span>
            </div>

            {/* Read-only: Last Active */}
            <div className="user-modal-field">
              <label className="user-modal-label">Last Active</label>
              <span className="user-modal-value">
                {user.lastActive ? formatDate(user.lastActive) : 'No activity yet'}
              </span>
            </div>
          </div>

          {/* Friends Section */}
          <div className="user-modal-section">
            <div className="user-modal-section-header">
              Friends
              <span className="user-modal-section-hint">
                {friendsLoading ? 'Loading...' : `${userFriends.length} friend${userFriends.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {!friendsLoading && userFriends.length === 0 ? (
              <div className="user-modal-value" style={{ fontStyle: 'italic', color: '#6b7280' }}>No friends</div>
            ) : (
              <div className="user-modal-friends-list">
                {userFriends.map(f => (
                  <div key={f.friendUid} className="user-modal-friend-item">
                    <span className="user-modal-friend-name">{f.friendUsername}</span>
                    <span className="user-modal-friend-uid">{f.friendUid}</span>
                    <button
                      type="button"
                      className="user-modal-friend-remove"
                      onClick={() => handleRemoveFriend(f.friendUid)}
                      disabled={removingFriend === f.friendUid}
                    >
                      {removingFriend === f.friendUid ? '...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending requests */}
            {!friendsLoading && userFriendRequests.filter(r => r.status === 'pending').length > 0 && (
              <>
                <div className="user-modal-label" style={{ marginTop: '12px' }}>Pending Requests</div>
                <div className="user-modal-friends-list">
                  {userFriendRequests.filter(r => r.status === 'pending').map(req => (
                    <div key={req.id} className="user-modal-friend-item">
                      <span className="user-modal-friend-name">
                        {req.direction === 'incoming' ? req.fromUsername : req.toUsername}
                      </span>
                      <span className="user-modal-friend-uid">
                        {req.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Extra/Dynamic Fields Section */}
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
                    value={formData[field] as string}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(field, e.target.value)}
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
    </div>,
    document.body
  )
}

export default UserEditModal
