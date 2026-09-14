// Trading calendar. Dates are ISO strings (YYYY-MM-DD) and handled in UTC so
// the calendar never shifts with the viewer's timezone.

const HOLIDAYS = new Set([
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

const parse = (iso) => new Date(`${iso}T00:00:00Z`);
const format = (d) => d.toISOString().slice(0, 10);

export function addDays(iso, n) {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

export function isWeekend(iso) {
  const day = parse(iso).getUTCDay();
  return day === 0 || day === 6;
}

export const isHoliday = (iso) => HOLIDAYS.has(iso);
export const isSession = (iso) => !isWeekend(iso) && !isHoliday(iso);

export function nextSession(iso) {
  let d = addDays(iso, 1);
  while (!isSession(d)) d = addDays(d, 1);
  return d;
}

/** The most recent session whose close has already happened in real time. */
export function lastCompletedSession(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  let d = format(local);
  if (now.getHours() < 17) d = addDays(d, -1);
  while (!isSession(d)) d = addDays(d, -1);
  return d;
}

export const monthOf = (iso) => iso.slice(0, 7);

export function previousMonth(iso) {
  const d = parse(`${iso.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return format(d).slice(0, 7);
}

export function monthLabel(month) {
  return parse(`${month}-01`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
