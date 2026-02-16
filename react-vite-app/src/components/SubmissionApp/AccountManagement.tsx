import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getAllUsers, setUserAdmin, isHardcodedAdmin, updateUserProfile, updateUserPermissions, ADMIN_PERMISSIONS } from '../../services/userService'
import type { UserDocWithId, PermissionsMap } from '../../services/userService'
import { subscribeToAllPresence } from '../../services/presenceService'
import type { PresenceData, PresenceMap } from '../../services/presenceService'
import UserEditModal from './UserEditModal'
import SendMessageModal from './SendMessageModal'
import SendMessageAllModal from './SendMessageAllModal'
import PermissionsModal from './PermissionsModal'
import './AccountManagement.css'

export type UserAccount = UserDocWithId

export interface AccountManagementProps {}

function AccountManagement(_props: AccountManagementProps): React.JSX.Element {
  const { user, userDoc, hasPermission } = useAuth()
  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingUid, setUpdatingUid] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null)
  const [savingEdit, setSavingEdit] = useState<boolean>(false)
  const [presenceMap, setPresenceMap] = useState<PresenceMap>({} as PresenceMap)
  const [messagingUser, setMessagingUser] = useState<UserAccount | null>(null)
  const [permissionsUser, setPermissionsUser] = useState<UserAccount | null>(null)
  const [savingPermissions, setSavingPermissions] = useState<boolean>(false)
  const [showMessageAll, setShowMessageAll] = useState<boolean>(false)

  const _canViewAccounts: boolean = hasPermission(ADMIN_PERMISSIONS.VIEW_ACCOUNTS)
  const canEditAccounts: boolean = hasPermission(ADMIN_PERMISSIONS.EDIT_ACCOUNTS)
  const canMessageAccounts: boolean = hasPermission(ADMIN_PERMISSIONS.MESSAGE_ACCOUNTS)
  const canManageAdmins: boolean = hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS)

  const fetchUsers = async (): Promise<void> => {
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
    const unsubscribe = subscribeToAllPresence((data: PresenceMap) => {
      setPresenceMap(data)
    })
    return () => unsubscribe()
  }, [])

  // Determine if a user is online (online flag + lastSeen within 2 minutes)
  const isUserOnline = (uid: string): boolean => {
    const presence = presenceMap[uid]
    if (!presence || !presence.online) return false
    if (!presence.lastSeen) return false
    const lastSeen = presence.lastSeen as { toDate?: () => Date }
    const date = lastSeen.toDate ? lastSeen.toDate() : new Date()
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    return date > twoMinutesAgo
  }

  const handleToggleAdmin = async (uid: string, currentIsAdmin: boolean): Promise<void> => {
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
      setError((err as Error).message || 'Failed to update admin status.')
    } finally {
      setUpdatingUid(null)
    }
  }

  const handleSaveUser = async (uid: string, updates: Record<string, unknown>): Promise<void> => {
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

  const handleSavePermissions = async (uid: string, newPermissions: Record<string, boolean>): Promise<void> => {
    setSavingPermissions(true)
    try {
      await updateUserPermissions(uid, newPermissions as PermissionsMap)
      // Update local state to reflect changes
      setUsers(prev =>
        prev.map(u =>
          u.id === uid ? { ...u, permissions: newPermissions as PermissionsMap } : u
        )
      )
      setPermissionsUser(null)
      setError(null)
    } catch (err) {
      console.error('Error updating permissions:', err)
      setError((err as Error).message || 'Failed to update permissions.')
    } finally {
      setSavingPermissions(false)
    }
  }

  const formatDate = (timestamp: unknown): string => {
    if (!timestamp) return 'N/A'
    const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? (timestamp as { toDate: () => Date }).toDate()
      : new Date(timestamp as string)
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
              {canManageAdmins && <th>Permissions</th>}
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
                    {u.username || '\u2014'}
                    {hardcoded && <span className="permanent-badge">Permanent</span>}
                  </td>
                  <td className="uid-cell">{u.id}</td>
                  <td>{u.email || '\u2014'}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <span className={`admin-status ${u.isAdmin ? 'is-admin' : 'not-admin'}`}>
                      {u.isAdmin ? 'Yes' : 'No'}
                    </span>
                  </td>
                  {canManageAdmins && (
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
                              {!hardcoded && (
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
                        <span className="permissions-na">{'\u2014'}</span>
                      )}
                    </td>
                  )}
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
                    {online ? (presenceMap[u.id]?.currentActivity || '\u2014') : '\u2014'}
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
                          onClick={() => handleToggleAdmin(u.id, u.isAdmin ?? false)}
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
