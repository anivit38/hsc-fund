import { useEffect, useMemo, useRef, useState } from 'react';

// A real market-style chart: smooth (Catmull-Rom) curves, a gradient area fill
// under the primary series, an animated stroke draw-in on mount/update, a
// floating crosshair tooltip, and a light/dark-aware palette via CSS vars.
// Series: [{ id, label, color, points: [{date, value}], area?: boolean }]
export default function LineChart({ series, height = 240, formatValue = (v) => v.toFixed(2), formatDate }) {
  const [hover, setHover] = useState(null);
  const [drawn, setDrawn] = useState(false);
  const pathRefs = useRef({});
  const width = 640;
  const padL = 50, padR = 14, padT = 14, padB = 26;

  const { xScale, yScale, allDates, minY, maxY } = useMemo(() => {
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const pad = (maxY - minY) * 0.1 || Math.abs(maxY) * 0.05 || 1;
    const lo = minY - pad, hi = maxY + pad;
    const xScale = (d) => padL + (dates.indexOf(d) / Math.max(1, dates.length - 1)) * (width - padL - padR);
    const yScale = (v) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
    return { xScale, yScale, allDates: dates, minY: lo, maxY: hi };
  }, [series, height]);

  // Animate the stroke drawing in whenever the underlying data changes shape.
  useEffect(() => {
    setDrawn(false);
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [series.map((s) => s.points.length).join(','), allDates.join(',')]);

  if (!allDates.length) return <div className="empty">No data yet</div>;

  // Catmull-Rom -> cubic Bezier smoothing for a natural, market-app-style curve.
  const smoothPath = (pts) => {
    if (pts.length < 2) return { line: '', area: '' };
    const p = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    let line = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    const baseline = height - padB;
    const area = `${line} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;
    return { line, area };
  };

  const pathsFor = (s) => {
    const byDate = new Map(s.points.map((p) => [p.date, p.value]));
    const pts = allDates.filter((d) => byDate.has(d)).map((d) => ({ x: xScale(d), y: yScale(byDate.get(d)) }));
    return smoothPath(pts);
  };

  const hoverIndex = hover != null ? Math.round(hover) : null;
  const hoverDate = hoverIndex != null ? allDates[Math.max(0, Math.min(allDates.length - 1, hoverIndex))] : null;
  const hoverX = hoverDate ? xScale(hoverDate) : null;
  const tooltipLeft = hoverX != null && hoverX > width * 0.62;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const frac = ((x - padL) / (width - padL - padR)) * (allDates.length - 1);
    setHover(Math.max(0, Math.min(allDates.length - 1, frac)));
  };

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => minY + ((maxY - minY) * i) / gridLines);
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`grad-${uid}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yScale(v)} y2={yScale(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 8} y={yScale(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font)">
              {formatValue(v)}
            </text>
          </g>
        ))}

        {series.map((s, i) => {
          const { line, area } = pathsFor(s);
          const len = 2400; // generous fixed length works fine for a dash-draw effect at chart scale
          return (
            <g key={s.id}>
              {(s.area ?? i === 0) && (
                <path d={area} fill={`url(#grad-${uid}-${s.id})`} stroke="none" style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.6s ease 0.15s' }} />
              )}
              <path
                ref={(el) => (pathRefs.current[s.id] = el)}
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: len,
                  strokeDashoffset: drawn ? 0 : len,
                  transition: `stroke-dashoffset ${0.9 + i * 0.15}s cubic-bezier(0.16, 1, 0.3, 1)`,
                }}
              />
            </g>
          );
        })}

        {hoverDate && (
          <line x1={hoverX} x2={hoverX} y1={padT} y2={height - padB} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
        )}
        {hoverDate &&
          series.map((s) => {
            const pt = s.points.find((p) => p.date === hoverDate);
            if (!pt) return null;
            return (
              <g key={s.id}>
                <circle cx={hoverX} cy={yScale(pt.value)} r="7" fill={s.color} opacity="0.16" />
                <circle cx={hoverX} cy={yScale(pt.value)} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              </g>
            );
          })}

        <text x={padL} y={height - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font)">
          {formatDate ? formatDate(allDates[0]) : allDates[0]}
        </text>
        <text x={width - padR} y={height - 6} fontSize="10" fill="var(--muted)" textAnchor="end" fontFamily="var(--font)">
          {formatDate ? formatDate(allDates[allDates.length - 1]) : allDates[allDates.length - 1]}
        </text>
      </svg>

      {hoverDate && (
        <div
          style={{
            position: 'absolute', top: 8, [tooltipLeft ? 'right' : 'left']: `${(hoverX / width) * 100}%`,
            transform: tooltipLeft ? 'translateX(12px)' : 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9,
            boxShadow: '0 12px 28px rgba(30,20,10,.14)', padding: '8px 12px', fontSize: 12, pointerEvents: 'none', zIndex: 5, minWidth: 120,
          }}
        >
          <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4 }}>{formatDate ? formatDate(hoverDate) : hoverDate}</div>
          {series.map((s) => {
            const pt = s.points.find((p) => p.date === hoverDate);
            if (!pt) return null;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block', flex: 'none' }} />
                <span style={{ fontWeight: 600 }}>{formatValue(pt.value)}</span>
                <span style={{ color: 'var(--muted)' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              {!hoverDate && <span className="muted">{last ? formatValue(last.value) : '—'}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
