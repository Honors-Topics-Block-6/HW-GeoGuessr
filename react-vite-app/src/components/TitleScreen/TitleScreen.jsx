import { useAuth } from '../../contexts/AuthContext';
import './TitleScreen.css';

function TitleScreen({ onPlay, onOpenSubmission, onOpenProfile, onOpenFriends, onOpenLeaderboard, onOpenDailyGoals, isLoading }) {
  const { userDoc, logout, levelInfo, levelTitle } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <div className="title-screen">
      <div className="title-top-bar">
        <div className="title-user-info">
          <span className="title-user-icon">👤</span>
          <span className="title-username">{userDoc?.username}</span>
          <span className="title-level-badge">Lvl {levelInfo.level}</span>
        </div>
        <div className="title-top-actions">
          <button className="title-daily-goals-button" onClick={onOpenDailyGoals}>
            Daily Goals
          </button>
          <button className="title-leaderboard-button" onClick={onOpenLeaderboard}>
            Leaderboard
          </button>
          <button className="title-profile-button" onClick={onOpenProfile}>
            Profile
          </button>
          <button className="title-friends-button" onClick={onOpenFriends}>
            Friends
          </button>
          <button className="submit-photo-button" onClick={onOpenSubmission}>
            Submit Photo
          </button>
          <button className="title-logout-button" onClick={handleLogout}>
            Log Out
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

        {/* Level chip under tagline */}
        <div className="title-level-chip">
          <span className="title-level-chip-level">Lvl {levelInfo.level}</span>
          <span className="title-level-chip-title">{levelTitle}</span>
        </div>

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
