import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type FieldValue
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLobby } from './lobbyService';

// ────── Types ──────

export type TournamentStatus = 'setup' | 'active' | 'completed' | 'cancelled';
export type BracketType = 'single_elimination';
export type SeedingType = 'random' | 'manual';
export type RoundStatus = 'pending' | 'active' | 'completed';
export type MatchStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'bye';

export interface TournamentParticipant {
  uid: string;
  username: string;
  seed: number;
  eliminatedInRound: number | null;
}

export interface TournamentSettings {
  difficulty: 'all' | 'easy' | 'medium' | 'hard';
  roundTimeSeconds: number;
  timePenaltyEnabled: boolean;
  roundsPerMatch: number;
  matchTimeoutMinutes: number;
}

export interface MatchParticipant {
  uid: string;
  username: string;
  seed: number;
}

export interface BracketMatch {
  matchId: string;
  participant1: MatchParticipant | null;
  participant2: MatchParticipant | null;
  status: MatchStatus;
  winner: string | null;
  lobbyDocId: string | null;
  nextMatchId: string | null;
  slotInNextMatch?: 1 | 2;
}

export interface BracketRound {
  roundNumber: number;
  roundName: string;
  matches: BracketMatch[];
  status: RoundStatus;
}

export interface BracketStructure {
  rounds: BracketRound[];
  totalRounds: number;
  currentRoundNumber: number;
}

export interface TournamentDoc {
  id: string;
  name: string;
  status: TournamentStatus;
  bracketType: BracketType;
  seedingType: SeedingType;
  participants: TournamentParticipant[];
  settings: TournamentSettings;
  bracket: BracketStructure | null;
  bracketPreview: BracketStructure | null;
  createdBy: string;
  createdAt: Timestamp | FieldValue | null;
  startedAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  winner: string | null;
}

export interface UserTournamentMatch {
  tournamentId: string;
  tournamentName: string;
  matchId: string;
  roundNumber: number;
  roundName: string;
  opponentUid: string;
  opponentUsername: string;
  status: MatchStatus;
  lobbyDocId: string | null;
}

// ────── Constants ──────

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  difficulty: 'all',
  roundTimeSeconds: 30,
  timePenaltyEnabled: false,
  roundsPerMatch: 1,
  matchTimeoutMinutes: 30
};

// ────── Helper Functions ──────

/**
 * Calculate the next power of 2 >= n
 */
function nextPowerOf2(n: number): number {
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

/**
 * Generate a unique match ID
 */
function generateMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get round name based on number of participants remaining
 */
function getRoundName(roundNumber: number, totalRounds: number): string {
  const roundsFromFinal = totalRounds - roundNumber;
  switch (roundsFromFinal) {
    case 0: return 'Finals';
    case 1: return 'Semifinals';
    case 2: return 'Quarterfinals';
    case 3: return 'Round of 16';
    case 4: return 'Round of 32';
    case 5: return 'Round of 64';
    default: return `Round ${roundNumber}`;
  }
}

/**
 * Standard bracket seeding: 1v16, 8v9, 5v12, 4v13, 3v14, 6v11, 7v10, 2v15
 * This ensures top seeds don't meet until later rounds
 */
function generateSeedPairings(bracketSize: number): Array<[number, number]> {
  const pairings: Array<[number, number]> = [];

  function generatePairingsRecursive(seeds: number[]): number[] {
    if (seeds.length === 2) {
      return seeds;
    }

    const half = seeds.length / 2;
    const top: number[] = [];
    const bottom: number[] = [];

    for (let i = 0; i < half; i++) {
      top.push(seeds[i]);
      bottom.push(seeds[seeds.length - 1 - i]);
    }

    const topResult = generatePairingsRecursive(top);
    const bottomResult = generatePairingsRecursive(bottom);

    return [...topResult, ...bottomResult];
  }

  const seeds = Array.from({ length: bracketSize }, (_, i) => i + 1);
  const orderedSeeds = generatePairingsRecursive(seeds);

  for (let i = 0; i < orderedSeeds.length; i += 2) {
    pairings.push([orderedSeeds[i], orderedSeeds[i + 1]]);
  }

  return pairings;
}

/**
 * Generate bracket structure from participants
 */
function generateBracket(
  participants: TournamentParticipant[],
  seedingType: SeedingType
): BracketStructure {
  const participantCount = participants.length;
  const bracketSize = nextPowerOf2(participantCount);
  const totalRounds = Math.log2(bracketSize);
  const byeCount = bracketSize - participantCount;

  // Prepare participants with seeding
  let seededParticipants: TournamentParticipant[];
  if (seedingType === 'random') {
    // Shuffle and assign seeds
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    seededParticipants = shuffled.map((p, idx) => ({
      ...p,
      seed: idx + 1
    }));
  } else {
    // Manual - use existing seeds, sort by seed
    seededParticipants = [...participants].sort((a, b) => a.seed - b.seed);
  }

  // Create a map of seed -> participant
  const participantBySeed = new Map<number, TournamentParticipant>();
  seededParticipants.forEach(p => {
    participantBySeed.set(p.seed, p);
  });

  // Generate pairings based on bracket size
  const pairings = generateSeedPairings(bracketSize);

  // Generate all rounds
  const rounds: BracketRound[] = [];
  let previousRoundMatches: BracketMatch[] = [];

  for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
    const matchCount = bracketSize / Math.pow(2, roundNum);
    const matches: BracketMatch[] = [];

    for (let i = 0; i < matchCount; i++) {
      const matchId = generateMatchId();

      if (roundNum === 1) {
        // First round - use pairings
        const [seed1, seed2] = pairings[i];
        const p1 = participantBySeed.get(seed1);
        const p2 = participantBySeed.get(seed2);

        // If either participant is missing (bye), the other auto-advances
        const isBye = !p1 || !p2;

        matches.push({
          matchId,
          participant1: p1 ? { uid: p1.uid, username: p1.username, seed: p1.seed } : null,
          participant2: p2 ? { uid: p2.uid, username: p2.username, seed: p2.seed } : null,
          status: isBye ? 'bye' : 'pending',
          winner: isBye ? (p1?.uid || p2?.uid || null) : null,
          lobbyDocId: null,
          nextMatchId: null
        });
      } else {
        // Later rounds - empty slots filled by winners
        matches.push({
          matchId,
          participant1: null,
          participant2: null,
          status: 'pending',
          winner: null,
          lobbyDocId: null,
          nextMatchId: null
        });
      }
    }

    // Link previous round matches to this round
    if (previousRoundMatches.length > 0) {
      for (let i = 0; i < previousRoundMatches.length; i++) {
        const nextMatchIndex = Math.floor(i / 2);
        const slotInNextMatch = (i % 2 === 0 ? 1 : 2) as 1 | 2;
        previousRoundMatches[i].nextMatchId = matches[nextMatchIndex].matchId;
        previousRoundMatches[i].slotInNextMatch = slotInNextMatch;
      }
    }

    rounds.push({
      roundNumber: roundNum,
      roundName: getRoundName(roundNum, totalRounds),
      matches,
      status: 'pending'
    });

    previousRoundMatches = matches;
  }

  return {
    rounds,
    totalRounds,
    currentRoundNumber: 1
  };
}

/**
 * Propagate bye winners to the next round
 */
function propagateByeWinners(bracket: BracketStructure): BracketStructure {
  const updatedBracket = { ...bracket, rounds: bracket.rounds.map(r => ({ ...r, matches: [...r.matches] })) };

  for (const round of updatedBracket.rounds) {
    for (const match of round.matches) {
      if (match.status === 'bye' && match.winner && match.nextMatchId) {
        // Find the next match and fill in the winner
        for (const nextRound of updatedBracket.rounds) {
          const nextMatch = nextRound.matches.find(m => m.matchId === match.nextMatchId);
          if (nextMatch) {
            const winnerParticipant = match.participant1?.uid === match.winner
              ? match.participant1
              : match.participant2;

            if (winnerParticipant) {
              if (match.slotInNextMatch === 1) {
                nextMatch.participant1 = winnerParticipant;
              } else {
                nextMatch.participant2 = winnerParticipant;
              }
            }
            break;
          }
        }
      }
    }
  }

  return updatedBracket;
}

// ────── Tournament CRUD Functions ──────

/**
 * Create a new tournament
 */
export async function createTournament(
  name: string,
  settings: TournamentSettings,
  bracketType: BracketType,
  seedingType: SeedingType,
  createdBy: string
): Promise<string> {
  const tournamentData = {
    name,
    status: 'setup' as TournamentStatus,
    bracketType,
    seedingType,
    participants: [],
    settings,
    bracket: null,
    bracketPreview: null,
    createdBy,
    createdAt: serverTimestamp(),
    startedAt: null,
    completedAt: null,
    winner: null
  };

  const docRef = await addDoc(collection(db, 'tournaments'), tournamentData);
  return docRef.id;
}

/**
 * Get a tournament by ID
 */
export async function getTournament(id: string): Promise<TournamentDoc | null> {
  const docRef = doc(db, 'tournaments', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  return { id: docSnap.id, ...docSnap.data() } as TournamentDoc;
}

/**
 * Subscribe to a tournament for real-time updates
 */
export function subscribeTournament(
  id: string,
  callback: (tournament: TournamentDoc | null) => void
): () => void {
  const docRef = doc(db, 'tournaments', id);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() } as TournamentDoc);
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to all tournaments
 */
export function subscribeTournaments(
  callback: (tournaments: TournamentDoc[]) => void
): () => void {
  const q = query(
    collection(db, 'tournaments'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const tournaments = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as TournamentDoc[];
    callback(tournaments);
  }, (error) => {
    console.error('Error subscribing to tournaments:', error);
    // Fallback without ordering
    const fallbackQ = query(collection(db, 'tournaments'));
    return onSnapshot(fallbackQ, (snapshot) => {
      const tournaments = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as TournamentDoc[];
      tournaments.sort((a, b) => {
        const aTime = (a.createdAt as Timestamp | null)?.toMillis?.() || 0;
        const bTime = (b.createdAt as Timestamp | null)?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(tournaments);
    });
  });
}

/**
 * Update tournament settings
 */
export async function updateTournamentSettings(
  tournamentId: string,
  settings: Partial<TournamentSettings>
): Promise<void> {
  const docRef = doc(db, 'tournaments', tournamentId);
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot update settings after tournament has started');

  await updateDoc(docRef, {
    settings: { ...tournament.settings, ...settings }
  });
}

/**
 * Update tournament name
 */
export async function updateTournamentName(
  tournamentId: string,
  name: string
): Promise<void> {
  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, { name });
}

/**
 * Cancel a tournament
 */
export async function cancelTournament(tournamentId: string): Promise<void> {
  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    status: 'cancelled',
    completedAt: serverTimestamp()
  });
}

// ────── Participant Management ──────

/**
 * Add a participant to a tournament
 */
export async function addParticipant(
  tournamentId: string,
  uid: string,
  username: string
): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot add participants after tournament has started');
  if (tournament.participants.some(p => p.uid === uid)) {
    throw new Error('User is already a participant');
  }

  const newParticipant: TournamentParticipant = {
    uid,
    username,
    seed: tournament.participants.length + 1,
    eliminatedInRound: null
  };

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    participants: [...tournament.participants, newParticipant]
  });
}

/**
 * Remove a participant from a tournament
 */
export async function removeParticipant(
  tournamentId: string,
  uid: string
): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot remove participants after tournament has started');

  const updatedParticipants = tournament.participants
    .filter(p => p.uid !== uid)
    .map((p, idx) => ({ ...p, seed: idx + 1 }));

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    participants: updatedParticipants
  });
}

/**
 * Update seeding order
 */
export async function updateSeeding(
  tournamentId: string,
  participants: TournamentParticipant[]
): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot update seeding after tournament has started');

  // Re-assign seeds based on order
  const reseeded = participants.map((p, idx) => ({
    ...p,
    seed: idx + 1
  }));

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    participants: reseeded,
    seedingType: 'manual' as SeedingType
  });
}

// ────── Bracket Preview ──────

/**
 * Generate and save bracket preview (without starting tournament)
 * Call this when participants change to show admin a preview
 */
export async function regenerateBracketPreview(tournamentId: string): Promise<BracketStructure | null> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot regenerate preview after tournament has started');

  if (tournament.participants.length < 2) {
    // Clear preview if not enough participants
    const docRef = doc(db, 'tournaments', tournamentId);
    await updateDoc(docRef, { bracketPreview: null });
    return null;
  }

  // Generate bracket preview
  let bracketPreview = generateBracket(tournament.participants, tournament.seedingType);
  bracketPreview = propagateByeWinners(bracketPreview);

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, { bracketPreview });

  return bracketPreview;
}

/**
 * Generate bracket preview locally (without saving)
 * Useful for immediate UI feedback
 */
export function generateBracketPreviewLocal(
  participants: TournamentParticipant[],
  seedingType: SeedingType
): BracketStructure | null {
  if (participants.length < 2) return null;

  let bracket = generateBracket(participants, seedingType);
  bracket = propagateByeWinners(bracket);
  return bracket;
}

// ────── Tournament Flow ──────

/**
 * Start a tournament - uses preview bracket or generates new one, sets status to active
 */
export async function startTournament(tournamentId: string): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Tournament has already started');
  if (tournament.participants.length < 2) throw new Error('Need at least 2 participants to start');

  // Use existing preview if available, otherwise generate new bracket
  let bracket: BracketStructure;
  if (tournament.bracketPreview) {
    bracket = tournament.bracketPreview;
  } else {
    bracket = generateBracket(tournament.participants, tournament.seedingType);
    bracket = propagateByeWinners(bracket);
  }

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    status: 'active',
    bracket,
    bracketPreview: null,
    startedAt: serverTimestamp()
  });
}

/**
 * Start a round - activates all matches in the round
 */
export async function startRound(
  tournamentId: string,
  roundNumber: number
): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'active') throw new Error('Tournament is not active');
  if (!tournament.bracket) throw new Error('Bracket not generated');

  const roundIndex = roundNumber - 1;
  if (roundIndex < 0 || roundIndex >= tournament.bracket.rounds.length) {
    throw new Error('Invalid round number');
  }

  // Check that previous round is completed (except for round 1)
  if (roundNumber > 1) {
    const prevRound = tournament.bracket.rounds[roundIndex - 1];
    const allCompleted = prevRound.matches.every(
      m => m.status === 'completed' || m.status === 'bye'
    );
    if (!allCompleted) {
      throw new Error('Previous round is not completed');
    }
  }

  // Update round and matches status
  const updatedRounds = tournament.bracket.rounds.map((round, idx) => {
    if (idx !== roundIndex) return round;

    return {
      ...round,
      status: 'active' as RoundStatus,
      matches: round.matches.map(match => {
        // Only activate matches that have both participants and aren't byes
        if (match.status === 'bye' || match.status === 'completed') {
          return match;
        }
        if (match.participant1 && match.participant2) {
          return { ...match, status: 'ready' as MatchStatus };
        }
        return match;
      })
    };
  });

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    bracket: {
      ...tournament.bracket,
      rounds: updatedRounds,
      currentRoundNumber: roundNumber
    }
  });
}

/**
 * Start a match - creates a lobby for the match
 */
export async function startMatch(
  tournamentId: string,
  matchId: string
): Promise<string> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'active') throw new Error('Tournament is not active');
  if (!tournament.bracket) throw new Error('Bracket not generated');

  // Find the match
  let targetMatch: BracketMatch | null = null;
  let targetRoundIndex = -1;
  let targetMatchIndex = -1;

  for (let ri = 0; ri < tournament.bracket.rounds.length; ri++) {
    const round = tournament.bracket.rounds[ri];
    for (let mi = 0; mi < round.matches.length; mi++) {
      if (round.matches[mi].matchId === matchId) {
        targetMatch = round.matches[mi];
        targetRoundIndex = ri;
        targetMatchIndex = mi;
        break;
      }
    }
    if (targetMatch) break;
  }

  if (!targetMatch) throw new Error('Match not found');
  if (targetMatch.status !== 'ready') throw new Error('Match is not ready to start');
  if (!targetMatch.participant1 || !targetMatch.participant2) {
    throw new Error('Match is missing participants');
  }

  // Create lobby for the match
  const lobbyResult = await createLobby(
    targetMatch.participant1.uid,
    targetMatch.participant1.username,
    tournament.settings.difficulty,
    'private',
    tournament.settings.roundTimeSeconds,
    'duel',
    tournament.settings.timePenaltyEnabled
  );

  // Update lobby with tournament info
  const lobbyRef = doc(db, 'lobbies', lobbyResult.docId);
  await updateDoc(lobbyRef, {
    tournamentId,
    matchId,
    isTournamentMatch: true
  });

  // Update match status
  const updatedRounds = tournament.bracket.rounds.map((round, ri) => {
    if (ri !== targetRoundIndex) return round;

    return {
      ...round,
      matches: round.matches.map((match, mi) => {
        if (mi !== targetMatchIndex) return match;
        return {
          ...match,
          status: 'in_progress' as MatchStatus,
          lobbyDocId: lobbyResult.docId
        };
      })
    };
  });

  const docRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(docRef, {
    bracket: {
      ...tournament.bracket,
      rounds: updatedRounds
    }
  });

  return lobbyResult.docId;
}

/**
 * Record match result - updates bracket with winner and advances to next match
 */
export async function recordMatchResult(
  tournamentId: string,
  matchId: string,
  winnerUid: string,
  loserUid: string
): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (!tournament.bracket) throw new Error('Bracket not generated');

  // Find the match
  let targetMatch: BracketMatch | null = null;
  let targetRoundIndex = -1;
  let targetMatchIndex = -1;

  for (let ri = 0; ri < tournament.bracket.rounds.length; ri++) {
    const round = tournament.bracket.rounds[ri];
    for (let mi = 0; mi < round.matches.length; mi++) {
      if (round.matches[mi].matchId === matchId) {
        targetMatch = round.matches[mi];
        targetRoundIndex = ri;
        targetMatchIndex = mi;
        break;
      }
    }
    if (targetMatch) break;
  }

  if (!targetMatch) throw new Error('Match not found');

  // Get winner participant info
  const winnerParticipant = targetMatch.participant1?.uid === winnerUid
    ? targetMatch.participant1
    : targetMatch.participant2;

  if (!winnerParticipant) throw new Error('Winner not found in match');

  // Mark loser as eliminated
  const updatedParticipants = tournament.participants.map(p => {
    if (p.uid === loserUid) {
      return { ...p, eliminatedInRound: targetRoundIndex + 1 };
    }
    return p;
  });

  // Update bracket
  const updatedRounds = tournament.bracket.rounds.map((round, ri) => {
    const updatedMatches = round.matches.map((match, mi) => {
      // Update the completed match
      if (ri === targetRoundIndex && mi === targetMatchIndex) {
        return {
          ...match,
          status: 'completed' as MatchStatus,
          winner: winnerUid
        };
      }

      // Advance winner to next match if this is the target match's next
      if (match.matchId === targetMatch!.nextMatchId) {
        const slot = targetMatch!.slotInNextMatch;
        if (slot === 1) {
          return { ...match, participant1: winnerParticipant };
        } else {
          return { ...match, participant2: winnerParticipant };
        }
      }

      return match;
    });

    // Check if round is completed
    const roundCompleted = updatedMatches.every(
      m => m.status === 'completed' || m.status === 'bye'
    );

    return {
      ...round,
      matches: updatedMatches,
      status: roundCompleted ? 'completed' as RoundStatus : round.status
    };
  });

  // Check if tournament is complete (finals completed)
  const finalsRound = updatedRounds[updatedRounds.length - 1];
  const finalsMatch = finalsRound.matches[0];
  const tournamentCompleted = finalsMatch.status === 'completed';

  const docRef = doc(db, 'tournaments', tournamentId);
  const updateData: Record<string, unknown> = {
    participants: updatedParticipants,
    bracket: {
      ...tournament.bracket,
      rounds: updatedRounds
    }
  };

  if (tournamentCompleted) {
    updateData.status = 'completed';
    updateData.winner = winnerUid;
    updateData.completedAt = serverTimestamp();
  }

  await updateDoc(docRef, updateData);
}

/**
 * Forfeit a match - marks loser as forfeited and advances winner
 */
export async function forfeitMatch(
  tournamentId: string,
  matchId: string,
  forfeitingUid: string
): Promise<void> {
  const tournament = await getTournament(tournamentId);

  if (!tournament) throw new Error('Tournament not found');
  if (!tournament.bracket) throw new Error('Bracket not generated');

  // Find the match
  let targetMatch: BracketMatch | null = null;

  for (const round of tournament.bracket.rounds) {
    for (const match of round.matches) {
      if (match.matchId === matchId) {
        targetMatch = match;
        break;
      }
    }
    if (targetMatch) break;
  }

  if (!targetMatch) throw new Error('Match not found');
  if (!targetMatch.participant1 || !targetMatch.participant2) {
    throw new Error('Match is missing participants');
  }

  // Determine winner (the one not forfeiting)
  const winnerUid = targetMatch.participant1.uid === forfeitingUid
    ? targetMatch.participant2.uid
    : targetMatch.participant1.uid;

  await recordMatchResult(tournamentId, matchId, winnerUid, forfeitingUid);
}

// ────── User Queries ──────

/**
 * Subscribe to a user's active tournament match
 * Returns the match details when the user has a ready/in_progress match
 */
export function subscribeUserTournamentMatch(
  uid: string,
  callback: (match: UserTournamentMatch | null) => void
): () => void {
  // Query active tournaments
  const q = query(
    collection(db, 'tournaments'),
    where('status', '==', 'active')
  );

  return onSnapshot(q, (snapshot) => {
    let foundMatch: UserTournamentMatch | null = null;

    for (const docSnap of snapshot.docs) {
      const tournament = { id: docSnap.id, ...docSnap.data() } as TournamentDoc;

      // Check if user is a participant
      const isParticipant = tournament.participants.some(p => p.uid === uid);
      if (!isParticipant || !tournament.bracket) continue;

      // Find user's active match
      for (const round of tournament.bracket.rounds) {
        for (const match of round.matches) {
          const isInMatch =
            match.participant1?.uid === uid ||
            match.participant2?.uid === uid;

          if (!isInMatch) continue;

          // Only return ready or in_progress matches
          if (match.status !== 'ready' && match.status !== 'in_progress') continue;

          const opponent = match.participant1?.uid === uid
            ? match.participant2
            : match.participant1;

          if (!opponent) continue;

          foundMatch = {
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            matchId: match.matchId,
            roundNumber: round.roundNumber,
            roundName: round.roundName,
            opponentUid: opponent.uid,
            opponentUsername: opponent.username,
            status: match.status,
            lobbyDocId: match.lobbyDocId
          };
          break;
        }
        if (foundMatch) break;
      }
      if (foundMatch) break;
    }

    callback(foundMatch);
  }, (error) => {
    console.error('Error subscribing to user tournament match:', error);
    callback(null);
  });
}

/**
 * Get all tournaments a user is participating in
 */
export async function getUserTournaments(uid: string): Promise<TournamentDoc[]> {
  const q = query(
    collection(db, 'tournaments'),
    where('status', 'in', ['setup', 'active'])
  );

  const snapshot = await getDocs(q);
  const tournaments: TournamentDoc[] = [];

  for (const docSnap of snapshot.docs) {
    const tournament = { id: docSnap.id, ...docSnap.data() } as TournamentDoc;
    const isParticipant = tournament.participants.some(p => p.uid === uid);
    if (isParticipant) {
      tournaments.push(tournament);
    }
  }

  return tournaments;
}

/**
 * Search users by username for adding to tournament
 * (Reuses existing user service - just exports the interface here)
 */
export async function searchUsersForTournament(
  searchTerm: string,
  excludeUids: string[] = []
): Promise<Array<{ uid: string; username: string }>> {
  if (!searchTerm || searchTerm.length < 2) return [];

  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);

  const searchLower = searchTerm.toLowerCase();
  const results: Array<{ uid: string; username: string }> = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const username = data.username as string | undefined;

    if (!username) continue;
    if (excludeUids.includes(docSnap.id)) continue;
    if (!username.toLowerCase().includes(searchLower)) continue;

    results.push({
      uid: docSnap.id,
      username
    });

    // Limit results
    if (results.length >= 10) break;
  }

  return results;
}
