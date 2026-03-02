import './ModeSelect.css';

export interface ModeSelectProps {
  onSelectSinglePlayer: () => void;
  onSelectMultiplayer: () => void;
  onBack: () => void;
}

function ModeSelect({ onSelectSinglePlayer, onSelectMultiplayer, onBack }: ModeSelectProps): React.ReactElement {
  return (
    <div className="mode-select-screen">
      <div className="mode-select-background">
        <div className="mode-select-overlay"></div>
      </div>

      <div className="mode-select-content">
        <button className="mode-select-back-button" onClick={onBack}>
          ← Back
        </button>

        <h2 className="mode-select-heading">Choose Mode</h2>
        <p className="mode-select-subheading">Pick how you want to play</p>

        <div className="mode-select-options">
          <button className="mode-select-card" onClick={onSelectSinglePlayer}>
            <span className="mode-select-card-icon">👤</span>
            <span className="mode-select-card-label">Single Player</span>
            <span className="mode-select-card-desc">Choose your difficulty and round time</span>
          </button>

          <button className="mode-select-card" onClick={onSelectMultiplayer}>
            <span className="mode-select-card-icon">👥</span>
            <span className="mode-select-card-label">Multiplayer</span>
            <span className="mode-select-card-desc">Jump right into the lobby</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModeSelect;
