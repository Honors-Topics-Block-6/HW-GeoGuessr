export type ShareableRound = {
  score: number;
  roundNumber?: number;
};

const commaFormatter = new Intl.NumberFormat('en-US');

function toTitleCase(input: string): string {
  return input.length === 0 ? input : input[0].toUpperCase() + input.slice(1);
}

export function formatPointsWithCommas(points: number): string {
  if (!Number.isFinite(points)) return '0';
  return commaFormatter.format(Math.round(points));
}

/**
 * Format points for per-round display:
 * - Under 1000: "150"
 * - 1000+: "4.2k" (1 decimal), trimming trailing ".0"
 */
export function formatPointsShort(points: number): string {
  if (!Number.isFinite(points)) return '0';
  const rounded = Math.round(points);
  const abs = Math.abs(rounded);
  if (abs < 1000) return commaFormatter.format(rounded);

  const k = rounded / 1000;
  const kRounded = Math.round(k * 10) / 10; // 1 decimal
  const asString = Number.isInteger(kRounded) ? String(kRounded) : kRounded.toFixed(1);
  return `${asString}k`;
}

export function deriveGameLabel(options: {
  gameName?: string | null;
  mode?: string | null;
  difficulty?: string | null;
}): string {
  const baseName = (options.gameName ?? '').trim() || 'HW Geoguessr';
  const difficulty = (options.difficulty ?? '').trim();
  const mode = (options.mode ?? '').trim();

  const parts: string[] = [baseName];
  if (mode && mode !== 'singleplayer') parts.push(toTitleCase(mode));
  if (difficulty) parts.push(toTitleCase(difficulty));

  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(' • ')})` : parts[0];
}

export function generateShareableResultsText(input: {
  rounds: ShareableRound[];
  gameName?: string | null;
  mode?: string | null;
  difficulty?: string | null;
  totalScoreOverride?: number;
}): string {
  const roundsSorted = [...(input.rounds ?? [])].sort((a, b) => {
    const an = a.roundNumber ?? 0;
    const bn = b.roundNumber ?? 0;
    if (an === 0 && bn === 0) return 0;
    return an - bn;
  });

  const computedTotal = roundsSorted.reduce((sum, r) => sum + (Number.isFinite(r.score) ? r.score : 0), 0);
  const totalScore = Number.isFinite(input.totalScoreOverride ?? NaN) ? (input.totalScoreOverride as number) : computedTotal;

  const label = deriveGameLabel({
    gameName: input.gameName,
    mode: input.mode,
    difficulty: input.difficulty
  });

  const lines: string[] = [];
  lines.push(`🌍 ${label} Score: ${formatPointsWithCommas(totalScore)}`);
  roundsSorted.forEach((round, idx) => {
    const roundNum = round.roundNumber ?? (idx + 1);
    lines.push(`📍 Round ${roundNum}: 🚩 ${formatPointsShort(round.score)} points`);
  });

  return lines.join('\n');
}

