import type { BracketStructure, BracketMatch, BracketRound } from '../../services/tournamentService'
import './TournamentBracket.css'

export interface TournamentBracketProps {
  bracket: BracketStructure
  onStartMatch?: (matchId: string) => void
  onForfeitMatch?: (matchId: string, forfeitingUid: string) => void
  isAdmin?: boolean
  currentUserUid?: string
  isPreview?: boolean
}

function TournamentBracket({
  bracket,
  onStartMatch,
  onForfeitMatch,
  isAdmin = false,
  currentUserUid,
  isPreview = false
}: TournamentBracketProps): React.JSX.Element {
  const getMatchStatusClass = (status: string): string => {
    switch (status) {
      case 'pending': return 'match-pending'
      case 'ready': return 'match-ready'
      case 'in_progress': return 'match-in-progress'
      case 'completed': return 'match-completed'
      case 'bye': return 'match-bye'
      default: return ''
    }
  }

  const renderParticipantSlot = (
    match: BracketMatch,
    participant: { uid: string; username: string; seed: number } | null,
    isWinner: boolean,
    slotNumber: 1 | 2
  ): React.JSX.Element => {
    if (!participant) {
      return (
        <div className="participant-slot empty">
          <span className="seed">-</span>
          <span className="name">TBD</span>
        </div>
      )
    }

    const isCurrentUser = currentUserUid === participant.uid
    const canForfeit = !isPreview && isAdmin && onForfeitMatch &&
      (match.status === 'ready' || match.status === 'in_progress')

    return (
      <div className={`participant-slot ${isWinner ? 'winner' : ''} ${isCurrentUser ? 'current-user' : ''}`}>
        <span className="seed">#{participant.seed}</span>
        <span className="name">{participant.username}</span>
        {isWinner && <span className="winner-badge">W</span>}
        {canForfeit && (
          <button
            className="forfeit-button"
            onClick={(e) => {
              e.stopPropagation()
              onForfeitMatch(match.matchId, participant.uid)
            }}
            title="Forfeit this player"
          >
            FF
          </button>
        )}
      </div>
    )
  }

  const renderMatch = (match: BracketMatch, roundNumber: number): React.JSX.Element => {
    const canStart = !isPreview && isAdmin && onStartMatch && match.status === 'ready'

    return (
      <div
        key={match.matchId}
        className={`bracket-match ${getMatchStatusClass(match.status)}`}
      >
        <div className="match-header">
          <span className="match-status">{match.status.replace('_', ' ')}</span>
          {match.lobbyDocId && (
            <span className="match-lobby-id" title={match.lobbyDocId}>
              Lobby Active
            </span>
          )}
        </div>

        <div className="match-participants">
          {renderParticipantSlot(
            match,
            match.participant1,
            match.winner === match.participant1?.uid,
            1
          )}
          <div className="vs-divider">vs</div>
          {renderParticipantSlot(
            match,
            match.participant2,
            match.winner === match.participant2?.uid,
            2
          )}
        </div>

        {canStart && (
          <button
            className="start-match-button"
            onClick={() => onStartMatch(match.matchId)}
          >
            Start Match
          </button>
        )}

        {match.status === 'bye' && (
          <div className="bye-indicator">
            {match.participant1?.username || match.participant2?.username} advances (BYE)
          </div>
        )}
      </div>
    )
  }

  const renderRound = (round: BracketRound): React.JSX.Element => {
    return (
      <div key={round.roundNumber} className="bracket-round">
        <div className="round-header">
          <span className="round-name">{round.roundName}</span>
          <span className={`round-status ${round.status}`}>{round.status}</span>
        </div>
        <div className="round-matches">
          {round.matches.map(match => renderMatch(match, round.roundNumber))}
        </div>
      </div>
    )
  }

  return (
    <div className="tournament-bracket">
      <div className="bracket-container">
        {bracket.rounds.map(round => renderRound(round))}
      </div>

      <div className="bracket-legend">
        <div className="legend-item">
          <span className="legend-dot pending"></span>
          <span>Pending</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot ready"></span>
          <span>Ready</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot in-progress"></span>
          <span>In Progress</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot completed"></span>
          <span>Completed</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot bye"></span>
          <span>BYE</span>
        </div>
      </div>
    </div>
  )
}

export default TournamentBracket
