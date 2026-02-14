import './AdminTabs.css'
import { useAuth } from '../../contexts/AuthContext'
import { ADMIN_PERMISSIONS } from '../../services/userService'
import AdminReview from './AdminReview'
import MapEditor from './MapEditor'
import AccountManagement from './AccountManagement'
import FriendsManagement from './FriendsManagement'
import BugReportManagement from './BugReportManagement'

function AdminTabs({ activeTab, onTabChange, onBack }) {
  const { hasPermission } = useAuth()

  // Define which permissions gate each tab
  const tabs = [
    {
      key: 'review',
      label: 'Review Submissions',
      // Visible if user can review submissions OR delete photos
      visible: hasPermission(ADMIN_PERMISSIONS.REVIEW_SUBMISSIONS) || hasPermission(ADMIN_PERMISSIONS.DELETE_PHOTOS),
    },
    {
      key: 'mapEditor',
      label: 'Map Editor',
      visible: hasPermission(ADMIN_PERMISSIONS.EDIT_MAP),
    },
    {
      key: 'accounts',
      label: 'Manage Accounts',
      // Visible if user can view, edit, message accounts, or manage admins
      visible:
        hasPermission(ADMIN_PERMISSIONS.VIEW_ACCOUNTS) ||
        hasPermission(ADMIN_PERMISSIONS.EDIT_ACCOUNTS) ||
        hasPermission(ADMIN_PERMISSIONS.MESSAGE_ACCOUNTS) ||
        hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS),
    },
    {
      key: 'friends',
      label: 'Friends & Chat',
      visible: hasPermission(ADMIN_PERMISSIONS.MANAGE_FRIENDS_CHATS),
    },
    {
      key: 'bugReports',
      label: 'Bug Reports',
      visible: hasPermission(ADMIN_PERMISSIONS.MANAGE_BUG_REPORTS),
    },
  ]

  const visibleTabs = tabs.filter(t => t.visible)

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Submission
        </button>
        <h2>Admin Panel</h2>
      </div>

      <div className="admin-tabs">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            className={`admin-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {activeTab === 'review' && (hasPermission(ADMIN_PERMISSIONS.REVIEW_SUBMISSIONS) || hasPermission(ADMIN_PERMISSIONS.DELETE_PHOTOS)) && <AdminReview />}
        {activeTab === 'mapEditor' && hasPermission(ADMIN_PERMISSIONS.EDIT_MAP) && <MapEditor />}
        {activeTab === 'accounts' && (hasPermission(ADMIN_PERMISSIONS.VIEW_ACCOUNTS) || hasPermission(ADMIN_PERMISSIONS.EDIT_ACCOUNTS) || hasPermission(ADMIN_PERMISSIONS.MESSAGE_ACCOUNTS) || hasPermission(ADMIN_PERMISSIONS.MANAGE_ADMINS)) && <AccountManagement />}
        {activeTab === 'friends' && hasPermission(ADMIN_PERMISSIONS.MANAGE_FRIENDS_CHATS) && <FriendsManagement />}
        {activeTab === 'bugReports' && hasPermission(ADMIN_PERMISSIONS.MANAGE_BUG_REPORTS) && <BugReportManagement />}
      </div>
    </div>
  )
}

export default AdminTabs
