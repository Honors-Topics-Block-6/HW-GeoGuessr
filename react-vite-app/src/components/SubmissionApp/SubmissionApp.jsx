import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import SubmissionForm from './SubmissionForm'
import AdminTabs from './AdminTabs'
import './SubmissionApp.css'

function SubmissionApp({ onBack }) {
  const { isAdmin } = useAuth()
  const [adminScreen, setAdminScreen] = useState(null) // null | 'review' | 'mapEditor' | 'accounts'

  const handleAdminClick = () => {
    setAdminScreen('review')
  }

  const handleBackToSubmission = () => {
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
