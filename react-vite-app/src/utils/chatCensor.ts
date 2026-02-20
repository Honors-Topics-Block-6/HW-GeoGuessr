/**
 * Chat censor: replaces slurs with *** when sending or displaying messages.
 * Profanity is allowed; only slurs (racial, ethnic, homophobic, transphobic, ableist) are filtered.
 * Uses word-boundary matching to avoid false positives (e.g. "classic", "assassin").
 */

// Slurs only (no general profanity). Lowercase; matching is case-insensitive.
// Add or remove terms here to update the filter.
const BANNED_WORDS: string[] = [
  // Racial / ethnic slurs
  'nigger', 'nigga', 'negro', 'chink', 'gook', 'spic', 'kike', 'raghead', 'towelhead',
  'paki', 'wetback', 'beaner', 'coon', 'darkie', 'jap', 'chinky', 'gyp',
  // Homophobic / transphobic slurs
  'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'homo', 'fagot',
  // Ableist slurs
  'retard', 'retarded', 'r-word', 'r3tard',
  // Leetspeak / number substitutions for above
  'n1gger', 'n1gga', 'f@ggot', 'f@g', 'nigg3r', 'nigg4', 'f4ggot', 'f4g'
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let pattern: RegExp | null = null;

function getPattern(): RegExp {
  if (pattern) return pattern;
  const escaped = BANNED_WORDS.map(escapeRegex).join('|');
  pattern = new RegExp('\\b(' + escaped + ')\\b', 'gi');
  return pattern;
}

const CENSOR_REPLACEMENT = '***';

/**
 * Returns text with banned words replaced by ***.
 * Safe to call with empty or nullish input.
 */
export function censorText(text: string | null | undefined): string {
  if (text == null || typeof text !== 'string') return '';
  const p = getPattern();
  return text.replace(p, CENSOR_REPLACEMENT);
}

/**
 * Returns true if the text contains any banned word.
 */
export function containsBannedWord(text: string | null | undefined): boolean {
  if (text == null || typeof text !== 'string') return false;
  const p = getPattern();
  const result = p.test(text);
  p.lastIndex = 0;
  return result;
}
