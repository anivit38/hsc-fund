// Reference data: asset classes, the investable universe, sleeves, members and
// fund parameters. Everything here is seed data — once loaded it lives in the
// database and limits are read from fund_config, never from code.

export const ASSET_CLASSES = {
  equity: { label: 'Equities', limit: 70 },
  etf: { label: 'ETFs & Index Funds', limit: 40 },
  bond: { label: 'Fixed Income', limit: 40 },
  real_estate: { label: 'Real Estate', limit: 30 },
  commodity: { label: 'Commodities', limit: 20 },
  crypto: { label: 'Digital Assets', limit: 5 },
  private_markets: { label: 'Private Markets', limit: 15 },
};

export const ROLES = ['analyst', 'pm', 'cio', 'advisor'];

export const ROLE_LABELS = {
  analyst: 'Analyst',
  pm: 'Portfolio Manager',
  cio: 'Chief Investment Officer',
  advisor: 'Faculty Advisor',
};

// Transaction costs in basis points. Direct property carries stamp duty and legal
// costs; private funds carry entry fees. Listed instruments are cheap to trade.
const FEES = { equity: 5, etf: 5, bond: 10, real_estate: 5, commodity: 15, crypto: 30, private_markets: 150 };
const APPRAISAL_FEES = { real_estate: 250, private_markets: 150 };

// ticker, name, asset class, sector, region, base price, annual vol, annual drift, beta, pricing, unit
const RAW = [
  ['AAPL', 'Apple Inc.', 'equity', 'Information Technology', 'US', 228, 0.28, 0.1, 1.1],
  ['MSFT', 'Microsoft Corp.', 'equity', 'Information Technology', 'US', 445, 0.25, 0.11, 1.0],
  ['NVDA', 'NVIDIA Corp.', 'equity', 'Information Technology', 'US', 142, 0.5, 0.2, 1.6],
  ['AMZN', 'Amazon.com Inc.', 'equity', 'Consumer Discretionary', 'US', 212, 0.32, 0.12, 1.2],
  ['TSLA', 'Tesla Inc.', 'equity', 'Consumer Discretionary', 'US', 298, 0.6, 0.05, 1.8],
  ['JPM', 'JPMorgan Chase & Co.', 'equity', 'Financials', 'US', 238, 0.24, 0.09, 1.0],
  ['JNJ', 'Johnson & Johnson', 'equity', 'Health Care', 'US', 158, 0.17, 0.05, 0.5],
  ['XOM', 'Exxon Mobil Corp.', 'equity', 'Energy', 'US', 112, 0.26, -0.04, 0.7],
  ['CBA.AX', 'Commonwealth Bank of Australia', 'equity', 'Financials', 'AU', 158, 0.2, 0.07, 0.8],
  ['BHP.AX', 'BHP Group', 'equity', 'Materials', 'AU', 41.5, 0.27, 0.06, 1.0],
  ['CSL.AX', 'CSL Limited', 'equity', 'Health Care', 'AU', 248, 0.22, 0.04, 0.6],
  ['WOW.AX', 'Woolworths Group', 'equity', 'Consumer Staples', 'AU', 31.2, 0.18, 0.03, 0.4],

  ['SPY', 'SPDR S&P 500 ETF', 'etf', 'Broad Market', 'US', 598, 0.16, 0.09, 1.0],
  ['VT', 'Vanguard Total World Stock ETF', 'etf', 'Broad Market', 'Global', 124, 0.15, 0.08, 0.95],
  ['QQQ', 'Invesco QQQ Trust (Nasdaq-100)', 'etf', 'Broad Market', 'US', 521, 0.21, 0.12, 1.2],
  ['IOZ.AX', 'iShares Core S&P/ASX 200 ETF', 'etf', 'Broad Market', 'AU', 33.8, 0.15, 0.07, 0.8],

  ['AGG', 'iShares Core US Aggregate Bond ETF', 'bond', 'Aggregate Bonds', 'US', 99.2, 0.06, 0.03, -0.05],
  ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'bond', 'Government Bonds', 'US', 89.5, 0.14, 0.02, -0.2],
  ['LQD', 'iShares Investment Grade Corporate Bond ETF', 'bond', 'Corporate Bonds', 'US', 108.4, 0.08, 0.035, 0.1],
  ['ACGB-10Y', 'Australian Government Bond 10Y (per $100 face)', 'bond', 'Government Bonds', 'AU', 96.8, 0.07, 0.04, -0.1],

  ['VNQ', 'Vanguard Real Estate ETF (listed REITs)', 'real_estate', 'Listed Property', 'US', 91.6, 0.2, 0.06, 0.9],
  ['GMG.AX', 'Goodman Group (industrial REIT)', 'real_estate', 'Industrial Property', 'AU', 33.1, 0.26, 0.09, 1.1],
  ['RE-PARRA', 'Parramatta Square Office Tower', 'real_estate', 'Commercial Property', 'AU', 25000, 0.08, 0.05, 0, 'appraisal', '1 unit = 0.1% ownership stake'],
  ['RE-BONDI', 'Bondi Beach Apartments Syndicate', 'real_estate', 'Residential Property', 'AU', 10000, 0.09, 0.06, 0, 'appraisal', '1 unit in a 12-apartment syndicate'],
  ['RE-MOORE', 'Moorebank Logistics Park', 'real_estate', 'Industrial Property', 'AU', 20000, 0.1, 0.07, 0, 'appraisal', '1 unit in a warehouse estate'],
  ['RE-FARM', 'Riverina Farmland Trust', 'real_estate', 'Agricultural Land', 'AU', 5000, 0.07, 0.05, 0, 'appraisal', '1 unit of irrigated farmland'],

  ['GLD', 'SPDR Gold Shares', 'commodity', 'Precious Metals', 'Global', 302, 0.15, 0.08, 0.05],
  ['SLV', 'iShares Silver Trust', 'commodity', 'Precious Metals', 'Global', 32.4, 0.28, 0.06, 0.3],
  ['USO', 'United States Oil Fund', 'commodity', 'Energy Commodities', 'Global', 74.8, 0.35, -0.06, 0.5],
  ['DBA', 'Invesco DB Agriculture Fund', 'commodity', 'Agriculture', 'Global', 26.1, 0.16, 0.02, 0.2],
  ['DBC', 'Invesco DB Commodity Index Fund', 'commodity', 'Broad Commodities', 'Global', 23.4, 0.18, 0.03, 0.4],

  ['IBIT', 'iShares Bitcoin Trust', 'crypto', 'Bitcoin', 'Global', 61.5, 0.55, 0.15, 1.4],
  ['ETHA', 'iShares Ethereum Trust', 'crypto', 'Ethereum', 'Global', 24.8, 0.7, 0.1, 1.6],

  ['PM-VENTURE', 'Southern Cross Venture Fund II', 'private_markets', 'Venture Capital', 'AU', 1000, 0.2, 0.12, 0, 'appraisal', '1 LP unit'],
  ['PM-INFRA', 'Western Sydney Airport Infrastructure Stake', 'private_markets', 'Infrastructure', 'AU', 5000, 0.08, 0.07, 0, 'appraisal', '1 unit in an infrastructure trust'],
  ['PM-CREDIT', 'Private Credit Income Fund', 'private_markets', 'Private Credit', 'AU', 1000, 0.04, 0.08, 0, 'appraisal', '1 fund unit'],
];

export const SECURITIES = RAW.map(([ticker, name, asset_class, sector, region, base_price, vol, drift, beta, pricing = 'market', unit = '1 share']) => ({
  ticker,
  name,
  asset_class,
  sector,
  region,
  base_price,
  vol,
  drift,
  beta,
  pricing,
  unit,
  fee_bps: pricing === 'appraisal' ? APPRAISAL_FEES[asset_class] : FEES[asset_class],
  status: 'active',
  last_close: null,
  last_close_at: null,
}));

export const SLEEVES = [
  { id: 'sl-eq', name: 'Global Equities', benchmark: 'VT', asset_classes: ['equity', 'etf'], pm_user_id: 'u-priya' },
  { id: 'sl-re', name: 'Real Estate', benchmark: 'VNQ', asset_classes: ['real_estate'], pm_user_id: 'u-liam' },
  { id: 'sl-fi', name: 'Fixed Income', benchmark: 'AGG', asset_classes: ['bond'], pm_user_id: 'u-sofia' },
  { id: 'sl-alt', name: 'Commodities & Alternatives', benchmark: 'DBC', asset_classes: ['commodity', 'crypto', 'private_markets'], pm_user_id: 'u-noah' },
];

export const PROFILES = [
  { user_id: 'u-alex', full_name: 'Alex Chen', email: 'alex.chen@school.edu.au', role: 'cio', sleeve_id: null, grade: 'Year 12' },
  { user_id: 'u-priya', full_name: 'Priya Sharma', email: 'priya.sharma@school.edu.au', role: 'pm', sleeve_id: 'sl-eq', grade: 'Year 12' },
  { user_id: 'u-liam', full_name: "Liam O'Connor", email: 'liam.oconnor@school.edu.au', role: 'pm', sleeve_id: 'sl-re', grade: 'Year 12' },
  { user_id: 'u-sofia', full_name: 'Sofia Rossi', email: 'sofia.rossi@school.edu.au', role: 'pm', sleeve_id: 'sl-fi', grade: 'Year 12' },
  { user_id: 'u-noah', full_name: 'Noah Williams', email: 'noah.williams@school.edu.au', role: 'pm', sleeve_id: 'sl-alt', grade: 'Year 12' },
  { user_id: 'u-mia', full_name: 'Mia Nguyen', email: 'mia.nguyen@school.edu.au', role: 'analyst', sleeve_id: 'sl-eq', grade: 'Year 11' },
  { user_id: 'u-ethan', full_name: 'Ethan Brooks', email: 'ethan.brooks@school.edu.au', role: 'analyst', sleeve_id: 'sl-eq', grade: 'Year 11' },
  { user_id: 'u-zara', full_name: 'Zara Ahmed', email: 'zara.ahmed@school.edu.au', role: 'analyst', sleeve_id: 'sl-re', grade: 'Year 11' },
  { user_id: 'u-lucas', full_name: 'Lucas Martin', email: 'lucas.martin@school.edu.au', role: 'analyst', sleeve_id: 'sl-re', grade: 'Year 10' },
  { user_id: 'u-oliver', full_name: 'Oliver Smith', email: 'oliver.smith@school.edu.au', role: 'analyst', sleeve_id: 'sl-fi', grade: 'Year 11' },
  { user_id: 'u-chloe', full_name: 'Chloe Park', email: 'chloe.park@school.edu.au', role: 'analyst', sleeve_id: 'sl-alt', grade: 'Year 11' },
  { user_id: 'u-carter', full_name: 'Dr Helen Carter', email: 'h.carter@school.edu.au', role: 'advisor', sleeve_id: null, grade: 'Staff' },
];

export const FUND_CONFIG = {
  id: 1,
  inception_capital: 1_000_000,
  inception_date: '2026-05-01',
  min_position_pct: 4,
  max_position_pct: 8,
  max_sector_pct: 25,
  max_invested_pct: 95,
  target_names_min: 12,
  target_names_max: 20,
  cash_buffer_pct: 2,
  fund_benchmark: 'SPY',
  pitch_ttl_days: 21,
  asset_class_limits: Object.fromEntries(Object.entries(ASSET_CLASSES).map(([k, v]) => [k, v.limit])),
};
