/**
 * Lightweight "2h ago" formatter. Promoted here from GroupRow.tsx once a
 * second caller (the notifications list) needed the same logic — per
 * CLAUDE.md, shared code is promoted once actually used twice, not before.
 */
export function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  return `${wk}w`;
}
