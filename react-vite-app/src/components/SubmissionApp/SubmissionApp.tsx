import { useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { ADMIN_PERMISSIONS } from '../../services/userService'
import SubmissionForm from './SubmissionForm'
import AdminTabs from './AdminTabs'
import type { AdminTabKey } from './AdminTabs'
import './SubmissionApp.css'

export interface SubmissionAppProps {
  onBack: () => void
}

function SubmissionApp({ onBack }: SubmissionAppProps): React.JSX.Element {
  const { isAdmin, hasPermission } = useAuth()
  const [adminScreen, setAdminScreen] = useState<AdminTabKey | null>(null)

  // Determine the first visible tab to land on when entering admin panel
  const firstVisibleTab = useMemo((): AdminTabKey => {
    if (hasPermission(ADMIN_PERMISSIONS.REVIEW_SUBMISSIONS) || hasPermission(ADMIN_PERMISSIONS.DELETE_PHOTOS)) return 'review'
    if (hasPermission(ADMIN_PERMISSIONS.EDIT_MAP)) return 'mapEditor'
    if (hasPermission(ADMIN_PERMISSIONS.VIEW_ACCOUNTS) || hasPermission(ADMIN_PERMISSIONS.EDIT_ACCOUNTS) || hasPermission(ADMIN_PERMISSIONS.MESSAGE_ACCOUNTS) || hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS)) return 'accounts'
    if (hasPermission(ADMIN_PERMISSIONS.MANAGE_FRIENDS_CHATS)) return 'friends'
    if (hasPermission(ADMIN_PERMISSIONS.MANAGE_BUG_REPORTS)) return 'bugReports'
    return 'review' // fallback
  }, [hasPermission])

  const handleAdminClick = (): void => {
    setAdminScreen(firstVisibleTab)
  }

  const handleBackToSubmission = (): void => {
    setAdminScreen(null)
  }

  return (
    <div className="submission-app">
      <header className="submission-app-header">
        <button className="back-to-game-button" onClick={onBack}>
          ← Back to Game
        </button>
        <h1>Photo Submission</h1>
        {isAdmin ? (
          <button
            className="review-button"
            onClick={handleAdminClick}
          >
            Admin
          </button>
        ) : (
          <div className="header-spacer" />
        )}
      </header>

      <main className="submission-app-main">
        {adminScreen ? (
          <AdminTabs
            activeTab={adminScreen}
            onTabChange={setAdminScreen}
            onBack={handleBackToSubmission}
          />
        ) : (
          <SubmissionForm />
        )}
      </main>
    </div>
  )
}

export default SubmissionApp
