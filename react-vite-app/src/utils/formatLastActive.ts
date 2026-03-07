type TimestampLike =
  | Date
  | string
  | number
  | null
  | undefined
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };

export function coerceTimestampToDate(value: unknown): Date | null {
  const v = value as TimestampLike;
  if (!v) return null;

  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v;
  }

  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (typeof v.toMillis === 'function') {
      const ms = v.toMillis();
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof v.seconds === 'number') {
      const ns = typeof v.nanoseconds === 'number' ? v.nanoseconds : 0;
      const ms = v.seconds * 1000 + Math.floor(ns / 1e6);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

export function formatLastActive(value: unknown, now: Date = new Date()): string {
  const date = coerceTimestampToDate(value);
  if (!date) return 'No activity yet';

  const diffMsRaw = now.getTime() - date.getTime();
  const diffMs = Math.max(0, diffMsRaw);

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return 'Last active just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Last active ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Last active ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Last active ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

