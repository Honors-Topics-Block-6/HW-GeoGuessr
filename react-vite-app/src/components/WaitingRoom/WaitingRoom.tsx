import { useState, useCallback, useEffect } from 'react';
import { useWaitingRoom } from '../../hooks/useLobby';
import { startDuel } from '../../services/duelService';
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
  maxPlayers?: number;
  status?: string;
  roundTimeSeconds?: number;
  timingRule?: 'simultaneous' | 'afterFirstGuess';
  afterFirstGuessSeconds?: number;
}

export interface WaitingRoomProps {
  lobbyDocId: string;
  userUid: string;
  onLeave: () => void;
  onGameStart: () => void;
}

function WaitingRoom({ lobbyDocId, userUid, onLeave, onGameStart }: WaitingRoomProps): React.ReactElement {
  const { lobby, isLoading, error, leave } = useWaitingRoom(lobbyDocId, userUid);
  const [copied, setCopied] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);

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
      await startDuel(lobbyDocId, lobby.players, lobby.difficulty, {
        roundTimeSeconds: lobby.roundTimeSeconds,
        timingRule: lobby.timingRule,
        afterFirstGuessSeconds: lobby.afterFirstGuessSeconds
      });
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
  const maxPlayers: number = lobby.maxPlayers || 2;
  const isFull: boolean = playerCount >= maxPlayers;
  const canStart: boolean = isHost && isFull && !isStarting;

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
          <p className="waiting-code-hint">Share this code with your opponent to invite them</p>
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
            {playerCount}/{maxPlayers} Players
          </span>
          <span className="waiting-badge waiting-badge-mode">
            ⚔️ Duel
          </span>
        </div>

        {/* Player List */}
        <div className="waiting-players">
          <h2 className="waiting-players-heading">Players</h2>
          <div className="waiting-players-list">
            {lobby.players?.map((player: LobbyPlayer) => (
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
                {player.uid === lobby.hostUid && (
                  <span className="waiting-player-role">Host</span>
                )}
              </div>
            ))}
          </div>

          {/* Waiting animation */}
          {!isFull && (
            <>
              <div className="waiting-dots-container">
                <span className="waiting-dots-text">Waiting for opponent</span>
                <span className="waiting-dots">
                  <span className="waiting-dot"></span>
                  <span className="waiting-dot"></span>
                  <span className="waiting-dot"></span>
                </span>
              </div>
              <button
                className="waiting-invite-btn"
                onClick={() => setShowInviteModal(true)}
              >
                👥 Invite Friends
              </button>
            </>
          )}

          {isFull && !isHost && (
            <div className="waiting-dots-container">
              <span className="waiting-dots-text">Waiting for host to start</span>
              <span className="waiting-dots">
                <span className="waiting-dot"></span>
                <span className="waiting-dot"></span>
                <span className="waiting-dot"></span>
              </span>
            </div>
          )}

          {isFull && isHost && (
            <div className="waiting-ready-container">
              <span className="waiting-ready-text">Both players ready!</span>
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
              title={!isFull ? 'Waiting for opponent to join...' : 'Start the duel!'}
            >
              {isStarting ? 'Starting...' : isFull ? 'Start Duel ⚔️' : 'Waiting for Opponent...'}
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
          difficulty={lobby.difficulty}
        />
      )}
    </div>
  );
}

export default WaitingRoom;
