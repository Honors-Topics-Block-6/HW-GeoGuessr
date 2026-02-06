import { useGameState } from './hooks/useGameState';
import TitleScreen from './components/TitleScreen/TitleScreen';
import GameScreen from './components/GameScreen/GameScreen';
import './App.css';

function App() {
  const {
    screen,
    currentImage,
    guessLocation,
    guessFloor,
    isLoading,
    error,
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    resetGame
  } = useGameState();

  // Error state
  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button className="retry-button" onClick={resetGame}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'title' && (
        <TitleScreen
          onStartGame={startGame}
          isLoading={isLoading}
        />
      )}

      {screen === 'game' && currentImage && (
        <GameScreen
          imageUrl={currentImage.url}
          guessLocation={guessLocation}
          guessFloor={guessFloor}
          onMapClick={placeMarker}
          onFloorSelect={selectFloor}
          onSubmitGuess={submitGuess}
          onBackToTitle={resetGame}
        />
      )}

      {/* Loading state for game screen */}
      {screen === 'game' && !currentImage && isLoading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      )}
    </div>
  );
}

export default App;
