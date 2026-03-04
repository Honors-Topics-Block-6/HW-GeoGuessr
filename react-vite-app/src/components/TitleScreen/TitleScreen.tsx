import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { LobbyInvite } from '../../hooks/useLobbyInvites';
import './TitleScreen.css';

export interface TitleScreenProps {
  onPlay: () => void;
  onOpenSubmission: () => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
  onOpenLeaderboard: () => void;
  onOpenBugReport: () => void;
  onOpenDailyGoals: () => void;
  onOpenAchievements: () => void;
  isLoading: boolean;
  invites: LobbyInvite[];
  onJoinInvite: (invite: LobbyInvite) => Promise<boolean>;
  onDismissInvite: (inviteId: string) => void;
}

function TitleScreen({
  onPlay,
  onOpenSubmission,
  onOpenProfile,
  onOpenFriends,
  onOpenLeaderboard,
  onOpenBugReport,
  onOpenDailyGoals,
  onOpenAchievements,
  isLoading,
  invites,
  onJoinInvite,
  onDismissInvite
}: TitleScreenProps): React.ReactElement {
  const { userDoc, logout, levelInfo, levelTitle: _levelTitle } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [joiningInviteId, setJoiningInviteId] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleJoinClick = async (invite: LobbyInvite): Promise<void> => {
    if (joiningInviteId) return;
    setJoiningInviteId(invite.id);
    try {
      await onJoinInvite(invite);
    } finally {
      setJoiningInviteId(null);
    }
  };

  return (
    <div className="title-screen">
      <div className="title-top-bar">
        <div className="title-user-menu-wrapper" ref={userMenuRef}>
          <button
            className="title-user-info-button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <span className="title-user-avatar">
              {userDoc?.photoURL ? (
                <img
                  className="title-user-avatar-image"
                  src={userDoc.photoURL}
                  alt={`${userDoc.username || 'User'}'s profile`}
                />
              ) : (
                <span className="title-user-avatar-icon" aria-hidden="true">👤</span>
              )}
            </span>
            <span className="title-username">{userDoc?.username}</span>
            <span className="title-level-badge">Lvl {levelInfo.level}</span>
            <span className={`title-user-chevron ${userMenuOpen ? 'open' : ''}`}>▾</span>
          </button>
          {userMenuOpen && (
            <div className="title-user-dropdown">
              <button className="title-dropdown-item" onClick={() => { onOpenProfile(); setUserMenuOpen(false); }}>
                Profile
              </button>
              <button className="title-dropdown-item" onClick={() => { onOpenFriends(); setUserMenuOpen(false); }}>
                Friends
              </button>
              <button className="title-dropdown-item" onClick={() => { onOpenAchievements(); setUserMenuOpen(false); }}>
                Achievements
              </button>
              <button className="title-dropdown-item" onClick={() => { onOpenDailyGoals(); setUserMenuOpen(false); }}>
                Daily Goals
              </button>
              <button className="title-dropdown-item title-dropdown-logout" onClick={() => { handleLogout(); setUserMenuOpen(false); }}>
                Log Out
              </button>
            </div>
          )}
        </div>
        <div className="title-top-actions">
          <button className="submit-photo-button" onClick={onOpenSubmission} aria-label="Submit Photo">
            <span className="title-action-icon" aria-hidden>📷</span>
            <span className="title-action-label">Submit Photo</span>
          </button>
          <button className="title-bug-report-button" onClick={onOpenBugReport} aria-label="Report Bug">
            <span className="title-action-icon" aria-hidden>🐛</span>
            <span className="title-action-label">Report Bug</span>
          </button>
          <button className="title-leaderboard-button" onClick={onOpenLeaderboard} aria-label="Leaderboard">
            <span className="title-action-icon" aria-hidden>🏆</span>
            <span className="title-action-label">Leaderboard</span>
          </button>
        </div>
      </div>
      <div className="title-background">
        <div className="title-overlay"></div>
      </div>
      {invites.length > 0 && (
        <div className="title-invitations" role="region" aria-label="Game invitations">
          <div className="title-invitations-header">
            <span className="title-invitations-title">Game Invitations</span>
            <span className="title-invitations-count">{invites.length}</span>
          </div>
          <div className="title-invitations-list">
            {invites.map((invite) => (
              <div key={invite.id} className="title-invite-item">
                <div className="title-invite-info">
                  <div className="title-invite-userline">
                    <span className="title-invite-username">{invite.senderUsername}</span>
                    {invite.gameId && (
                      <span className="title-invite-code">Code: {invite.gameId}</span>
                    )}
                  </div>
                  <span className="title-invite-subtext">invited you to a game</span>
                </div>
                <div className="title-invite-actions">
                  <button
                    className="title-invite-join"
                    onClick={() => handleJoinClick(invite)}
                    disabled={!!joiningInviteId}
                  >
                    {joiningInviteId === invite.id ? 'Joining...' : 'Join'}
                  </button>
                  <button
                    className="title-invite-decline"
                    type="button"
                    onClick={() => onDismissInvite(invite.id)}
                    aria-label={`Decline ${invite.senderUsername}'s invite`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="title-content">
        <div className="logo-container">
          <img className="logo-crest" src="/Crest.png" alt="Harvard-Westlake Crest" />
        </div>
        <h1 className="game-title">
          <span className="game-title-initial game-title-initial-h">H</span>
          <span className="game-title-initial game-title-initial-w">W</span>
          <span className="game-title-rest"> Geoguessr</span>
        </h1>
        <p className="tagline">Can you guess the location on campus?</p>

        <button
          className="start-button"
          onClick={onPlay}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="button-spinner"></span>
              Loading...
            </>
          ) : (
            'Play'
          )}
        </button>
        <p className="subtitle">
          Explore Harvard-Westlake through photos
        </p>
      </div>
    </div>
  );
}

export default TitleScreen;
