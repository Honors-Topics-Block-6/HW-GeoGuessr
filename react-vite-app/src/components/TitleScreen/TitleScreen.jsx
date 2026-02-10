import { useAuth } from '../../contexts/AuthContext';
import './TitleScreen.css';

function TitleScreen({ onStartGame, onOpenSubmission, onOpenAuth, isLoading }) {
  const { user, isLoggedIn, logOut } = useAuth();

  const handleLogout = async () => {
    try {
      await logOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="title-screen">
      <div className="title-top-buttons">
        <button className="submit-photo-button" onClick={onOpenSubmission}>
          Submit Photo
        </button>
        
        {isLoggedIn ? (
          <div className="user-menu">
            <div className="user-info">
              <span className="user-avatar">👤</span>
              <span className="user-name">{user?.displayName || 'Player'}</span>
            </div>
            <button className="logout-button" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        ) : (
          <button className="login-button" onClick={onOpenAuth}>
            Sign In
          </button>
        )}
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
        
        {!isLoggedIn && (
          <p className="guest-notice">
            <span className="guest-icon">ℹ️</span>
            Playing as guest — progress won't be saved
          </p>
        )}
        
        <button
          className="start-button"
          onClick={onStartGame}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="button-spinner"></span>
              Loading...
            </>
          ) : (
            'Start Game'
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
