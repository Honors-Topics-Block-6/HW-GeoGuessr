import './TitleScreen.css';

function TitleScreen({ onStartGame, onOpenSubmission, isLoading }) {
  return (
    <div className="title-screen">
      <div className="title-background">
        <div className="title-overlay"></div>
      </div>

      <header className="hud-bar ui-surface">
        <div className="hud-left">
          <div className="ui-icon-badge" aria-hidden="true">🌍</div>
          <div className="hud-brand">
            <div className="hud-name">GeoGuessr</div>
            <div className="hud-sub">Drop a pin. Lock it in.</div>
          </div>
        </div>
        <div className="hud-right">
          <span className="ui-chip primary">Classic</span>
          <button className="submit-photo-button ui-chip" onClick={onOpenSubmission}>
            Submit Photo
          </button>
        </div>
      </header>

      <main className="title-content ui-surface">
        <div className="title-hero">
          <h1 className="game-title">HW Geoguessr</h1>
          <p className="tagline">Can you guess the location on campus?</p>
        </div>

        <div className="title-actions">
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
          <div className="subtitle">
            Explore Harvard-Westlake through photos
          </div>
        </div>

        <section className="mode-grid" aria-label="Game modes">
          <div className="mode-card">
            <div className="mode-top">
              <span className="mode-emoji" aria-hidden="true">🎯</span>
              <span className="ui-chip primary">Classic</span>
            </div>
            <div className="mode-title">Singleplayer</div>
            <div className="mode-desc">Faster locks score more points.</div>
          </div>
          <div className="mode-card disabled" aria-disabled="true">
            <div className="mode-top">
              <span className="mode-emoji" aria-hidden="true">⚡</span>
              <span className="ui-chip">Coming soon</span>
            </div>
            <div className="mode-title">Multiplayer</div>
            <div className="mode-desc">5 rounds. Closest guess wins.</div>
          </div>
          <div className="mode-card disabled" aria-disabled="true">
            <div className="mode-top">
              <span className="mode-emoji" aria-hidden="true">🔥</span>
              <span className="ui-chip">Coming soon</span>
            </div>
            <div className="mode-title">Streak</div>
            <div className="mode-desc">Keep going until you miss.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default TitleScreen;
