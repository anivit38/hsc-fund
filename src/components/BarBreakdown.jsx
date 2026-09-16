import { useEffect, useState } from 'react';
import CountUp from './CountUp.jsx';

// Horizontal stacked-bar-style breakdown with a direct label on every row
// (never color-alone identity), used for asset-class / sector / sleeve exposure.
// Bars grow in from zero on mount/update, and the percentage counts up —
// the small motion a static bar chart otherwise lacks.
export default function BarBreakdown({ rows, limitPct, colors }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [rows?.map((r) => `${r.key ?? r.label}:${r.pct}`).join(',')]);

  if (!rows?.length) return <div className="empty">No positions yet</div>;
  const max = Math.max(...rows.map((r) => r.pct), limitPct || 0, 1);
  return (
    <div>
      {rows.map((r, i) => {
        const over = limitPct != null && r.pct > limitPct + 1e-9;
        return (
          <div className="risk-row" key={r.key ?? r.label}>
            <div className="label">{r.label}</div>
            <div className="risk-track">
              <div
                className={`risk-fill${over ? ' over' : ''}`}
                style={{
                  width: grown ? `${(r.pct / max) * 100}%` : '0%',
                  background: colors ? colors[i % colors.length] : undefined,
                  transition: `width 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.04}s`,
                }}
              />
              {limitPct != null && <div className="risk-limit" style={{ left: `${(limitPct / max) * 100}%` }} title={`Limit ${limitPct}%`} />}
            </div>
            <div className="risk-value">
              <CountUp value={r.pct} format={(v) => v.toFixed(1)} /> % · $<CountUp value={Math.round(r.value)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
