export const money = (x, dp = 0) =>
  x == null ? '—' : `$${Number(x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const pct = (x, dp = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(dp)}%`);
export const pctAbs = (x, dp = 1) => (x == null ? '—' : `${Number(x).toFixed(dp)}%`);
export const num = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));

export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const timeAgo = (iso) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export const ROLE_LABEL = { analyst: 'Analyst', pm: 'Portfolio Manager', cio: 'Chief Investment Officer', advisor: 'Faculty Advisor' };
export const KIND_LABEL = { entry: 'Entry', add: 'Add', trim: 'Trim', exit: 'Exit' };
export const STATUS_LABEL = {
  draft: 'Draft', submitted: 'Submitted', pm_approved: 'PM Approved', pm_rejected: 'PM Rejected',
  executed: 'Executed', shelved: 'Shelved', expired: 'Expired',
  pending_open: 'Pending Open', filled: 'Filled', cancelled: 'Cancelled', rejected: 'Rejected',
};
export const VERDICT_LABEL = {
  right_right: 'Right thesis, made money', right_wrong: 'Right thesis, lost money',
  wrong_right: 'Wrong thesis, made money', wrong_wrong: 'Wrong thesis, lost money',
};
export const ASSET_CLASS_LABEL = {
  equity: 'Equities', etf: 'ETFs & Index Funds', bond: 'Fixed Income',
  real_estate: 'Real Estate', commodity: 'Commodities', crypto: 'Digital Assets', private_markets: 'Private Markets',
};
