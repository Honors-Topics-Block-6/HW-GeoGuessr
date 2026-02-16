import './GuessButton.css';

export interface GuessButtonProps {
  disabled: boolean;
  onClick: () => void;
}

function GuessButton({ disabled, onClick }: GuessButtonProps): React.ReactElement {
  return (
    <button
      className={`guess-button ${disabled ? 'disabled' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="guess-icon">🎯</span>
      <span className="guess-text">Guess</span>
    </button>
  );
}

export default GuessButton;
