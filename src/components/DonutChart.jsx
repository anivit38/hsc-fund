import { useEffect, useState } from 'react';

// A fixed, validated categorical palette (lightness band, chroma floor, CVD
// separation and contrast all checked) — assigned in this order, never
// cycled; anything past the 6th slot folds into a muted "Other".
export const CATEGORICAL = ['#6a43a0', '#1f7a4c', '#b8862a', '#a13a26', '#2f6fb0', '#8a3a7a'];
const OTHER = 'var(--muted)';

// Animated donut chart with a center total and a legend that always carries
// the label + value as text (identity is never color-alone). Pairs with
// BarBreakdown, which shows the same rows as horizontal bars.
export default function DonutChart({ rows, centerLabel, centerValue, formatValue = (v) => v.toLocaleString() }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [rows?.map((r) => `${r.key ?? r.label}:${r.pct}`).join(',')]);

  if (!rows?.length) return <div className="empty">No positions yet</div>;

  const size = 180, stroke = 26, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
          {rows.map((row, i) => {
            const frac = row.pct / 100;
            const dash = frac * c;
            const offset = -acc * c;
            acc += frac;
            return (
              <circle
                key={row.key ?? row.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER}
                strokeWidth={stroke}
                strokeDasharray={`${drawn ? dash : 0} ${c - (drawn ? dash : 0)}`}
                strokeDashoffset={offset}
                style={{ transition: `stroke-dasharray 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s` }}
              />
            );
          })}
        </svg>
        {(centerLabel || centerValue != null) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {centerValue != null && <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500 }}>{formatValue(centerValue)}</div>}
            {centerLabel && <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{centerLabel}</div>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 160 }}>
        {rows.map((row, i) => (
          <div key={row.key ?? row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER, flex: 'none' }} />
            <span style={{ fontWeight: 600, flex: 1 }}>{row.label}</span>
            <span className="muted">{row.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
