import './GuessButton.css';

function GuessButton({ disabled, onClick }) {
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
