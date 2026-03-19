import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeTournaments,
  subscribeTournament,
  createTournament,
  addParticipant,
  removeParticipant,
  updateSeeding,
  startTournament,
  startRound,
  startMatch,
  forfeitMatch,
  cancelTournament,
  searchUsersForTournament,
  regenerateBracketPreview,
  updateRoundDifficulty,
  DEFAULT_TOURNAMENT_SETTINGS,
  type TournamentDoc,
  type TournamentParticipant,
  type TournamentSettings,
  type BracketType,
  type SeedingType,
  type RoundDifficulty
} from '../../services/tournamentService'
import TournamentBracket from './TournamentBracket'
import './TournamentManagement.css'

type DetailTab = 'participants' | 'bracket' | 'controls'

interface CreateTournamentForm {
  name: string
  bracketType: BracketType
  seedingType: SeedingType
  difficulty: TournamentSettings['difficulty']
  roundTimeSeconds: number
  timePenaltyEnabled: boolean
  roundsPerMatch: number
  matchTimeoutMinutes: number
}

const DEFAULT_FORM: CreateTournamentForm = {
  name: '',
  bracketType: 'single_elimination',
  seedingType: 'random',
  difficulty: 'all',
  roundTimeSeconds: 30,
  timePenaltyEnabled: false,
  roundsPerMatch: 1,
  matchTimeoutMinutes: 30
}

function TournamentManagement(): React.JSX.Element {
  const { user } = useAuth()

  // List state
  const [tournaments, setTournaments] = useState<TournamentDoc[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  // Selected tournament state
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<TournamentDoc | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('participants')

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false)
  const [createForm, setCreateForm] = useState<CreateTournamentForm>(DEFAULT_FORM)
  const [creating, setCreating] = useState<boolean>(false)

  // Participant management state
  const [userSearch, setUserSearch] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<{ uid: string; username: string }>>([])
  const [searching, setSearching] = useState<boolean>(false)
  const [addingParticipant, setAddingParticipant] = useState<string | null>(null)

  // Action state
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const [generatingPreview, setGeneratingPreview] = useState<boolean>(false)

  // Subscribe to tournaments list
  useEffect(() => {
    const unsubscribe = subscribeTournaments((data) => {
      setTournaments(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to selected tournament
  useEffect(() => {
    if (!selectedTournamentId) {
      setSelectedTournament(null)
      return
    }

    const unsubscribe = subscribeTournament(selectedTournamentId, (data) => {
      setSelectedTournament(data)
    })
    return () => unsubscribe()
  }, [selectedTournamentId])

  // Search for users
  const handleUserSearch = useCallback(async (term: string) => {
    setUserSearch(term)
    if (term.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const excludeUids = selectedTournament?.participants.map(p => p.uid) || []
      const results = await searchUsersForTournament(term, excludeUids)
      setSearchResults(results)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }, [selectedTournament])

  // Create tournament
  const handleCreateTournament = async (): Promise<void> => {
    if (!user?.uid || !createForm.name.trim()) return

    setCreating(true)
    setActionError(null)

    try {
      const settings: TournamentSettings = {
        difficulty: createForm.difficulty,
        roundTimeSeconds: createForm.roundTimeSeconds,
        timePenaltyEnabled: createForm.timePenaltyEnabled,
        roundsPerMatch: createForm.roundsPerMatch,
        matchTimeoutMinutes: createForm.matchTimeoutMinutes
      }

      const id = await createTournament(
        createForm.name.trim(),
        settings,
        createForm.bracketType,
        createForm.seedingType,
        user.uid
      )

      setShowCreateModal(false)
      setCreateForm(DEFAULT_FORM)
      setSelectedTournamentId(id)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to create tournament')
    } finally {
      setCreating(false)
    }
  }

  // Add participant
  const handleAddParticipant = async (uid: string, username: string): Promise<void> => {
    if (!selectedTournamentId) return

    setAddingParticipant(uid)
    setActionError(null)

    try {
      await addParticipant(selectedTournamentId, uid, username)
      setUserSearch('')
      setSearchResults([])
    } catch (err) {
      setActionError((err as Error).message || 'Failed to add participant')
    } finally {
      setAddingParticipant(null)
    }
  }

  // Remove participant
  const handleRemoveParticipant = async (uid: string): Promise<void> => {
    if (!selectedTournamentId) return

    setActionLoading(true)
    setActionError(null)

    try {
      await removeParticipant(selectedTournamentId, uid)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to remove participant')
    } finally {
      setActionLoading(false)
    }
  }

  // Reorder participants (drag and drop simulation via buttons)
  const handleMoveParticipant = async (uid: string, direction: 'up' | 'down'): Promise<void> => {
    if (!selectedTournament) return

    const participants = [...selectedTournament.participants]
    const index = participants.findIndex(p => p.uid === uid)
    if (index === -1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= participants.length) return

    // Swap
    const temp = participants[index]
    participants[index] = participants[newIndex]
    participants[newIndex] = temp

    setActionLoading(true)
    setActionError(null)

    try {
      await updateSeeding(selectedTournament.id, participants)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to update seeding')
    } finally {
      setActionLoading(false)
    }
  }

  // Start tournament
  const handleStartTournament = async (): Promise<void> => {
    if (!selectedTournamentId) return

    setActionLoading(true)
    setActionError(null)

    try {
      await startTournament(selectedTournamentId)
      setDetailTab('bracket')
    } catch (err) {
      setActionError((err as Error).message || 'Failed to start tournament')
    } finally {
      setActionLoading(false)
    }
  }

  // Start round
  const handleStartRound = async (roundNumber: number): Promise<void> => {
    if (!selectedTournamentId) return

    setActionLoading(true)
    setActionError(null)

    try {
      await startRound(selectedTournamentId, roundNumber)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to start round')
    } finally {
      setActionLoading(false)
    }
  }

  // Start match
  const handleStartMatch = async (matchId: string): Promise<void> => {
    if (!selectedTournamentId) return

    setActionLoading(true)
    setActionError(null)

    try {
      await startMatch(selectedTournamentId, matchId)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to start match')
    } finally {
      setActionLoading(false)
    }
  }

  // Forfeit match
  const handleForfeitMatch = async (matchId: string, forfeitingUid: string): Promise<void> => {
    if (!selectedTournamentId) return

    if (!confirm('Are you sure you want to forfeit this player?')) return

    setActionLoading(true)
    setActionError(null)

    try {
      await forfeitMatch(selectedTournamentId, matchId, forfeitingUid)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to forfeit match')
    } finally {
      setActionLoading(false)
    }
  }

  // Cancel tournament
  const handleCancelTournament = async (): Promise<void> => {
    if (!selectedTournamentId) return

    if (!confirm('Are you sure you want to cancel this tournament? This cannot be undone.')) return

    setActionLoading(true)
    setActionError(null)

    try {
      await cancelTournament(selectedTournamentId)
      setSelectedTournamentId(null)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to cancel tournament')
    } finally {
      setActionLoading(false)
    }
  }

  // Generate bracket preview
  const handleGeneratePreview = async (): Promise<void> => {
    if (!selectedTournamentId) return

    setGeneratingPreview(true)
    setActionError(null)

    try {
      await regenerateBracketPreview(selectedTournamentId)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to generate bracket preview')
    } finally {
      setGeneratingPreview(false)
    }
  }

  // Update round difficulty
  const handleRoundDifficultyChange = async (roundNumber: number, difficulty: RoundDifficulty): Promise<void> => {
    if (!selectedTournamentId) return

    setActionError(null)

    try {
      await updateRoundDifficulty(selectedTournamentId, roundNumber, difficulty)
    } catch (err) {
      setActionError((err as Error).message || 'Failed to update round difficulty')
    }
  }

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'setup': return 'status-setup'
      case 'active': return 'status-active'
      case 'completed': return 'status-completed'
      case 'cancelled': return 'status-cancelled'
      default: return ''
    }
  }

  // Render tournament list
  const renderTournamentList = (): React.JSX.Element => (
    <div className="tournament-list">
      <div className="tournament-list-header">
        <h3>Tournaments</h3>
        <button
          className="create-tournament-button"
          onClick={() => setShowCreateModal(true)}
        >
          + Create Tournament
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading tournaments...</div>
      ) : tournaments.length === 0 ? (
        <div className="empty-state">No tournaments yet. Create one to get started.</div>
      ) : (
        <div className="tournament-cards">
          {tournaments.map(t => (
            <div
              key={t.id}
              className={`tournament-card ${selectedTournamentId === t.id ? 'selected' : ''}`}
              onClick={() => setSelectedTournamentId(t.id)}
            >
              <div className="tournament-card-header">
                <span className="tournament-name">{t.name}</span>
                <span className={`tournament-status ${getStatusBadgeClass(t.status)}`}>
                  {t.status}
                </span>
              </div>
              <div className="tournament-card-info">
                <span>{t.participants.length} participants</span>
                <span>{t.bracketType.replace('_', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Render create modal
  const renderCreateModal = (): React.JSX.Element | null => {
    if (!showCreateModal) return null

    return (
      <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
        <div className="modal-content create-tournament-modal" onClick={e => e.stopPropagation()}>
          <h3>Create Tournament</h3>

          <div className="form-group">
            <label>Tournament Name</label>
            <input
              type="text"
              value={createForm.name}
              onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Spring Championship 2024"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Bracket Type</label>
              <select
                value={createForm.bracketType}
                onChange={e => setCreateForm(f => ({ ...f, bracketType: e.target.value as BracketType }))}
              >
                <option value="single_elimination">Single Elimination</option>
              </select>
            </div>

            <div className="form-group">
              <label>Seeding</label>
              <select
                value={createForm.seedingType}
                onChange={e => setCreateForm(f => ({ ...f, seedingType: e.target.value as SeedingType }))}
              >
                <option value="random">Random</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Difficulty</label>
              <select
                value={createForm.difficulty}
                onChange={e => setCreateForm(f => ({ ...f, difficulty: e.target.value as TournamentSettings['difficulty'] }))}
              >
                <option value="all">All</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="form-group">
              <label>Round Time (seconds)</label>
              <input
                type="number"
                value={createForm.roundTimeSeconds}
                onChange={e => setCreateForm(f => ({ ...f, roundTimeSeconds: parseInt(e.target.value) || 0 }))}
                min={0}
                max={300}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Match Timeout (minutes)</label>
              <input
                type="number"
                value={createForm.matchTimeoutMinutes}
                onChange={e => setCreateForm(f => ({ ...f, matchTimeoutMinutes: parseInt(e.target.value) || 30 }))}
                min={5}
                max={120}
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={createForm.timePenaltyEnabled}
                  onChange={e => setCreateForm(f => ({ ...f, timePenaltyEnabled: e.target.checked }))}
                />
                Time Penalty Enabled
              </label>
            </div>
          </div>

          {actionError && <div className="action-error">{actionError}</div>}

          <div className="modal-actions">
            <button
              className="cancel-button"
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              Cancel
            </button>
            <button
              className="confirm-button"
              onClick={handleCreateTournament}
              disabled={creating || !createForm.name.trim()}
            >
              {creating ? 'Creating...' : 'Create Tournament'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render participants tab
  const renderParticipantsTab = (): React.JSX.Element | null => {
    if (!selectedTournament) return null

    const isSetup = selectedTournament.status === 'setup'

    return (
      <div className="participants-tab">
        {isSetup && (
          <div className="add-participant-section">
            <h4>Add Participant</h4>
            <div className="search-input-wrapper">
              <input
                type="text"
                value={userSearch}
                onChange={e => handleUserSearch(e.target.value)}
                placeholder="Search by username..."
              />
              {searching && <span className="search-spinner">...</span>}
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map(u => (
                  <div key={u.uid} className="search-result-item">
                    <span>{u.username}</span>
                    <button
                      onClick={() => handleAddParticipant(u.uid, u.username)}
                      disabled={addingParticipant === u.uid}
                    >
                      {addingParticipant === u.uid ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="participants-list">
          <h4>Participants ({selectedTournament.participants.length})</h4>

          {selectedTournament.participants.length === 0 ? (
            <div className="empty-state">No participants yet.</div>
          ) : (
            <div className="participants-table">
              {selectedTournament.participants.map((p, idx) => (
                <div key={p.uid} className="participant-row">
                  <span className="seed-number">#{p.seed}</span>
                  <span className="participant-name">{p.username}</span>

                  {p.eliminatedInRound && (
                    <span className="eliminated-badge">Eliminated R{p.eliminatedInRound}</span>
                  )}

                  {isSetup && (
                    <div className="participant-actions">
                      <button
                        className="move-button"
                        onClick={() => handleMoveParticipant(p.uid, 'up')}
                        disabled={idx === 0 || actionLoading}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="move-button"
                        onClick={() => handleMoveParticipant(p.uid, 'down')}
                        disabled={idx === selectedTournament.participants.length - 1 || actionLoading}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="remove-button"
                        onClick={() => handleRemoveParticipant(p.uid)}
                        disabled={actionLoading}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render bracket tab
  const renderBracketTab = (): React.JSX.Element | null => {
    if (!selectedTournament) return null

    const isSetup = selectedTournament.status === 'setup'

    // Show preview or bracket
    if (isSetup) {
      return (
        <div className="bracket-tab">
          <div className="bracket-preview-header">
            <h4>Bracket Preview</h4>
            <button
              className="generate-preview-button"
              onClick={handleGeneratePreview}
              disabled={generatingPreview || selectedTournament.participants.length < 2}
            >
              {generatingPreview ? 'Generating...' : selectedTournament.bracketPreview ? 'Regenerate Preview' : 'Generate Preview'}
            </button>
          </div>
          {selectedTournament.participants.length < 2 ? (
            <p className="bracket-empty-message">Add at least 2 participants to preview the bracket.</p>
          ) : !selectedTournament.bracketPreview ? (
            <p className="bracket-empty-message">Click "Generate Preview" to see the bracket structure.</p>
          ) : (
            <>
              <p className="bracket-preview-note">
                This is a preview. The bracket will be finalized when you start the tournament.
              </p>
              <div className="round-difficulty-config">
                <h5>Round Difficulties</h5>
                <div className="round-difficulty-list">
                  {selectedTournament.bracketPreview.rounds.map(round => (
                    <div key={round.roundNumber} className="round-difficulty-row">
                      <span className="round-difficulty-name">{round.roundName}</span>
                      <select
                        className="round-difficulty-select"
                        value={round.difficulty}
                        onChange={(e) => handleRoundDifficultyChange(round.roundNumber, e.target.value as RoundDifficulty)}
                      >
                        <option value="all">All</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <TournamentBracket
                bracket={selectedTournament.bracketPreview}
                onStartMatch={handleStartMatch}
                onForfeitMatch={handleForfeitMatch}
                isAdmin={true}
                isPreview={true}
              />
            </>
          )}
        </div>
      )
    }

    if (!selectedTournament.bracket) {
      return (
        <div className="bracket-tab empty">
          <p>Bracket not available.</p>
        </div>
      )
    }

    return (
      <div className="bracket-tab">
        <div className="round-difficulty-config">
          <h5>Round Difficulties</h5>
          <div className="round-difficulty-list">
            {selectedTournament.bracket.rounds.map(round => (
              <div key={round.roundNumber} className="round-difficulty-row">
                <span className="round-difficulty-name">{round.roundName}</span>
                <select
                  className="round-difficulty-select"
                  value={round.difficulty}
                  onChange={(e) => handleRoundDifficultyChange(round.roundNumber, e.target.value as RoundDifficulty)}
                  disabled={round.status === 'active' || round.status === 'completed'}
                >
                  <option value="all">All</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                {(round.status === 'active' || round.status === 'completed') && (
                  <span className="round-difficulty-locked">Locked</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <TournamentBracket
          bracket={selectedTournament.bracket}
          onStartMatch={handleStartMatch}
          onForfeitMatch={handleForfeitMatch}
          isAdmin={true}
        />
      </div>
    )
  }

  // Render controls tab
  const renderControlsTab = (): React.JSX.Element | null => {
    if (!selectedTournament) return null

    const isSetup = selectedTournament.status === 'setup'
    const isActive = selectedTournament.status === 'active'
    const bracket = selectedTournament.bracket

    return (
      <div className="controls-tab">
        <h4>Tournament Controls</h4>

        {actionError && <div className="action-error">{actionError}</div>}

        {isSetup && (
          <div className="control-section">
            <p>Tournament is in setup mode. Add participants and configure settings.</p>
            <button
              className="start-tournament-button"
              onClick={handleStartTournament}
              disabled={actionLoading || selectedTournament.participants.length < 2}
            >
              {actionLoading ? 'Starting...' : 'Start Tournament'}
            </button>
            {selectedTournament.participants.length < 2 && (
              <p className="helper-text">Need at least 2 participants to start.</p>
            )}
          </div>
        )}

        {isActive && bracket && (
          <div className="control-section">
            <h5>Round Controls</h5>
            {bracket.rounds.map(round => {
              const canStart = round.status === 'pending' &&
                (round.roundNumber === 1 ||
                  bracket.rounds[round.roundNumber - 2]?.status === 'completed')

              const hasReadyMatches = round.matches.some(m => m.status === 'ready')
              const allCompleted = round.matches.every(
                m => m.status === 'completed' || m.status === 'bye'
              )

              return (
                <div key={round.roundNumber} className="round-control">
                  <span className="round-name">{round.roundName}</span>
                  <span className={`round-status ${round.status}`}>{round.status}</span>

                  {canStart && (
                    <button
                      className="start-round-button"
                      onClick={() => handleStartRound(round.roundNumber)}
                      disabled={actionLoading}
                    >
                      Start Round
                    </button>
                  )}

                  {round.status === 'active' && !allCompleted && (
                    <span className="round-info">
                      {round.matches.filter(m => m.status === 'completed' || m.status === 'bye').length}
                      /{round.matches.length} matches complete
                    </span>
                  )}

                  {allCompleted && (
                    <span className="round-complete-badge">Complete</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {selectedTournament.status === 'completed' && (
          <div className="control-section">
            <p className="tournament-complete-message">
              Tournament completed! Winner: {
                selectedTournament.participants.find(p => p.uid === selectedTournament.winner)?.username || 'Unknown'
              }
            </p>
          </div>
        )}

        {(isSetup || isActive) && (
          <div className="control-section danger-zone">
            <h5>Danger Zone</h5>
            <button
              className="cancel-tournament-button"
              onClick={handleCancelTournament}
              disabled={actionLoading}
            >
              Cancel Tournament
            </button>
          </div>
        )}
      </div>
    )
  }

  // Render tournament detail
  const renderTournamentDetail = (): React.JSX.Element | null => {
    if (!selectedTournament) {
      return (
        <div className="tournament-detail empty">
          <p>Select a tournament to view details</p>
        </div>
      )
    }

    return (
      <div className="tournament-detail">
        <div className="detail-header">
          <button className="back-button" onClick={() => setSelectedTournamentId(null)}>
            ← Back
          </button>
          <h3>{selectedTournament.name}</h3>
          <span className={`tournament-status ${getStatusBadgeClass(selectedTournament.status)}`}>
            {selectedTournament.status}
          </span>
        </div>

        <div className="detail-tabs">
          <button
            className={`detail-tab ${detailTab === 'participants' ? 'active' : ''}`}
            onClick={() => setDetailTab('participants')}
          >
            Participants
          </button>
          <button
            className={`detail-tab ${detailTab === 'bracket' ? 'active' : ''}`}
            onClick={() => setDetailTab('bracket')}
          >
            Bracket
          </button>
          <button
            className={`detail-tab ${detailTab === 'controls' ? 'active' : ''}`}
            onClick={() => setDetailTab('controls')}
          >
            Controls
          </button>
        </div>

        <div className="detail-content">
          {detailTab === 'participants' && renderParticipantsTab()}
          {detailTab === 'bracket' && renderBracketTab()}
          {detailTab === 'controls' && renderControlsTab()}
        </div>
      </div>
    )
  }

  return (
    <div className="tournament-management">
      <div className="tournament-layout">
        {renderTournamentList()}
        {renderTournamentDetail()}
      </div>
      {renderCreateModal()}
    </div>
  )
}

export default TournamentManagement
