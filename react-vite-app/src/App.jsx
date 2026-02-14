import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useGameState } from './hooks/useGameState';
import { usePresence } from './hooks/usePresence';
import { useAdminMessages } from './hooks/useAdminMessages';
import LoginScreen from './components/LoginScreen/LoginScreen';
import ProfileScreen from './components/ProfileScreen/ProfileScreen';
import TitleScreen from './components/TitleScreen/TitleScreen';
import DifficultySelect from './components/DifficultySelect/DifficultySelect';
import GameScreen from './components/GameScreen/GameScreen';
import ResultScreen from './components/ResultScreen/ResultScreen';
import FinalResultsScreen from './components/FinalResultsScreen/FinalResultsScreen';
import SubmissionApp from './components/SubmissionApp/SubmissionApp';
import MessageBanner from './components/MessageBanner/MessageBanner';
import EmailVerificationBanner from './components/EmailVerificationBanner/EmailVerificationBanner';
import './App.css';

function App() {
  const { user, userDoc, loading, needsUsername, isAdmin } = useAuth();
  const [showSubmissionApp, setShowSubmissionApp] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
    clickRejected,
    playingArea,
    timeRemaining,
    roundTimeSeconds,
    // eslint-disable-next-line no-unused-vars
    difficulty,
    setScreen,
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    nextRound,
    viewFinalResults,
    resetGame
  } = useGameState();

  // Track user's online presence and current activity
  usePresence(user, screen, showSubmissionApp, showProfile, isAdmin);

  // Listen for admin messages sent to this user
  const { messages, dismissMessage } = useAdminMessages(user?.uid);

  // Prepare the message banner (uses createPortal, renders at viewport top)
  const messageBanner = user && messages.length > 0 ? (
    <MessageBanner messages={messages} onDismiss={dismissMessage} />
  ) : null;

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  // Not authenticated or needs username setup → show login screen
  if (!user || needsUsername || !userDoc) {
    return <LoginScreen />;
  }

  // Show profile screen
  if (showProfile) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <ProfileScreen onBack={() => setShowProfile(false)} />
      </>
    );
  }

  // Show submission app
  if (showSubmissionApp) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <SubmissionApp onBack={() => setShowSubmissionApp(false)} />
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="app">
        <EmailVerificationBanner />
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button className="retry-button" onClick={resetGame}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  /**
   * Handle the "Play" button on the title screen → go to difficulty select
   */
  const handlePlay = () => {
    setScreen('difficultySelect');
  };

  /**
   * Handle starting the game from difficulty select
   */
  const handleStartFromDifficulty = (selectedDifficulty, _mode) => {
    startGame(selectedDifficulty);
  };

  /**
   * Go back from difficulty select to the title screen
   */
  const handleBackToTitle = () => {
    setScreen('title');
  };

  return (
    <div className="app">
      {messageBanner}
      <EmailVerificationBanner />
      {screen === 'title' && (
        <TitleScreen
          onPlay={handlePlay}
          onOpenSubmission={() => setShowSubmissionApp(true)}
          onOpenProfile={() => setShowProfile(true)}
          isLoading={isLoading}
        />
      )}

      {screen === 'difficultySelect' && (
        <DifficultySelect
          onStart={handleStartFromDifficulty}
          onBack={handleBackToTitle}
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
          clickRejected={clickRejected}
          playingArea={playingArea}
          timeRemaining={timeRemaining}
          timeLimitSeconds={roundTimeSeconds}
        />
      )}

      {screen === 'result' && currentResult && (
        <ResultScreen
          guessLocation={currentResult.guessLocation}
          guessFloor={currentResult.guessFloor}
          actualLocation={currentResult.actualLocation}
          actualFloor={currentResult.actualFloor}
          imageUrl={currentResult.imageUrl}
          locationScore={currentResult.locationScore}
          floorCorrect={currentResult.floorCorrect}
          totalScore={currentResult.score}
          timeTakenSeconds={currentResult.timeTakenSeconds}
          timedOut={currentResult.timedOut}
          noGuess={currentResult.noGuess}
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
          onPlayAgain={() => setScreen('difficultySelect')}
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
