import { useState, useCallback, useEffect, useRef } from 'react';
import { subscribeLobby, joinLobby, setPlayerReady, sendHeartbeat } from '../../services/lobbyService';
import { startDuel } from '../../services/duelService';
import { forfeitMatch, type UserTournamentMatch } from '../../services/tournamentService';
import type { LobbyDoc } from '../../services/lobbyService';
import './TournamentWaitingRoom.css';

export interface TournamentWaitingRoomProps {
  lobbyDocId: string;
  userUid: string;
  username: string;
  tournamentMatch: UserTournamentMatch;
  onLeave: () => void;
  onGameStart: () => void;
}

function TournamentWaitingRoom({
  lobbyDocId,
  userUid,
  username,
  tournamentMatch,
  onLeave,
  onGameStart
}: TournamentWaitingRoomProps): React.ReactElement {
  const [lobby, setLobby] = useState<LobbyDoc | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForfeiting, setIsForfeiting] = useState<boolean>(false);
  const [showForfeitConfirm, setShowForfeitConfirm] = useState<boolean>(false);
  const hasJoined = useRef<boolean>(false);
  const hasLeft = useRef<boolean>(false);
  const hasTriggeredStart = useRef<boolean>(false);

  // Subscribe to lobby updates
  useEffect(() => {
    const unsubscribe = subscribeLobby(lobbyDocId, (data, reason) => {
      if (!data) {
        if (reason === 'inactive') {
          setError('This match has been closed due to inactivity.');
        } else {
          setError('This match no longer exists.');
        }
        setLobby(null);
      } else {
        setLobby(data);
        setError(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [lobbyDocId]);

  // Join the lobby when it loads
  useEffect(() => {
    if (!lobby || hasJoined.current) return;

    const join = async () => {
      try {
        await joinLobby(lobbyDocId, userUid, username, lobby.difficulty);
        hasJoined.current = true;
        // Auto-ready for tournament matches
        await setPlayerReady(lobbyDocId, userUid, true);
      } catch (err) {
        console.error('Failed to join tournament lobby:', err);
        setError((err as Error).message || 'Failed to join match');
      }
    };

    join();
  }, [lobby, lobbyDocId, userUid, username]);

  // Send heartbeats
  useEffect(() => {
    if (!lobbyDocId || !userUid) return;

    sendHeartbeat(lobbyDocId, userUid).catch(() => {});

    const interval = setInterval(() => {
      if (!hasLeft.current) {
        sendHeartbeat(lobbyDocId, userUid).catch(() => {});
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [lobbyDocId, userUid]);

  // Auto-transition when game starts
  useEffect(() => {
    if (lobby?.status === 'in_progress') {
      onGameStart();
    }
  }, [lobby?.status, onGameStart]);

  // Auto-start when both players are ready (tournament matches don't have a host)
  useEffect(() => {
    if (!lobby || lobby.status !== 'waiting' || hasTriggeredStart.current) return;

    const readyStatus = lobby.readyStatus || {};
    const players = lobby.players || [];
    const bothReady = players.length >= 2 && players.every(p => readyStatus[p.uid]);

    if (!bothReady) return;

    // Use lowest UID to determine who triggers the start (avoids race condition)
    const sortedUids = players.map(p => p.uid).sort();
    const shouldTrigger = sortedUids[0] === userUid;

    if (shouldTrigger) {
      hasTriggeredStart.current = true;
      startDuel(lobbyDocId, players, lobby.difficulty).catch(err => {
        console.error('Failed to auto-start tournament match:', err);
        hasTriggeredStart.current = false;
      });
    }
  }, [lobby, lobbyDocId, userUid]);

  // Handle forfeit
  const handleForfeit = useCallback(async (): Promise<void> => {
    if (isForfeiting) return;
    setIsForfeiting(true);
    hasLeft.current = true;

    try {
      await forfeitMatch(
        tournamentMatch.tournamentId,
        tournamentMatch.matchId,
        userUid
      );
      onLeave();
    } catch (err) {
      console.error('Failed to forfeit:', err);
      setError((err as Error).message || 'Failed to forfeit match');
      hasLeft.current = false;
      setIsForfeiting(false);
    }
  }, [isForfeiting, tournamentMatch, userUid, onLeave]);

  if (isLoading) {
    return (
      <div className="tournament-waiting-screen">
        <div className="tournament-waiting-background">
          <div className="tournament-waiting-overlay"></div>
        </div>
        <div className="tournament-waiting-content">
          <div className="tournament-waiting-loading">
            <div className="tournament-waiting-spinner"></div>
            <p>Loading match...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !lobby) {
    return (
      <div className="tournament-waiting-screen">
        <div className="tournament-waiting-background">
          <div className="tournament-waiting-overlay"></div>
        </div>
        <div className="tournament-waiting-content">
          <div className="tournament-waiting-error">
            <p>{error || 'This match no longer exists.'}</p>
            <button className="tournament-waiting-back-btn" onClick={onLeave}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const readyStatus = lobby.readyStatus || {};
  const players = lobby.players || [];
  const bothReady = players.length >= 2 && players.every(p => readyStatus[p.uid]);

  return (
    <div className="tournament-waiting-screen">
      <div className="tournament-waiting-background">
        <div className="tournament-waiting-overlay"></div>
      </div>

      <div className="tournament-waiting-content">
        {/* Tournament Header */}
        <div className="tournament-waiting-header">
          <span className="tournament-waiting-trophy">🏆</span>
          <h1 className="tournament-waiting-title">{tournamentMatch.tournamentName}</h1>
          <span className="tournament-waiting-round">{tournamentMatch.roundName}</span>
        </div>

        {/* Match Info */}
        <div className="tournament-waiting-match">
          <div className="tournament-waiting-player self">
            <span className="tournament-waiting-player-name">{username}</span>
            <span className="tournament-waiting-player-status ready">Ready</span>
          </div>

          <div className="tournament-waiting-vs">VS</div>

          <div className="tournament-waiting-player opponent">
            <span className="tournament-waiting-player-name">{tournamentMatch.opponentUsername}</span>
            {players.find(p => p.uid === tournamentMatch.opponentUid) ? (
              <span className={`tournament-waiting-player-status ${readyStatus[tournamentMatch.opponentUid] ? 'ready' : 'not-ready'}`}>
                {readyStatus[tournamentMatch.opponentUid] ? 'Ready' : 'Joining...'}
              </span>
            ) : (
              <span className="tournament-waiting-player-status waiting">Waiting...</span>
            )}
          </div>
        </div>

        {/* Status Message */}
        <div className="tournament-waiting-status">
          {bothReady ? (
            <div className="tournament-waiting-status-ready">
              <span className="tournament-waiting-status-icon">⚔️</span>
              <span>Match starting...</span>
            </div>
          ) : (
            <div className="tournament-waiting-status-waiting">
              <span className="tournament-waiting-dots">
                <span className="tournament-waiting-dot"></span>
                <span className="tournament-waiting-dot"></span>
                <span className="tournament-waiting-dot"></span>
              </span>
              <span>Waiting for opponent to join</span>
            </div>
          )}
        </div>

        {/* Match Settings */}
        <div className="tournament-waiting-settings">
          <div className="tournament-waiting-setting">
            <span className="tournament-waiting-setting-label">Difficulty</span>
            <span className="tournament-waiting-setting-value">{lobby.difficulty}</span>
          </div>
          <div className="tournament-waiting-setting">
            <span className="tournament-waiting-setting-label">Round Time</span>
            <span className="tournament-waiting-setting-value">
              {lobby.roundTimeSeconds ? `${lobby.roundTimeSeconds}s` : 'No Limit'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="tournament-waiting-actions">
          {!showForfeitConfirm ? (
            <button
              className="tournament-waiting-forfeit-btn"
              onClick={() => setShowForfeitConfirm(true)}
              disabled={isForfeiting}
            >
              Forfeit Match
            </button>
          ) : (
            <div className="tournament-waiting-forfeit-confirm">
              <p>Are you sure you want to forfeit? This will eliminate you from the tournament.</p>
              <div className="tournament-waiting-forfeit-buttons">
                <button
                  className="tournament-waiting-forfeit-cancel"
                  onClick={() => setShowForfeitConfirm(false)}
                  disabled={isForfeiting}
                >
                  Cancel
                </button>
                <button
                  className="tournament-waiting-forfeit-confirm-btn"
                  onClick={handleForfeit}
                  disabled={isForfeiting}
                >
                  {isForfeiting ? 'Forfeiting...' : 'Yes, Forfeit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TournamentWaitingRoom;
