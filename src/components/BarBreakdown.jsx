// Horizontal stacked-bar-style breakdown with a direct label on every row
// (never color-alone identity), used for asset-class / sector / sleeve exposure.
export default function BarBreakdown({ rows, limitPct, colors }) {
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
                style={{ width: `${(r.pct / max) * 100}%`, background: colors ? colors[i % colors.length] : undefined }}
              />
              {limitPct != null && <div className="risk-limit" style={{ left: `${(limitPct / max) * 100}%` }} title={`Limit ${limitPct}%`} />}
            </div>
            <div className="risk-value">
              {r.pct.toFixed(1)}% · ${Math.round(r.value).toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
