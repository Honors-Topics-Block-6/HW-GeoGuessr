/**
 * Daily Goals — Goal Pool & Selection Logic
 *
 * Defines all possible daily goals and the function to randomly select
 * a subset each day. Goals are predefined (not user-created).
 */

/**
 * Goal type enum — determines which game event increments progress.
 */
export const GOAL_TYPES = {
  GAMES_PLAYED: 'games_played',
  HIGH_SCORE_ROUND: 'high_score_round',
  HIGH_SCORE_GAME: 'high_score_game',
  PLAY_DIFFICULTY: 'play_difficulty',
  WIN_DUEL: 'win_duel',
  PLAY_DUEL: 'play_duel',
  PERFECT_FLOOR: 'perfect_floor',
} as const;

/** Union type of all possible goal type values */
export type GoalType = typeof GOAL_TYPES[keyof typeof GOAL_TYPES];

/** Extra parameters that can be attached to a goal definition */
export interface GoalExtraParams {
  targetDifficulty?: string;
}

/**
 * A single goal definition from the master pool.
 *
 *   id          — unique identifier
 *   description — human-readable text shown to the user
 *   type        — event type that triggers progress (from GOAL_TYPES)
 *   target      — value required to complete the goal
 *   isThreshold — if true, "current" tracks best single attempt, not cumulative
 *   extraParams — optional params (e.g., targetDifficulty)
 */
export interface GoalDefinition {
  id: string;
  description: string;
  type: GoalType;
  target: number;
  isThreshold: boolean;
  extraParams?: GoalExtraParams;
}

/**
 * Master pool of all possible daily goals.
 */
export const GOAL_POOL: GoalDefinition[] = [
  {
    id: 'play_1_game',
    description: 'Play 1 game',
    type: GOAL_TYPES.GAMES_PLAYED,
    target: 1,
    isThreshold: false,
  },
  {
    id: 'play_3_games',
    description: 'Play 3 games',
    type: GOAL_TYPES.GAMES_PLAYED,
    target: 3,
    isThreshold: false,
  },
  {
    id: 'play_5_games',
    description: 'Play 5 games',
    type: GOAL_TYPES.GAMES_PLAYED,
    target: 5,
    isThreshold: false,
  },
  {
    id: 'score_3000_round',
    description: 'Score 3,000+ in a single round',
    type: GOAL_TYPES.HIGH_SCORE_ROUND,
    target: 3000,
    isThreshold: true,
  },
  {
    id: 'score_4000_round',
    description: 'Score 4,000+ in a single round',
    type: GOAL_TYPES.HIGH_SCORE_ROUND,
    target: 4000,
    isThreshold: true,
  },
  {
    id: 'score_5000_round',
    description: 'Score 5,000 in a single round',
    type: GOAL_TYPES.HIGH_SCORE_ROUND,
    target: 5000,
    isThreshold: true,
  },
  {
    id: 'score_15000_game',
    description: 'Score 15,000+ total in a game',
    type: GOAL_TYPES.HIGH_SCORE_GAME,
    target: 15000,
    isThreshold: true,
  },
  {
    id: 'score_20000_game',
    description: 'Score 20,000+ total in a game',
    type: GOAL_TYPES.HIGH_SCORE_GAME,
    target: 20000,
    isThreshold: true,
  },
  {
    id: 'play_hard',
    description: 'Play a game on Hard difficulty',
    type: GOAL_TYPES.PLAY_DIFFICULTY,
    target: 1,
    isThreshold: false,
    extraParams: { targetDifficulty: 'hard' },
  },
  {
    id: 'play_medium',
    description: 'Play a game on Medium difficulty',
    type: GOAL_TYPES.PLAY_DIFFICULTY,
    target: 1,
    isThreshold: false,
    extraParams: { targetDifficulty: 'medium' },
  },
  {
    id: 'win_duel',
    description: 'Win a duel',
    type: GOAL_TYPES.WIN_DUEL,
    target: 1,
    isThreshold: false,
  },
  {
    id: 'play_duel',
    description: 'Play a duel',
    type: GOAL_TYPES.PLAY_DUEL,
    target: 1,
    isThreshold: false,
  },
  {
    id: 'correct_3_floors',
    description: 'Guess the correct floor 3 times',
    type: GOAL_TYPES.PERFECT_FLOOR,
    target: 3,
    isThreshold: false,
  },
];

/** Daily bonus XP awarded when all goals are completed */
export const DAILY_GOALS_BONUS_XP: number = 2000;

/** Number of goals to select per day */
export const DAILY_GOALS_COUNT: number = 3;

/**
 * Select N random goals from the pool.
 * Avoids picking two goals of the same type for variety.
 *
 * @param count - number of goals to pick
 * @returns array of goal definition objects
 */
export function selectRandomGoals(count: number = DAILY_GOALS_COUNT): GoalDefinition[] {
  const shuffled = [...GOAL_POOL].sort(() => Math.random() - 0.5);

  const selected: GoalDefinition[] = [];
  const usedTypes = new Set<GoalType>();

  for (const goal of shuffled) {
    if (selected.length >= count) break;
    if (usedTypes.has(goal.type)) continue;
    usedTypes.add(goal.type);
    selected.push(goal);
  }

  // If we couldn't fill with unique types, allow duplicates
  if (selected.length < count) {
    for (const goal of shuffled) {
      if (selected.length >= count) break;
      if (selected.some(s => s.id === goal.id)) continue;
      selected.push(goal);
    }
  }

  return selected;
}
