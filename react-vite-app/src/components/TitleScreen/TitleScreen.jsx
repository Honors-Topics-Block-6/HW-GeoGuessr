import { useAuth } from '../../contexts/AuthContext';
import './TitleScreen.css';

function TitleScreen({ onPlay, onOpenSubmission, onOpenProfile, isLoading }) {
  const { userDoc, logout } = useAuth();

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
        </div>
        <div className="title-top-actions">
          <button className="title-profile-button" onClick={onOpenProfile}>
            Profile
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
