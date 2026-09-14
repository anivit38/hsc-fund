// Server time. The simulation can be run ahead of the real calendar from the
// Operations screen, so "now" is whichever is later: the wall clock or the close
// of the latest simulated session.

export function stamp(s) {
  const real = new Date();
  if (s?.clock?.date) {
    const simulated = new Date(`${s.clock.date}T21:00:00.000Z`);
    if (simulated > real) return simulated.toISOString();
  }
  return real.toISOString();
}
