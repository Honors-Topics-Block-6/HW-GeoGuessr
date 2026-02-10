import { useState } from 'react'
import './App.css'
import SubmissionForm from './components/SubmissionForm'
import AdminTabs from './components/AdminTabs'

function App() {
  const [adminScreen, setAdminScreen] = useState(null) // null | 'review' | 'mapEditor'
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const ADMIN_PASSWORD = '1234'

  const handleAdminClick = () => {
    if (isAuthenticated) {
      setAdminScreen('review')
    } else {
      setShowPasswordPrompt(true)
      setPasswordError('')
    }
  }

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      setAdminScreen('review')
      setShowPasswordPrompt(false)
      setPasswordInput('')
      setPasswordError('')
    } else {
      setPasswordError('Incorrect password')
      setPasswordInput('')
    }
  }

  const handleBackToSubmission = () => {
    setAdminScreen(null)
  }

  const handleCancelPassword = () => {
    setShowPasswordPrompt(false)
    setPasswordInput('')
    setPasswordError('')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Photo Submission App</h1>
        <button
          className="admin-button"
          onClick={handleAdminClick}
        >
          Admin
        </button>
      </header>

      {showPasswordPrompt && (
        <div className="password-modal-overlay">
          <div className="password-modal">
            <h2>Admin Access</h2>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                autoFocus
              />
              {passwordError && <p className="error">{passwordError}</p>}
              <div className="modal-buttons">
                <button type="submit">Submit</button>
                <button type="button" onClick={handleCancelPassword}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="app-main">
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

export default App
