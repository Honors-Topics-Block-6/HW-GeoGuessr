import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isTestAchievementUnlocked, toggleTestAchievementUnlocked, ACHIEVEMENTS_UPDATED_EVENT } from '../../services/achievementService';
import './TitleScreen.css';

export interface TitleScreenProps {
  onPlay: () => void;
  onOpenSubmission: () => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
  onOpenLeaderboard: () => void;
  onOpenBugReport: () => void;
  onOpenDailyGoals: () => void;
  isLoading: boolean;
}

function TitleScreen({ onPlay, onOpenSubmission, onOpenProfile, onOpenFriends, onOpenLeaderboard, onOpenBugReport, onOpenDailyGoals, isLoading }: TitleScreenProps): React.ReactElement {
  const { userDoc, logout, levelInfo, levelTitle: _levelTitle } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isTestAchievementOn, setIsTestAchievementOn] = useState<boolean>(() => isTestAchievementUnlocked());
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

  useEffect(() => {
    const syncToggleState = (): void => setIsTestAchievementOn(isTestAchievementUnlocked());
    window.addEventListener(ACHIEVEMENTS_UPDATED_EVENT, syncToggleState);
    window.addEventListener('storage', syncToggleState);
    return () => {
      window.removeEventListener(ACHIEVEMENTS_UPDATED_EVENT, syncToggleState);
      window.removeEventListener('storage', syncToggleState);
    };
  }, []);

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
            <span className="title-user-icon">👤</span>
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
          <button
            className={`title-test-achievement-button ${isTestAchievementOn ? 'active' : ''}`}
            onClick={() => setIsTestAchievementOn(toggleTestAchievementUnlocked())}
          >
            {isTestAchievementOn ? 'Remove Test Badge' : 'Unlock Test Badge'}
          </button>
          <button className="submit-photo-button" onClick={onOpenSubmission}>
            Submit Photo
          </button>
          <button className="title-bug-report-button" onClick={onOpenBugReport}>
            Report Bug
          </button>
          <button className="title-leaderboard-button" onClick={onOpenLeaderboard}>
            Leaderboard
          </button>
        </div>
      </div>
      <div className="title-background">
        <div className="title-overlay"></div>
      </div>
      <div className="title-content">
        <div className="logo-container">
          <span className="logo-icon">🌍</span>
        </div>
        <h1 className="game-title">HW Geoguessr</h1>
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
