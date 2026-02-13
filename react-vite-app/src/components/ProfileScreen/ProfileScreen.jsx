import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './ProfileScreen.css';

function ProfileScreen({ onBack }) {
  const { user, userDoc, updateUsername, totalXp, levelInfo, levelTitle } = useAuth();

  const [newUsername, setNewUsername] = useState(userDoc?.username || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setError('');
    setSuccess('');

    const trimmed = newUsername.trim();
    if (!trimmed) {
      setError('Username cannot be empty.');
      return;
    }
    if (trimmed.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (trimmed === userDoc?.username) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateUsername(trimmed);
      setSuccess('Username updated successfully!');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update username.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNewUsername(userDoc?.username || '');
    setIsEditing(false);
    setError('');
  };

  const progressPercent = Math.round(levelInfo.progress * 100);
  const gamesPlayed = userDoc?.gamesPlayed ?? 0;

  return (
    <div className="profile-screen">
      <div className="profile-background">
        <div className="profile-overlay"></div>
      </div>
      <div className="profile-card">
        <button className="profile-back-button" onClick={onBack}>
          ← Back
        </button>

        <div className="profile-avatar">
          <span className="profile-avatar-icon">👤</span>
        </div>

        <h1 className="profile-title">Your Profile</h1>

        {error && <div className="profile-error">{error}</div>}
        {success && <div className="profile-success">{success}</div>}

        {/* ── Level & XP Section ── */}
        <div className="profile-level-section">
          <div className="profile-level-header">
            <span className="profile-level-badge">Lvl {levelInfo.level}</span>
            <span className="profile-level-title">{levelTitle}</span>
          </div>

          <div className="profile-xp-bar-container">
            <div className="profile-xp-bar">
              <div
                className="profile-xp-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="profile-xp-bar-labels">
              <span className="profile-xp-current">
                {levelInfo.xpIntoLevel.toLocaleString()} XP
              </span>
              <span className="profile-xp-needed">
                {levelInfo.currentLevelXp.toLocaleString()} XP
              </span>
            </div>
          </div>

          <div className="profile-xp-stats">
            <div className="profile-xp-stat">
              <span className="profile-xp-stat-value">{totalXp.toLocaleString()}</span>
              <span className="profile-xp-stat-label">Total XP</span>
            </div>
            <div className="profile-xp-stat">
              <span className="profile-xp-stat-value">{gamesPlayed}</span>
              <span className="profile-xp-stat-label">Games Played</span>
            </div>
            <div className="profile-xp-stat">
              <span className="profile-xp-stat-value">{levelInfo.xpToNextLevel.toLocaleString()}</span>
              <span className="profile-xp-stat-label">XP to Next Level</span>
            </div>
          </div>
        </div>

        <div className="profile-fields">
          <div className="profile-field">
            <span className="profile-label">Username</span>
            {isEditing ? (
              <div className="profile-edit-row">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="profile-input"
                  autoFocus
                  disabled={isSaving}
                />
                <button
                  className="profile-save-button"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="profile-cancel-button"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="profile-value-row">
                <span className="profile-value">{userDoc?.username}</span>
                <button
                  className="profile-edit-button"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          <div className="profile-field">
            <span className="profile-label">Email</span>
            <span className="profile-value">{user?.email}</span>
          </div>

          <div className="profile-field">
            <span className="profile-label">Member Since</span>
            <span className="profile-value">
              {userDoc?.createdAt?.toDate
                ? userDoc.createdAt.toDate().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileScreen;
