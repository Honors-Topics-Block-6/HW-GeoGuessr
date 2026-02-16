import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ADMIN_PERMISSIONS, PERMISSION_LABELS, getAllPermissions, getNoPermissions } from '../../services/userService'
import './PermissionsModal.css'

export interface PermissionsMap {
  [key: string]: boolean
}

export interface PermissionsUser {
  id: string
  username?: string
  permissions?: PermissionsMap
}

export interface PermissionsModalProps {
  user: PermissionsUser
  onSave: (uid: string, permissions: PermissionsMap) => Promise<void>
  onClose: () => void
  isSaving: boolean
}

function PermissionsModal({ user, onSave, onClose, isSaving }: PermissionsModalProps): React.JSX.Element {
  const allPermKeys: string[] = Object.values(ADMIN_PERMISSIONS)
  const currentPerms: PermissionsMap = user.permissions || {}

  const [permissions, setPermissions] = useState<PermissionsMap>(
    Object.fromEntries(
      allPermKeys.map(key => [key, !!currentPerms[key]])
    )
  )
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (permKey: string): void => {
    setPermissions(prev => ({ ...prev, [permKey]: !prev[permKey] }))
    setError(null)
  }

  const handleSelectAll = (): void => {
    setPermissions(getAllPermissions())
    setError(null)
  }

  const handleSelectNone = (): void => {
    setPermissions(getNoPermissions())
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)
    try {
      await onSave(user.id, permissions)
    } catch (err) {
      setError((err as Error).message || 'Failed to update permissions.')
    }
  }

  const grantedCount: number = Object.values(permissions).filter(Boolean).length
  const totalCount: number = allPermKeys.length

  return createPortal(
    <div className="perms-modal-overlay" onClick={onClose}>
      <div className="perms-modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="perms-modal-close" onClick={onClose}>&times;</button>

        <h3 className="perms-modal-title">
          Edit Permissions
        </h3>
        <p className="perms-modal-subtitle">
          {user.username || user.id}
          <span className="perms-modal-count">{grantedCount}/{totalCount} granted</span>
        </p>

        {error && <div className="perms-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="perms-modal-form">
          <div className="perms-modal-quick-actions">
            <button type="button" className="perms-quick-btn perms-select-all" onClick={handleSelectAll} disabled={isSaving}>
              Select All
            </button>
            <button type="button" className="perms-quick-btn perms-select-none" onClick={handleSelectNone} disabled={isSaving}>
              Select None
            </button>
          </div>

          <div className="perms-modal-list">
            {allPermKeys.map(permKey => (
              <label key={permKey} className="perms-modal-item">
                <input
                  type="checkbox"
                  checked={permissions[permKey]}
                  onChange={() => handleToggle(permKey)}
                  disabled={isSaving}
                />
                <span className="perms-modal-item-label">{PERMISSION_LABELS[permKey as keyof typeof PERMISSION_LABELS]}</span>
              </label>
            ))}
          </div>

          <div className="perms-modal-actions">
            <button
              type="submit"
              className="perms-modal-save"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Permissions'}
            </button>
            <button
              type="button"
              className="perms-modal-cancel"
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

export default PermissionsModal
