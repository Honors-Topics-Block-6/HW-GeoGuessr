import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getAllUsers, setUserAdmin, isHardcodedAdmin, updateUserProfile, updateUserPermissions, ADMIN_PERMISSIONS } from '../../services/userService'
import { subscribeToAllPresence } from '../../services/presenceService'
import UserEditModal from './UserEditModal'
import SendMessageModal from './SendMessageModal'
import SendMessageAllModal from './SendMessageAllModal'
import PermissionsModal from './PermissionsModal'
import './AccountManagement.css'

function AccountManagement() {
  const { user, userDoc, hasPermission } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatingUid, setUpdatingUid] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [presenceMap, setPresenceMap] = useState({})
  const [messagingUser, setMessagingUser] = useState(null)
  const [permissionsUser, setPermissionsUser] = useState(null)
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [showMessageAll, setShowMessageAll] = useState(false)

  const canViewAccounts = hasPermission(ADMIN_PERMISSIONS.VIEW_ACCOUNTS)
  const canEditAccounts = hasPermission(ADMIN_PERMISSIONS.EDIT_ACCOUNTS)
  const canMessageAccounts = hasPermission(ADMIN_PERMISSIONS.MESSAGE_ACCOUNTS)
  const canManageAdmins = hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS)

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const allUsers = await getAllUsers()
      setUsers(allUsers)
      setError(null)
    } catch (err) {
      console.error('Error fetching users:', err)
      setError('Failed to load user accounts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Subscribe to real-time presence data
  useEffect(() => {
    const unsubscribe = subscribeToAllPresence((data) => {
      setPresenceMap(data)
    })
    return () => unsubscribe()
  }, [])

  // Determine if a user is online (online flag + lastSeen within 2 minutes)
  const isUserOnline = (uid) => {
    const presence = presenceMap[uid]
    if (!presence || !presence.online) return false
    if (!presence.lastSeen) return false
    const lastSeen = presence.lastSeen.toDate ? presence.lastSeen.toDate() : new Date(presence.lastSeen)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    return lastSeen > twoMinutesAgo
  }

  const handleToggleAdmin = async (uid, currentIsAdmin) => {
    try {
      setUpdatingUid(uid)
      await setUserAdmin(uid, !currentIsAdmin)
      // Update local state
      setUsers(prev =>
        prev.map(u =>
          u.id === uid ? { ...u, isAdmin: !currentIsAdmin } : u
        )
      )
      setError(null)
    } catch (err) {
      console.error('Error updating admin status:', err)
      setError(err.message || 'Failed to update admin status.')
    } finally {
      setUpdatingUid(null)
    }
  }

  const handleSaveUser = async (uid, updates) => {
    setSavingEdit(true)
    try {
      await updateUserProfile(uid, updates)
      // Update local state to reflect changes
      setUsers(prev =>
        prev.map(u =>
          u.id === uid ? { ...u, ...updates } : u
        )
      )
      setEditingUser(null)
      setError(null)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleSavePermissions = async (uid, newPermissions) => {
    setSavingPermissions(true)
    try {
      await updateUserPermissions(uid, newPermissions)
      // Update local state to reflect changes
      setUsers(prev =>
        prev.map(u =>
          u.id === uid ? { ...u, permissions: newPermissions } : u
        )
      )
      setPermissionsUser(null)
      setError(null)
    } catch (err) {
      console.error('Error updating permissions:', err)
      setError(err.message || 'Failed to update permissions.')
    } finally {
      setSavingPermissions(false)
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="account-management">
        <div className="loading">Loading accounts...</div>
      </div>
    )
  }

  return (
    <div className="account-management">
      <div className="account-management-header">
        <h3>User Accounts</h3>
        <span className="account-count">{users.length} account{users.length !== 1 ? 's' : ''}</span>
        {canMessageAccounts && (
          <button
            className="message-all-button"
            onClick={() => setShowMessageAll(true)}
          >
            Message All
          </button>
        )}
      </div>

      {error && <div className="account-error">{error}</div>}

      <div className="accounts-table-wrapper">
        <table className="accounts-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>UID</th>
              <th>Email</th>
              <th>Created</th>
              <th>Admin</th>
              <th>Permissions</th>
              <th>Verified</th>
              <th>Status</th>
              <th>Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const hardcoded = isHardcodedAdmin(u.id)
              const online = isUserOnline(u.id)
              return (
                <tr key={u.id} className={u.isAdmin ? 'admin-row' : ''}>
                  <td className="username-cell">
                    {u.username || '—'}
                    {hardcoded && <span className="permanent-badge">Permanent</span>}
                  </td>
                  <td className="uid-cell">{u.id}</td>
                  <td>{u.email || '—'}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <span className={`admin-status ${u.isAdmin ? 'is-admin' : 'not-admin'}`}>
                      {u.isAdmin ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="permissions-cell">
                    {u.isAdmin ? (
                      (() => {
                        const perms = u.permissions || {}
                        const grantedCount = Object.values(perms).filter(Boolean).length
                        const totalCount = Object.keys(ADMIN_PERMISSIONS).length
                        return (
                          <span className="permissions-summary">
                            <span className={`permissions-count ${grantedCount === totalCount ? 'all-perms' : grantedCount > 0 ? 'some-perms' : 'no-perms'}`}>
                              {grantedCount}/{totalCount}
                            </span>
                            {canManageAdmins && !hardcoded && (
                              <button
                                className="permissions-edit-button"
                                onClick={() => setPermissionsUser(u)}
                              >
                                Edit
                              </button>
                            )}
                            {hardcoded && <span className="permissions-locked">All</span>}
                          </span>
                        )
                      })()
                    ) : (
                      <span className="permissions-na">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`verified-status ${u.emailVerified ? 'is-verified' : 'not-verified'}`}>
                      {u.emailVerified ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    <span className={`online-indicator ${online ? 'online' : 'offline'}`}>
                      <span className="online-dot"></span>
                      {online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="activity-cell">
                    {online ? (presenceMap[u.id]?.currentActivity || '—') : '—'}
                  </td>
                  <td className="actions-cell">
                    {canEditAccounts && (
                      <button
                        className="edit-user-button"
                        onClick={() => setEditingUser(u)}
                      >
                        Edit
                      </button>
                    )}
                    {canMessageAccounts && (
                      <button
                        className="send-msg-button"
                        onClick={() => setMessagingUser(u)}
                      >
                        Message
                      </button>
                    )}
                    {canManageAdmins && (
                      hardcoded ? (
                        <span className="action-locked">Always Admin</span>
                      ) : (
                        <button
                          className={`toggle-admin-button ${u.isAdmin ? 'revoke' : 'grant'}`}
                          onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                          disabled={updatingUid === u.id}
                        >
                          {updatingUid === u.id
                            ? 'Updating...'
                            : u.isAdmin
                              ? 'Revoke Admin'
                              : 'Make Admin'}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <UserEditModal
          user={editingUser}
          onSave={handleSaveUser}
          onClose={() => setEditingUser(null)}
          isSaving={savingEdit}
        />
      )}

      {messagingUser && (
        <SendMessageModal
          recipientUser={messagingUser}
          onClose={() => setMessagingUser(null)}
          senderUid={user?.uid}
          senderUsername={userDoc?.username || 'Admin'}
        />
      )}

      {showMessageAll && (
        <SendMessageAllModal
          users={users}
          onClose={() => setShowMessageAll(false)}
          currentUid={user?.uid}
          currentUsername={userDoc?.username || 'Admin'}
        />
      )}

      {permissionsUser && (
        <PermissionsModal
          user={permissionsUser}
          onSave={handleSavePermissions}
          onClose={() => setPermissionsUser(null)}
          isSaving={savingPermissions}
        />
      )}
    </div>
  )
}

export default AccountManagement
