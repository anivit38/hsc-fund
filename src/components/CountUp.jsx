import { useEffect, useRef, useState } from 'react';

// Animates a number counting up — from zero on first mount, and from the
// previous value on every subsequent change — the small "ticking" motion
// real trading/finance apps use for live figures (NAV, P&L, prices) so a
// number reads as movement, not a jump-cut. (A number that starts already
// equal to its target never actually animates — that was the bug: this
// always starts the very first render at 0, guaranteeing the count plays.)
export default function CountUp({ value, format = (v) => v.toLocaleString(), duration = 900, className, style }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const mountedRef = useRef(false);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    const from = mountedRef.current ? fromRef.current : 0;
    mountedRef.current = true;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
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
