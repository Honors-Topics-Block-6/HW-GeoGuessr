import { useState, useCallback, useEffect, useRef } from 'react';
import { useWaitingRoom } from '../../hooks/useLobby';
import { startDuel, DUEL_ROUND_TIME_SECONDS } from '../../services/duelService';
import InviteFriendsModal from '../InviteFriendsModal/InviteFriendsModal';
import './WaitingRoom.css';

type Difficulty = 'all' | 'easy' | 'medium' | 'hard';

interface DifficultyInfo {
  label: string;
  icon: string;
}

const DIFFICULTY_LABELS: Record<Difficulty, DifficultyInfo> = {
  all: { label: 'All', icon: '🌐' },
  easy: { label: 'Easy', icon: '🟢' },
  medium: { label: 'Medium', icon: '🟡' },
  hard: { label: 'Hard', icon: '🔴' },
};

const DIFFICULTY_OPTIONS: Difficulty[] = ['all', 'easy', 'medium', 'hard'];

export interface LobbyPlayer {
  uid: string;
  username: string;
}

export interface LobbyData {
  gameId: string;
  difficulty: Difficulty;
  visibility: 'public' | 'private';
  hostUid: string;
  players?: LobbyPlayer[];
  readyStatus?: Record<string, boolean>;
  maxPlayers?: number;
  gameMode?: 'duel' | 'multiplayer';
  status?: string;
  roundTimeSeconds?: number;
}

export interface WaitingRoomProps {
  lobbyDocId: string;
  userUid: string;
  onLeave: () => void;
  onGameStart: () => void;
}

/** Preset time options. 0 = no limit. */
interface TimePreset {
  value: number;
  label: string;
}

const TIME_PRESETS: TimePreset[] = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 0, label: 'No Limit' },
];

const CUSTOM_TIME_MIN = 3;
const CUSTOM_TIME_MAX = 600;

function WaitingRoom({ lobbyDocId, userUid, onLeave, onGameStart }: WaitingRoomProps): React.ReactElement {
  const { lobby, isLoading, error, leave, toggleReady, updateRoundTime, updateDifficulty } = useWaitingRoom(lobbyDocId, userUid);
  const [copied, setCopied] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [customTimeInput, setCustomTimeInput] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  // Close settings panel on click-outside
  useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(e.target as Node)) {
        setShowSettings(false);
        setShowCustomInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  const handleTimePreset = async (value: number): Promise<void> => {
    await updateRoundTime(value);
    setShowCustomInput(false);
  };

  const handleCustomTimeSubmit = async (): Promise<void> => {
    const parsed = parseInt(customTimeInput, 10);
    if (isNaN(parsed) || parsed < CUSTOM_TIME_MIN) {
      await updateRoundTime(CUSTOM_TIME_MIN);
    } else if (parsed > CUSTOM_TIME_MAX) {
      await updateRoundTime(CUSTOM_TIME_MAX);
    } else {
      await updateRoundTime(parsed);
    }
    setShowCustomInput(false);
  };

  const handleDifficultyChange = async (diff: Difficulty): Promise<void> => {
    await updateDifficulty(diff);
  };

  const handleCopyCode = async (): Promise<void> => {
    if (!lobby?.gameId) return;
    try {
      await navigator.clipboard.writeText(lobby.gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text if clipboard API fails
      console.warn('Failed to copy to clipboard');
    }
  };

  const handleLeave = useCallback(async (): Promise<void> => {
    await leave();
    onLeave();
  }, [leave, onLeave]);

  /**
   * Host starts the duel game
   */
  const handleStartGame = useCallback(async (): Promise<void> => {
    if (!lobby || isStarting) return;
    setIsStarting(true);
    try {
      await startDuel(lobbyDocId, lobby.players, lobby.difficulty);
      // The onSnapshot listener will detect status='in_progress' and
      // onGameStart will be called from the useEffect below
    } catch (err) {
      console.error('Failed to start game:', err);
      setIsStarting(false);
    }
  }, [lobby, lobbyDocId, isStarting]);

  /**
   * Auto-transition when lobby status changes to 'in_progress'
   * This handles both host (after startDuel) and non-host (via listener)
   */
  useEffect(() => {
    if (lobby?.status === 'in_progress') {
      onGameStart();
    }
  }, [lobby?.status, onGameStart]);

  if (isLoading) {
    return (
      <div className="waiting-screen">
        <div className="waiting-background">
          <div className="waiting-overlay"></div>
        </div>
        <div className="waiting-content">
          <div className="waiting-loading">
            <div className="waiting-spinner"></div>
            <p>Loading lobby...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !lobby) {
    return (
      <div className="waiting-screen">
        <div className="waiting-background">
          <div className="waiting-overlay"></div>
        </div>
        <div className="waiting-content">
          <div className="waiting-error">
            <p>{error || 'This lobby no longer exists.'}</p>
            <button className="waiting-back-btn" onClick={onLeave}>
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  const diffInfo: DifficultyInfo = DIFFICULTY_LABELS[lobby.difficulty as Difficulty] || DIFFICULTY_LABELS.all;
  const isHost: boolean = lobby.hostUid === userUid;
  const playerCount: number = lobby.players?.length || 0;
  const gameMode: 'duel' | 'multiplayer' = lobby.gameMode ?? 'duel';
  const maxPlayers: number = gameMode === 'duel' ? 2 : Math.max(2, Math.min(50, Math.trunc(lobby.maxPlayers ?? 50)));
  const isFull: boolean = gameMode === 'duel' ? playerCount >= maxPlayers : true;

  const readyStatus = lobby.readyStatus || {};
  const isCurrentUserReady = readyStatus[userUid] || false;
  const isHostReady = readyStatus[lobby.hostUid] || false;
  const allPlayersReady = lobby.players?.every(p => readyStatus[p.uid]) || false;
  const canStart: boolean = gameMode === 'duel'
    ? (isHost && isFull && allPlayersReady && !isStarting)
    : (isHost && playerCount >= 2 && isHostReady && !isStarting);

  const handleToggleReady = async (): Promise<void> => {
    await toggleReady(!isCurrentUserReady);
  };

  return (
    <div className="waiting-screen">
      <div className="waiting-background">
        <div className="waiting-overlay"></div>
      </div>

      <div className="waiting-content">
        <h1 className="waiting-heading">Waiting Room</h1>

        {/* Game Code */}
        <div className="waiting-code-section">
          <p className="waiting-code-label">Game Code</p>
          <div className="waiting-code-display" onClick={handleCopyCode}>
            <span className="waiting-code-text">{lobby.gameId}</span>
            <button className="waiting-copy-btn" title="Copy code">
              {copied ? '✓' : '📋'}
            </button>
          </div>
          {copied && <span className="waiting-copied-toast">Copied!</span>}
          <p className="waiting-code-hint">
            {gameMode === 'duel' ? 'Share this code with your opponent to invite them' : 'Share this code to invite players'}
          </p>
        </div>

        {/* Badges */}
        <div className="waiting-badges">
          <span className="waiting-badge waiting-badge-diff">
            {diffInfo.icon} {diffInfo.label}
          </span>
          <span className={`waiting-badge waiting-badge-vis ${lobby.visibility}`}>
            {lobby.visibility === 'public' ? '🌐 Public' : '🔒 Private'}
          </span>
          <span className="waiting-badge waiting-badge-count">
            {gameMode === 'duel' ? `${playerCount}/${maxPlayers} Players` : `${playerCount} Players`}
          </span>
          {gameMode === 'duel' ? (
            <span className="waiting-badge waiting-badge-mode">
              ⚔️ Duel
            </span>
          ) : (
            <span className="waiting-badge waiting-badge-mode">
              👥 Multiplayer
            </span>
          )}
          <span className="waiting-badge waiting-badge-time">
            ⏱ {lobby.roundTimeSeconds != null && lobby.roundTimeSeconds > 0
              ? `${lobby.roundTimeSeconds}s`
              : lobby.roundTimeSeconds === 0
                ? 'No Limit'
                : `${DUEL_ROUND_TIME_SECONDS}s`}
          </span>
        </div>

        {/* Host Settings Panel */}
        {isHost && (
          <div className="waiting-settings-wrapper" ref={settingsPanelRef}>
            <button
              className={`waiting-settings-toggle ${showSettings ? 'open' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              <span className="waiting-settings-toggle-icon">⚙️</span>
              Match Settings
              <span className={`waiting-settings-chevron ${showSettings ? 'open' : ''}`}>▾</span>
            </button>

            {showSettings && (
              <div className="waiting-settings-panel">
                {/* Round Time Setting */}
                <div className="waiting-setting-group">
                  <p className="waiting-setting-label">Round Time</p>
                  <div className="waiting-setting-options">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        className={`waiting-setting-btn ${lobby.roundTimeSeconds === preset.value ? 'active' : ''}`}
                        onClick={() => handleTimePreset(preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      className={`waiting-setting-btn ${showCustomInput ? 'active' : ''}`}
                      onClick={() => {
                        setShowCustomInput(true);
                        setCustomTimeInput(
                          lobby.roundTimeSeconds != null && lobby.roundTimeSeconds > 0
                            ? String(lobby.roundTimeSeconds)
                            : ''
                        );
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                  {showCustomInput && (
                    <div className="waiting-setting-custom-row">
                      <input
                        className="waiting-setting-custom-input"
                        type="text"
                        inputMode="numeric"
                        value={customTimeInput}
                        onChange={(e) => setCustomTimeInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCustomTimeSubmit(); }}
                        placeholder={`${CUSTOM_TIME_MIN}–${CUSTOM_TIME_MAX}`}
                        autoFocus
                      />
                      <button className="waiting-setting-custom-ok" onClick={handleCustomTimeSubmit}>
                        Set
                      </button>
                    </div>
                  )}
                </div>

                {/* Difficulty Setting */}
                <div className="waiting-setting-group">
                  <p className="waiting-setting-label">Difficulty</p>
                  <div className="waiting-setting-options">
                    {DIFFICULTY_OPTIONS.map((diff) => {
                      const info = DIFFICULTY_LABELS[diff];
                      return (
                        <button
                          key={diff}
                          className={`waiting-setting-btn waiting-setting-diff-btn ${lobby.difficulty === diff ? 'active' : ''}`}
                          onClick={() => handleDifficultyChange(diff)}
                        >
                          <span className="waiting-setting-diff-icon">{info.icon}</span>
                          {info.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Player List */}
        <div className="waiting-players">
          <h2 className="waiting-players-heading">Players</h2>
          <div className="waiting-players-list">
            {lobby.players?.map((player: LobbyPlayer) => {
              const isReady = readyStatus[player.uid] || false;
              return (
                <div
                  key={player.uid}
                  className={`waiting-player ${player.uid === lobby.hostUid ? 'host' : ''} ${player.uid === userUid ? 'you' : ''}`}
                >
                  <div className="waiting-player-info">
                    <span className="waiting-player-icon">
                      {player.uid === lobby.hostUid ? '👑' : '👤'}
                    </span>
                    <span className="waiting-player-name">
                      {player.username}
                      {player.uid === userUid && <span className="waiting-player-you"> (You)</span>}
                    </span>
                  </div>
                  <div className="waiting-player-status">
                    {player.uid === lobby.hostUid && (
                      <span className="waiting-player-role">Host</span>
                    )}
                    {isFull && (
                      <span className={`waiting-player-ready ${isReady ? 'ready' : 'not-ready'}`}>
                        {isReady ? '✓ Ready' : '⏳ Not Ready'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Waiting for players */}
          {((gameMode === 'duel' && !isFull) || (gameMode === 'multiplayer' && playerCount < 2)) && (
            <>
              <div className="waiting-dots-container">
                <span className="waiting-dots-text">
                  {gameMode === 'duel' ? 'Waiting for opponent' : 'Waiting for at least one more player'}
                </span>
                <span className="waiting-dots">
                  <span className="waiting-dot"></span>
                  <span className="waiting-dot"></span>
                  <span className="waiting-dot"></span>
                </span>
              </div>
              <button
                className="waiting-invite-btn"
                onClick={() => lobby?.gameId && setShowInviteModal(true)}
              >
                👥 Invite Friends
              </button>
            </>
          )}

          {/* Ready section: duel = all must ready; multiplayer = host must ready */}
          {gameMode === 'duel' && isFull && !allPlayersReady && (
            <div className="waiting-ready-section">
              <button
                className={`waiting-ready-btn ${isCurrentUserReady ? 'ready' : ''}`}
                onClick={handleToggleReady}
              >
                {isCurrentUserReady ? '✓ Ready' : 'Ready Up'}
              </button>
              <div className="waiting-dots-container">
                <span className="waiting-dots-text">Waiting for all players to ready up</span>
                <span className="waiting-dots">
                  <span className="waiting-dot"></span>
                  <span className="waiting-dot"></span>
                  <span className="waiting-dot"></span>
                </span>
              </div>
            </div>
          )}

          {gameMode === 'multiplayer' && playerCount >= 2 && !isHostReady && (
            <div className="waiting-ready-section">
              {isHost ? (
                <>
                  <button
                    className={`waiting-ready-btn ${isCurrentUserReady ? 'ready' : ''}`}
                    onClick={handleToggleReady}
                  >
                    {isCurrentUserReady ? '✓ Ready' : 'Ready Up to Start'}
                  </button>
                  <div className="waiting-dots-container">
                    <span className="waiting-dots-text">Ready up to start the game</span>
                  </div>
                </>
              ) : (
                <div className="waiting-dots-container">
                  <span className="waiting-dots-text">Waiting for host to ready up and start...</span>
                  <span className="waiting-dots">
                    <span className="waiting-dot"></span>
                    <span className="waiting-dot"></span>
                    <span className="waiting-dot"></span>
                  </span>
                </div>
              )}
            </div>
          )}

          {gameMode === 'duel' && isFull && allPlayersReady && (
            <div className="waiting-ready-container">
              <span className="waiting-ready-text">All players ready!</span>
              {!isHost && (
                <span className="waiting-ready-subtext">Waiting for host to start...</span>
              )}
            </div>
          )}

          {gameMode === 'multiplayer' && playerCount >= 2 && isHostReady && !isHost && (
            <div className="waiting-ready-container">
              <span className="waiting-ready-text">Host is ready to start!</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="waiting-actions">
          {isHost && (
            <button
              className="waiting-start-btn"
              disabled={!canStart}
              onClick={handleStartGame}
              title={
                gameMode === 'duel'
                  ? (!isFull ? 'Waiting for opponent to join...' : !allPlayersReady ? 'Waiting for all players to ready up...' : 'Start the duel!')
                  : (playerCount < 2 ? 'Waiting for at least one more player...' : !isHostReady ? 'Ready up to start the game!' : 'Start the game!')
              }
            >
              {isStarting
                ? 'Starting...'
                : gameMode === 'duel'
                  ? (!isFull ? 'Waiting for Opponent...' : !allPlayersReady ? 'Waiting for Ready...' : 'Start Duel ⚔️')
                  : (playerCount < 2 ? 'Waiting for Players...' : !isHostReady ? 'Ready Up to Start' : 'Start Game ⚔️')
              }
            </button>
          )}
          <button className="waiting-leave-btn" onClick={handleLeave}>
            Leave Lobby
          </button>
        </div>
      </div>

      {/* Invite Friends Modal */}
      {showInviteModal && (
        <InviteFriendsModal
          onClose={() => setShowInviteModal(false)}
          lobbyDocId={lobbyDocId}
          gameId={lobby.gameId}
          difficulty={lobby.difficulty}
        />
      )}
    </div>
  );
}

export default WaitingRoom;
