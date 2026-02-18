import { useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { compressImage } from '../../utils/compressImage';
import './ProfileScreen.css';

export interface ProfileScreenProps {
  onBack: () => void;
  onOpenFriends: () => void;
}

function ProfileScreen({ onBack, onOpenFriends }: ProfileScreenProps): React.ReactElement {
  const { user, userDoc, updateUsername, updateAvatarURL, totalXp, levelInfo, levelTitle, emailVerified } = useAuth();

  const [newUsername, setNewUsername] = useState<string>(userDoc?.username || '');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAvatarSaving, setIsAvatarSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const clearAvatarInput = (): void => {
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleChooseAvatar = (): void => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    setError('');
    setSuccess('');

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      clearAvatarInput();
      return;
    }

    // Keep this conservative: storing as Base64 in Firestore can get large.
    // (We still compress further below to keep it small.)
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError('Please choose an image smaller than 10MB.');
      clearAvatarInput();
      return;
    }

    setIsAvatarSaving(true);
    try {
      const avatarURL = await compressImage(file, { maxWidth: 256, maxHeight: 256, quality: 0.8 });
      await updateAvatarURL(avatarURL);
      setSuccess('Profile picture updated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to update profile picture:', err);
      setError((err as Error).message || 'Failed to update profile picture.');
    } finally {
      setIsAvatarSaving(false);
      clearAvatarInput();
    }
  };

  const handleRemoveAvatar = async (): Promise<void> => {
    setError('');
    setSuccess('');
    setIsAvatarSaving(true);
    try {
      await updateAvatarURL(null);
      setSuccess('Profile picture removed.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to remove profile picture:', err);
      setError((err as Error).message || 'Failed to remove profile picture.');
    } finally {
      setIsAvatarSaving(false);
      clearAvatarInput();
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
          <div className="profile-avatar-circle">
            {userDoc?.avatarURL ? (
              <img
                src={userDoc.avatarURL}
                alt="Profile"
                className="profile-avatar-image"
              />
            ) : (
              <span className="profile-avatar-icon">👤</span>
            )}
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="profile-avatar-input"
            disabled={isAvatarSaving}
          />

          <div className="profile-avatar-actions">
            <button
              type="button"
              className="profile-avatar-button"
              onClick={handleChooseAvatar}
              disabled={isAvatarSaving}
            >
              {isAvatarSaving ? 'Updating...' : 'Upload Photo'}
            </button>
            {userDoc?.avatarURL && (
              <button
                type="button"
                className="profile-avatar-remove"
                onClick={handleRemoveAvatar}
                disabled={isAvatarSaving}
              >
                Remove
              </button>
            )}
          </div>
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value)}
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
