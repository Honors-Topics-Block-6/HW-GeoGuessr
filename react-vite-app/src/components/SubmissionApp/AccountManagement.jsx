import { useState, useEffect } from 'react'
import { getAllUsers, setUserAdmin, isHardcodedAdmin } from '../../services/userService'
import './AccountManagement.css'

function AccountManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatingUid, setUpdatingUid] = useState(null)

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
      </div>

      {error && <div className="account-error">{error}</div>}

      <div className="accounts-table-wrapper">
        <table className="accounts-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Created</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const hardcoded = isHardcodedAdmin(user.id)
              return (
                <tr key={user.id} className={user.isAdmin ? 'admin-row' : ''}>
                  <td className="username-cell">
                    {user.username || '—'}
                    {hardcoded && <span className="permanent-badge">Permanent</span>}
                  </td>
                  <td>{user.email || '—'}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <span className={`admin-status ${user.isAdmin ? 'is-admin' : 'not-admin'}`}>
                      {user.isAdmin ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    {hardcoded ? (
                      <span className="action-locked">Always Admin</span>
                    ) : (
                      <button
                        className={`toggle-admin-button ${user.isAdmin ? 'revoke' : 'grant'}`}
                        onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                        disabled={updatingUid === user.id}
                      >
                        {updatingUid === user.id
                          ? 'Updating...'
                          : user.isAdmin
                            ? 'Revoke Admin'
                            : 'Make Admin'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AccountManagement
