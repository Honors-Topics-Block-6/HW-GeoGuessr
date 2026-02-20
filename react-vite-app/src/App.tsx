import React, { useState, useCallback, ReactNode } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useGameState, type Difficulty } from './hooks/useGameState';
import { useDuelGame } from './hooks/useDuelGame';
import { usePresence } from './hooks/usePresence';
import { useAdminMessages } from './hooks/useAdminMessages';
import { STARTING_HEALTH } from './services/duelService';
import { joinLobby } from './services/lobbyService';
import { touchLastActive } from './services/lastActiveService';
import LoginScreen from './components/LoginScreen/LoginScreen';
import ProfileScreen from './components/ProfileScreen/ProfileScreen';
import TitleScreen from './components/TitleScreen/TitleScreen';
import DifficultySelect from './components/DifficultySelect/DifficultySelect';
import GameScreen from './components/GameScreen/GameScreen';
import ResultScreen from './components/ResultScreen/ResultScreen';
import FinalResultsScreen from './components/FinalResultsScreen/FinalResultsScreen';
import MultiplayerLobby from './components/MultiplayerLobby/MultiplayerLobby';
import WaitingRoom from './components/WaitingRoom/WaitingRoom';
import DuelGameScreen from './components/DuelGameScreen/DuelGameScreen';
import DuelResultScreen from './components/DuelResultScreen/DuelResultScreen';
import DuelFinalScreen from './components/DuelFinalScreen/DuelFinalScreen';
import LeaderboardScreen from './components/LeaderboardScreen/LeaderboardScreen';
import SubmissionApp from './components/SubmissionApp/SubmissionApp';
import FriendsPanel from './components/FriendsPanel/FriendsPanel';
import ChatWindow from './components/ChatWindow/ChatWindow';
import BugReportModal from './components/BugReportModal/BugReportModal';
import DailyGoalsPanel from './components/DailyGoalsPanel/DailyGoalsPanel';
import MessageBanner from './components/MessageBanner/MessageBanner';
import EmailVerificationBanner from './components/EmailVerificationBanner/EmailVerificationBanner';
import './App.css';

/** Shape of a friend object used when opening chat */
interface ChatFriend {
  uid: string;
  username: string;
}

/** Shape of an invite message received from chat (matches ChatMessage from ChatWindow) */
interface InviteMessage {
  lobbyDocId?: string;
  difficulty?: string;
  [key: string]: unknown;
}

function App(): React.ReactElement {
  const { user, userDoc, loading, needsUsername, isAdmin } = useAuth();
  const [showSubmissionApp, setShowSubmissionApp] = useState<boolean>(false);
  const [showProfile, setShowProfile] = useState<boolean>(false);
  const [showFriends, setShowFriends] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  const [chatFriend, setChatFriend] = useState<ChatFriend | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [showBugReport, setShowBugReport] = useState<boolean>(false);
  const [showDailyGoals, setShowDailyGoals] = useState<boolean>(false);

  // Track whether we're in a duel (multiplayer) game
  const [inDuel, setInDuel] = useState<boolean>(false);
  const [duelLobbyDocId, setDuelLobbyDocId] = useState<string | null>(null);

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
    difficulty,
    mode: _mode,
    lobbyDocId,
    setScreen,
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    nextRound,
    viewFinalResults,
    resetGame,
    setLobbyDocId,
    setDifficulty
  } = useGameState();

  // Duel game hook -- only active when inDuel is true and we have a lobby doc ID
  const duel = useDuelGame(
    (inDuel ? duelLobbyDocId : null) as string,
    user?.uid as string,
    userDoc?.username as string
  );

  // Track user's online presence and current activity
  usePresence(user as Parameters<typeof usePresence>[0], inDuel ? `duel-${duel.phase}` : screen, showSubmissionApp, showProfile, isAdmin, showLeaderboard, showFriends, showChat);

  // Listen for admin messages sent to this user
  const { messages, dismissMessage } = useAdminMessages(user?.uid);

  /**
   * Handle joining a lobby from a chat invite message.
   * Joins the lobby and navigates to the WaitingRoom.
   */
  const handleJoinFromInvite = useCallback(async (inviteMsg: InviteMessage): Promise<void> => {
    try {
      const lobbyId = inviteMsg.lobbyDocId;
      const diff = inviteMsg.difficulty;
      if (!lobbyId || !diff) return;

      await joinLobby(
        lobbyId,
        user!.uid,
        userDoc?.username ?? '',
        diff
      );
      // Close any open panels so we land cleanly on the WaitingRoom
      setShowFriends(false);
      setShowChat(false);
      setChatFriend(null);
      setShowProfile(false);
      setShowLeaderboard(false);
      setShowDailyGoals(false);
      setShowSubmissionApp(false);
      // Set game state for the WaitingRoom
      setDifficulty(diff as Difficulty);
      setLobbyDocId(lobbyId);
      setScreen('waitingRoom');
    } catch (err: unknown) {
      console.error('Failed to join lobby from invite:', err);
      const message = err instanceof Error ? err.message : 'Failed to join lobby.';
      alert(message);
    }
  }, [user, userDoc, setDifficulty, setLobbyDocId, setScreen]);

  // Prepare the message banner (uses createPortal, renders at viewport top)
  const messageBanner: ReactNode = user && messages.length > 0 ? (
    <MessageBanner messages={messages as unknown as React.ComponentProps<typeof MessageBanner>['messages']} onDismiss={dismissMessage} />
  ) : null;

  /**
   * Handle opening a chat from the friends panel
   */
  const handleOpenChat = useCallback((friendUid: string, friendUsername: string): void => {
    setChatFriend({ uid: friendUid, username: friendUsername });
    setShowChat(true);
    setShowFriends(false);
  }, []);

  /**
   * Handle closing the chat -> go back to friends panel
   */
  const handleCloseChat = useCallback((): void => {
    setShowChat(false);
    setChatFriend(null);
    setShowFriends(true);
  }, []);

  /**
   * Handle transition from WaitingRoom to the duel game
   */
  const handleDuelGameStart = useCallback((): void => {
    void touchLastActive(user?.uid, { minIntervalMs: 2 * 60 * 1000 });
    setInDuel(true);
    setDuelLobbyDocId(lobbyDocId);
    setScreen('duelGame');
  }, [user?.uid, lobbyDocId, setScreen]);

  /**
   * Exit the duel and go back to difficulty select
   */
  const handleExitDuel = useCallback((): void => {
    setInDuel(false);
    setDuelLobbyDocId(null);
    setLobbyDocId(null);
    setScreen('difficultySelect');
  }, [setLobbyDocId, setScreen]);

  /**
   * Exit duel and go to title screen
   */
  const handleDuelBackToTitle = useCallback((): void => {
    setInDuel(false);
    setDuelLobbyDocId(null);
    setLobbyDocId(null);
    resetGame();
  }, [setLobbyDocId, resetGame]);

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

  // Not authenticated or needs username setup -> show login screen
  if (!user || needsUsername || !userDoc) {
    return <LoginScreen />;
  }

  // Show chat window
  if (showChat && chatFriend) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <ChatWindow
          friendUid={chatFriend.uid}
          friendUsername={chatFriend.username}
          onBack={handleCloseChat}
          onJoinLobby={handleJoinFromInvite as unknown as React.ComponentProps<typeof ChatWindow>['onJoinLobby']}
        />
      </>
    );
  }

  // Show friends panel
  if (showFriends) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <FriendsPanel
          onBack={() => setShowFriends(false)}
          onOpenChat={handleOpenChat}
        />
      </>
    );
  }

  // Show profile screen
  if (showProfile) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <ProfileScreen
          onBack={() => setShowProfile(false)}
          onOpenFriends={() => {
            setShowProfile(false);
            setShowFriends(true);
          }}
        />
      </>
    );
  }

  // Show leaderboard screen
  if (showLeaderboard) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <LeaderboardScreen onBack={() => setShowLeaderboard(false)} />
      </>
    );
  }

  // Show daily goals panel
  if (showDailyGoals) {
    return (
      <>
        {messageBanner}
        <EmailVerificationBanner />
        <DailyGoalsPanel onBack={() => setShowDailyGoals(false)} />
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
   * Handle the "Play" button on the title screen -> go to difficulty select
   */
  const handlePlay = (): void => {
    setScreen('difficultySelect');
  };

  /**
   * Handle starting the game from difficulty select
   */
  const handleStartFromDifficulty = (selectedDifficulty: string, selectedMode: string): void => {
    void touchLastActive(user?.uid, { minIntervalMs: 2 * 60 * 1000 });
    startGame(selectedDifficulty, selectedMode);
  };

  /**
   * Go back from difficulty select to the title screen
   */
  const handleBackToTitle = (): void => {
    setScreen('title');
  };

  // --- Duel game state derivation ---
  // Get the latest round from roundHistory to show in results
  const duelLatestRound = duel.roundHistory?.length > 0
    ? duel.roundHistory[duel.roundHistory.length - 1]
    : null;

  // Get my username
  const myUsername: string = userDoc?.username || 'You';

  // Compute health before the latest round's damage was applied
  const uid = user?.uid ?? '';
  const opUid = duel.opponentUid ?? '';

  const duelMyHealthBefore: number = duelLatestRound
    ? (duel.roundHistory.length > 1
      ? duel.roundHistory[duel.roundHistory.length - 2].healthAfter?.[uid] ?? STARTING_HEALTH
      : STARTING_HEALTH)
    : STARTING_HEALTH;

  const duelOpHealthBefore: number = duelLatestRound
    ? (duel.roundHistory.length > 1
      ? duel.roundHistory[duel.roundHistory.length - 2].healthAfter?.[opUid] ?? STARTING_HEALTH
      : STARTING_HEALTH)
    : STARTING_HEALTH;

  return (
    <div className="app">
      {messageBanner}
      <EmailVerificationBanner />

      {/* --- Single Player Screens --- */}

      {screen === 'title' && !inDuel && (
        <TitleScreen
          onPlay={handlePlay}
          onOpenSubmission={() => setShowSubmissionApp(true)}
          onOpenProfile={() => setShowProfile(true)}
          onOpenFriends={() => setShowFriends(true)}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onOpenBugReport={() => setShowBugReport(true)}
          onOpenDailyGoals={() => setShowDailyGoals(true)}
          isLoading={isLoading}
        />
      )}

      {screen === 'difficultySelect' && !inDuel && (
        <DifficultySelect
          onStart={handleStartFromDifficulty}
          onBack={handleBackToTitle}
          isLoading={isLoading}
        />
      )}

      {screen === 'multiplayerLobby' && !inDuel && (
        <MultiplayerLobby
          difficulty={difficulty as React.ComponentProps<typeof MultiplayerLobby>['difficulty']}
          userUid={user.uid}
          userUsername={userDoc?.username as string}
          onJoinedLobby={(docId: string) => {
            setLobbyDocId(docId);
            setScreen('waitingRoom');
          }}
          onBack={() => setScreen('difficultySelect')}
        />
      )}

      {screen === 'waitingRoom' && lobbyDocId && !inDuel && (
        <WaitingRoom
          lobbyDocId={lobbyDocId}
          userUid={user.uid}
          onLeave={() => {
            setLobbyDocId(null);
            setScreen('multiplayerLobby');
          }}
          onGameStart={handleDuelGameStart}
        />
      )}

      {screen === 'game' && currentImage && !inDuel && (
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
          playingArea={playingArea as React.ComponentProps<typeof GameScreen>['playingArea']}
          timeRemaining={timeRemaining}
          timeLimitSeconds={roundTimeSeconds}
        />
      )}

      {screen === 'result' && currentResult && !inDuel && (
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
          noGuess={currentResult.noGuess ?? false}
          roundNumber={currentRound}
          totalRounds={totalRounds}
          onNextRound={nextRound}
          onViewFinalResults={viewFinalResults}
          isLastRound={currentRound >= totalRounds}
        />
      )}

      {screen === 'finalResults' && !inDuel && (
        <FinalResultsScreen
          rounds={roundResults}
          onPlayAgain={() => setScreen('difficultySelect')}
          onBackToTitle={resetGame}
          difficulty={difficulty}
        />
      )}

      {/* Loading state for single-player game screen */}
      {screen === 'game' && !currentImage && isLoading && !inDuel && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* --- Duel (Multiplayer) Screens --- */}

      {inDuel && duel.phase === 'guessing' && duel.currentImage && (
        <DuelGameScreen
          imageUrl={duel.currentImage.url}
          guessLocation={duel.localGuessLocation}
          guessFloor={duel.localGuessFloor}
          availableFloors={duel.localAvailableFloors}
          onMapClick={duel.placeMarker}
          onFloorSelect={duel.selectFloor}
          onSubmitGuess={duel.submitGuess}
          onBackToTitle={handleDuelBackToTitle}
          currentRound={duel.currentRound}
          clickRejected={duel.clickRejected}
          playingArea={duel.playingArea as React.ComponentProps<typeof DuelGameScreen>['playingArea']}
          timeRemaining={duel.timeRemaining}
          timeLimitSeconds={duel.roundTimeSeconds}
          hasSubmitted={duel.hasSubmitted}
          opponentHasSubmitted={duel.opponentHasSubmitted}
          opponentUsername={duel.opponentUsername}
          myHealth={duel.myHealth}
          opponentHealth={duel.opponentHealth}
          myUsername={myUsername}
        />
      )}

      {inDuel && duel.phase === 'results' && duelLatestRound && (
        <DuelResultScreen
          roundNumber={duelLatestRound.roundNumber}
          imageUrl={duelLatestRound.imageUrl}
          actualLocation={duelLatestRound.actualLocation}
          myGuess={duelLatestRound.players?.[uid]}
          opponentGuess={duelLatestRound.players?.[opUid]}
          myUsername={myUsername}
          opponentUsername={duel.opponentUsername}
          myHealth={duel.myHealth}
          opponentHealth={duel.opponentHealth}
          myHealthBefore={duelMyHealthBefore}
          opponentHealthBefore={duelOpHealthBefore}
          damage={duelLatestRound.damage}
          multiplier={duelLatestRound.multiplier}
          damagedPlayer={duelLatestRound.damagedPlayer}
          myUid={uid}
          isHost={duel.isHost}
          onNextRound={duel.nextRound}
          onViewFinalResults={() => {/* Will auto-transition via phase */}}
          isGameOver={false}
        />
      )}

      {inDuel && duel.phase === 'finished' && duel.winner && duel.loser && (
        <DuelFinalScreen
          winner={duel.winner}
          loser={duel.loser}
          myUid={uid}
          players={duel.players}
          roundHistory={duel.roundHistory}
          health={duel.duelState?.health || {}}
          onPlayAgain={handleExitDuel}
          onBackToTitle={handleDuelBackToTitle}
        />
      )}

      {/* Duel loading state */}
      {inDuel && duel.isLoading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* Bug Report Modal (renders as portal overlay) */}
      {showBugReport && (
        <BugReportModal
          onClose={() => setShowBugReport(false)}
          userId={user.uid}
          username={userDoc?.username ?? ''}
          userEmail={user.email ?? ''}
        />
      )}
    </div>
  );
}

export default App;
