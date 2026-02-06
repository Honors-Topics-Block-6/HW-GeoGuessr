import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import TitleScreen from './components/TitleScreen/TitleScreen';
import GameScreen from './components/GameScreen/GameScreen';
import ResultScreen from './components/ResultScreen/ResultScreen';
import FinalResultsScreen from './components/FinalResultsScreen/FinalResultsScreen';
import SubmissionApp from './components/SubmissionApp/SubmissionApp';
import './App.css';

function App() {
  const [showSubmissionApp, setShowSubmissionApp] = useState(false);

  const {
    screen,
    currentRound,
    totalRounds,
    currentImage,
    guessLocation,
    guessFloor,
    availableFloors,
    currentResult,
    roundResults,
    isLoading,
    error,
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    nextRound,
    viewFinalResults,
    resetGame
  } = useGameState();

  const handleOpenSubmission = () => {
    setShowSubmissionApp(true);
  };

  const handleCloseSubmission = () => {
    setShowSubmissionApp(false);
  };

  // Show submission app
  if (showSubmissionApp) {
    return <SubmissionApp onBack={handleCloseSubmission} />;
  }

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
          onOpenSubmission={handleOpenSubmission}
          isLoading={isLoading}
        />
      )}

      {screen === 'game' && currentImage && (
        <GameScreen
          imageUrl={currentImage.url}
          guessLocation={guessLocation}
          guessFloor={guessFloor}
          availableFloors={availableFloors}
          onMapClick={placeMarker}
          onFloorSelect={selectFloor}
          onSubmitGuess={submitGuess}
          onBackToTitle={resetGame}
          currentRound={currentRound}
          totalRounds={totalRounds}
        />
      )}

      {screen === 'result' && currentResult && (
        <ResultScreen
          guessLocation={currentResult.guessLocation}
          guessFloor={currentResult.guessFloor}
          actualLocation={currentResult.actualLocation}
          actualFloor={currentResult.actualFloor}
          imageUrl={currentResult.imageUrl}
          roundNumber={currentRound}
          totalRounds={totalRounds}
          onNextRound={nextRound}
          onViewFinalResults={viewFinalResults}
          isLastRound={currentRound >= totalRounds}
        />
      )}

      {screen === 'finalResults' && (
        <FinalResultsScreen
          rounds={roundResults}
          onPlayAgain={startGame}
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
