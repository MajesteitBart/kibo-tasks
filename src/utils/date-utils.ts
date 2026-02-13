/**
 * Get today's date as YYYY-MM-DD in local time.
 */
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date (midnight local).
 */
function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Is the given YYYY-MM-DD date before today?
 */
export function isOverdue(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const today = parseDate(todayStr());
  if (!today) return false;
  return d.getTime() < today.getTime();
}

/**
 * Is the given YYYY-MM-DD date today?
 */
export function isToday(dateStr: string): boolean {
  return dateStr === todayStr();
}

/**
 * Is the date due today or overdue?
 */
export function isDueOrOverdue(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const today = parseDate(todayStr());
  if (!today) return false;
  return d.getTime() <= today.getTime();
}

/**
 * Format a date string for display (e.g., "Feb 13" or "Jan 5").
 */
export function formatDateShort(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
