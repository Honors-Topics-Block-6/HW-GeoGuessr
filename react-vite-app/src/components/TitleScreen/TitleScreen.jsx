import './TitleScreen.css';
import { useXp } from '../../hooks/useXp';

function TitleScreen({ onStartGame, onOpenSubmission, isLoading }) {
  const { level, levelProgress } = useXp();

  return (
    <div className="title-screen">
      <div className="xp-bar-container">
        <span className="xp-level-label">Level {level}</span>
        <div className="xp-progress-track">
          <div
            className="xp-progress-fill"
            style={{ width: `${levelProgress.progressFraction * 100}%` }}
          />
        </div>
        <span className="xp-count-label">
          {levelProgress.xpInCurrentLevel} / {levelProgress.xpToNextLevel} XP
        </span>
      </div>
      <button className="submit-photo-button" onClick={onOpenSubmission}>
        Submit Photo
      </button>
      <div className="title-background">
        <div className="title-overlay"></div>
      </div>
      <div className="title-content">
        <div className="logo-container">
          <span className="logo-icon">🌍</span>
        </div>
        <h1 className="game-title">HW Geogessr</h1>
        <p className="tagline">Can you guess the location on campus?</p>
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
