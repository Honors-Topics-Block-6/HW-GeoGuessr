import { useState, type ChangeEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { formatLastActive } from '../../utils/formatLastActive';
import './ProfileScreen.css';

export interface ProfileScreenProps {
  onBack: () => void;
  onOpenFriends: () => void;
}

function ProfileScreen({ onBack, onOpenFriends }: ProfileScreenProps): React.ReactElement {
  const {
    user,
    userDoc,
    updateUsername,
    updateProfileImage,
    totalXp,
    levelInfo,
    levelTitle,
    emailVerified
  } = useAuth();

  const [newUsername, setNewUsername] = useState<string>(userDoc?.username || '');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset input so selecting the same file again still triggers onChange.
    e.target.value = '';
    if (!file) return;

    setError('');
    setSuccess('');

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      await updateProfileImage(file);
      setSuccess('Profile picture updated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError((err as Error).message || 'Failed to upload profile image.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async (): Promise<void> => {
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
      setError((err as Error).message || 'Failed to update username.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = (): void => {
    setNewUsername(userDoc?.username || '');
    setIsEditing(false);
    setError('');
  };

  const progressPercent: number = Math.round(levelInfo.progress * 100);
  const gamesPlayed: number = userDoc?.gamesPlayed ?? 0;

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
          {userDoc?.photoURL ? (
            <img
              className="profile-avatar-image"
              src={userDoc.photoURL}
              alt={`${userDoc.username}'s profile`}
            />
          ) : (
            <span className="profile-avatar-icon">👤</span>
          )}
          <label className={`profile-photo-upload ${isUploadingPhoto ? 'disabled' : ''}`}>
            {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={isUploadingPhoto}
            />
          </label>
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
            <span className="profile-label">Last Active</span>
            <span className="profile-value">{formatLastActive(userDoc?.lastActive)}</span>
          </div>

          <div className="profile-field">
            <span className="profile-label">Username</span>
            {isEditing ? (
              <div className="profile-edit-row">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value)}
                  className="profile-input"
                  autoFocus
                  disabled={isSaving}
                />
                <div className="profile-username-note">
                  Changing your username is allowed once every 30 days.
                </div>
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
            <div className="profile-value-row">
              <span className="profile-value">{user?.email}</span>
              <span className={`profile-verification-badge ${emailVerified ? 'verified' : 'unverified'}`}>
                {emailVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
          </div>

          <div className="profile-field">
            <span className="profile-label">Friends</span>
            <div className="profile-value-row">
              <span className="profile-value">View and manage your friends</span>
              <button
                className="profile-friends-button"
                onClick={onOpenFriends}
              >
                Friends
              </button>
            </div>
          </div>

          <div className="profile-field">
            <span className="profile-label">Member Since</span>
            <span className="profile-value">
              {userDoc?.createdAt && typeof userDoc.createdAt === 'object' && 'toDate' in (userDoc.createdAt as object)
                ? (userDoc.createdAt as { toDate: () => Date }).toDate().toLocaleDateString('en-US', {
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
