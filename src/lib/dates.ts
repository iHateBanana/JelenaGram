/** "October 2026". Empty for a missing or unreadable date. */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** "just now", "5m", "3h", "2d", then a calendar date for anything older than a week. */
export function timeAgo(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.floor((now - d.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** True when the date falls on today's month and day in an earlier year. */
export function isOnThisDay(iso: string, today = new Date()): boolean {
  const d = new Date(iso);
  return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() < today.getFullYear();
}
