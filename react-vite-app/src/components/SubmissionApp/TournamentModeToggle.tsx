import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ADMIN_PERMISSIONS } from '../../services/userService'
import { subscribeTournamentMode, setTournamentMode } from '../../services/appSettingsService'
import './TournamentModeToggle.css'

function TournamentModeToggle(): React.JSX.Element | null {
  const { user, hasPermission } = useAuth()
  const [tournamentMode, setTournamentModeState] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [pendingValue, setPendingValue] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  useEffect(() => {
    const unsubscribe = subscribeTournamentMode((enabled) => {
      setTournamentModeState(enabled)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (!hasPermission(ADMIN_PERMISSIONS.MANAGE_TOURNAMENT)) {
    return null
  }

  const handleToggleClick = (): void => {
    setPendingValue(!tournamentMode)
    setShowConfirm(true)
  }

  const handleConfirm = async (): Promise<void> => {
    if (!user?.uid) return
    setIsSaving(true)
    try {
      await setTournamentMode(pendingValue, user.uid)
      setShowConfirm(false)
    } catch (error) {
      console.error('Error setting tournament mode:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = (): void => {
    setShowConfirm(false)
    setPendingValue(false)
  }

  if (loading) {
    return (
      <div className="tournament-toggle-container">
        <div className="tournament-toggle-loading">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <div className="tournament-toggle-container">
        <span className="tournament-toggle-label">Tournament Mode</span>
        <button
          className={`tournament-toggle-button ${tournamentMode ? 'active' : ''}`}
          onClick={handleToggleClick}
          disabled={isSaving}
        >
          <span className="tournament-toggle-indicator" />
          <span className="tournament-toggle-status">
            {tournamentMode ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {showConfirm && createPortal(
        <div className="tournament-confirm-overlay" onClick={handleCancel}>
          <div className="tournament-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tournament-confirm-title">
              {pendingValue ? 'Enable Tournament Mode?' : 'Disable Tournament Mode?'}
            </h3>
            <p className="tournament-confirm-message">
              {pendingValue
                ? 'Enabling tournament mode will restrict the game to only show tournament-approved images. Normal gameplay images will be hidden.'
                : 'Disabling tournament mode will restore normal gameplay with all approved images visible. Tournament-only images will be hidden.'}
            </p>
            <div className="tournament-confirm-actions">
              <button
                className="tournament-confirm-button"
                onClick={handleConfirm}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Confirm'}
              </button>
              <button
                className="tournament-cancel-button"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default TournamentModeToggle
