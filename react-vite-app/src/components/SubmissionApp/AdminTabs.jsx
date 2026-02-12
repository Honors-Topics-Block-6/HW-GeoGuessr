import './AdminTabs.css'
import AdminReview from './AdminReview'
import MapEditor from './MapEditor'
import AccountManagement from './AccountManagement'

function AdminTabs({ activeTab, onTabChange, onBack }) {
  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Submission
        </button>
        <h2>Admin Panel</h2>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => onTabChange('review')}
        >
          Review Submissions
        </button>
        <button
          className={`admin-tab ${activeTab === 'mapEditor' ? 'active' : ''}`}
          onClick={() => onTabChange('mapEditor')}
        >
          Map Editor
        </button>
        <button
          className={`admin-tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => onTabChange('accounts')}
        >
          Manage Accounts
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'review' && <AdminReview />}
        {activeTab === 'mapEditor' && <MapEditor />}
        {activeTab === 'accounts' && <AccountManagement />}
      </div>
    </div>
  )
}

export default AdminTabs
