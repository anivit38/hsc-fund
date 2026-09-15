// Shimmer placeholders shown while a page's first fetch is in flight —
// replaces the plain "Loading…" text with a shape that hints at the content
// about to arrive, the way most modern dashboards do.
export function SkeletonLine({ width = '100%', height = 14, style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 6, ...style }} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card card-pad">
      <SkeletonLine width="40%" height={11} style={{ marginBottom: 10 }} />
      <SkeletonLine width="65%" height={26} style={{ marginBottom: 8 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={`${85 - i * 12}%`} style={{ marginTop: 8 }} />
      ))}
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }) {
  return (
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} lines={1} />)}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{Array.from({ length: cols }).map((_, i) => <th key={i}><SkeletonLine width={i === 0 ? 70 : 50} height={9} /></th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c}><SkeletonLine width={c === 0 ? '80%' : '55%'} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
