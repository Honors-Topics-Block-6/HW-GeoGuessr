import './AdminTabs.css'
import AdminReview from './AdminReview'
import MapEditor from './MapEditor'
import AccountManagement from './AccountManagement'
import FriendsManagement from './FriendsManagement'
import BugReportManagement from './BugReportManagement'

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
        <button
          className={`admin-tab ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => onTabChange('friends')}
        >
          Friends &amp; Chat
        </button>
        <button
          className={`admin-tab ${activeTab === 'bugReports' ? 'active' : ''}`}
          onClick={() => onTabChange('bugReports')}
        >
          Bug Reports
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'review' && <AdminReview />}
        {activeTab === 'mapEditor' && <MapEditor />}
        {activeTab === 'accounts' && <AccountManagement />}
        {activeTab === 'friends' && <FriendsManagement />}
        {activeTab === 'bugReports' && <BugReportManagement />}
      </div>
    </div>
  )
}

export default AdminTabs
