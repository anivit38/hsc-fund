import { useMemo, useState } from 'react';

// Minimal dependency-free line chart: thin 2px lines, rounded caps, a shared
// x-scale across one or more series, a hover crosshair + tooltip, and a legend
// (never color-alone identity). Series: [{ id, label, color, points: [{date, value}] }]
export default function LineChart({ series, height = 220, formatValue = (v) => v.toFixed(2), formatDate }) {
  const [hover, setHover] = useState(null);
  const width = 640;
  const padL = 46, padR = 12, padT = 12, padB = 24;

  const { xScale, yScale, allDates, minY, maxY } = useMemo(() => {
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const pad = (maxY - minY) * 0.08 || Math.abs(maxY) * 0.05 || 1;
    const lo = minY - pad, hi = maxY + pad;
    const xScale = (d) => padL + (dates.indexOf(d) / Math.max(1, dates.length - 1)) * (width - padL - padR);
    const yScale = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
    return { xScale, yScale, allDates: dates, minY: lo, maxY: hi };
  }, [series, height]);

  if (!allDates.length) return <div className="empty">No data yet</div>;

  const path = (points) => {
    const byDate = new Map(points.map((p) => [p.date, p.value]));
    let d = '';
    for (const date of allDates) {
      if (!byDate.has(date)) continue;
      const x = xScale(date), y = yScale(byDate.get(date));
      d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
    }
    return d;
  };

  const hoverIndex = hover != null ? Math.round(hover) : null;
  const hoverDate = hoverIndex != null ? allDates[Math.max(0, Math.min(allDates.length - 1, hoverIndex))] : null;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const frac = ((x - padL) / (width - padL - padR)) * (allDates.length - 1);
    setHover(Math.max(0, Math.min(allDates.length - 1, frac)));
  };

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => minY + ((maxY - minY) * i) / gridLines);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yScale(v)} y2={yScale(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 8} y={yScale(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-muted)">
              {formatValue(v)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.id} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {hoverDate && (
          <line x1={xScale(hoverDate)} x2={xScale(hoverDate)} y1={padT} y2={height - padB} stroke="var(--ink-muted)" strokeWidth="1" strokeDasharray="3,3" />
        )}
        {hoverDate &&
          series.map((s) => {
            const pt = s.points.find((p) => p.date === hoverDate);
            if (!pt) return null;
            return <circle key={s.id} cx={xScale(hoverDate)} cy={yScale(pt.value)} r="4" fill={s.color} stroke="var(--surface-raised)" strokeWidth="2" />;
          })}
        <text x={padL} y={height - 6} fontSize="10" fill="var(--ink-muted)">
          {formatDate ? formatDate(allDates[0]) : allDates[0]}
        </text>
        <text x={width - padR} y={height - 6} fontSize="10" fill="var(--ink-muted)" textAnchor="end">
          {formatDate ? formatDate(allDates[allDates.length - 1]) : allDates[allDates.length - 1]}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              {hoverDate ? (
                <span className="muted">
                  {formatDate ? formatDate(hoverDate) : hoverDate}: {formatValue(s.points.find((p) => p.date === hoverDate)?.value ?? last?.value)}
                </span>
              ) : (
                <span className="muted">{last ? formatValue(last.value) : '—'}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
