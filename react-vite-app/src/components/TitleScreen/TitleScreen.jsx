import './TitleScreen.css';

function TitleScreen({ onStartGame, onOpenSubmission, isLoading }) {
  return (
    <div className="title-screen">
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
