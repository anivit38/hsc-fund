import { useEffect, useRef, useState } from 'react';

// Animates a number counting up from its previous value whenever `value`
// changes — the small "ticking" motion real trading/finance apps use for
// live figures (NAV, P&L, prices) so an update reads as movement, not a jump-cut.
export default function CountUp({ value, format = (v) => v.toLocaleString(), duration = 700, className, style }) {
  const [display, setDisplay] = useState(value ?? 0);
  const fromRef = useRef(value ?? 0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (value == null || Number.isNaN(value)) return <span className={className} style={style}>—</span>;
  return (
    <span className={className} style={style}>
      {format(display)}
    </span>
  );
}
