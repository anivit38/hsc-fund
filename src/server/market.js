// Simulated market data API. Prices are deterministic: the same ticker on the
// same date always produces the same bar, so every device replays the same
// history. Listed instruments move daily with a shared market factor; direct
// property and private-market assets are appraised once a month, like the
// real thing.

import { nextSession } from './calendar.js';
import { liveBar } from './liveMarket.js';

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  while (!u) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const MARKET_DAILY_VOL = 0.009;

function round(x, dp) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

function generateSession(s, date) {
  const index = s.sessions.length;
  const market = mulberry32(hashString(`MARKET:${date}`));
  const marketReturn = 0.0002 + gaussian(market) * MARKET_DAILY_VOL;
  const marketGap = gaussian(market) * 0.003;

  for (const sec of s.securities) {
    const series = (s.prices[sec.ticker] ||= []);
    const prev = series.length ? series[series.length - 1][1] : sec.base_price;
    const rand = mulberry32(hashString(`${sec.ticker}:${date}`));
    const dp = prev >= 1000 ? 0 : 2;
    let open = prev;
    let close = prev;

    const live = sec.pricing === 'market' ? liveBar(sec.ticker, date) : null;
    if (live) {
      [open, close] = live;
    } else if (index > 0 && sec.pricing === 'appraisal') {
      // Quarterly-style valuation cadence compressed to monthly for a school year.
      if (index % 21 === 0) close = prev * (1 + sec.drift / 12 + (sec.vol / Math.sqrt(12)) * gaussian(rand));
    } else if (index > 0) {
      const dailyVol = sec.vol / Math.sqrt(252);
      const idio = Math.sqrt(Math.max(0.05, 1 - ((sec.beta * MARKET_DAILY_VOL) / dailyVol) ** 2));
      const gap = sec.beta * marketGap + gaussian(rand) * dailyVol * 0.25;
      const ret = sec.drift / 252 + sec.beta * marketReturn + gaussian(rand) * dailyVol * idio;
      open = prev * (1 + gap);
      close = prev * (1 + ret);
    }
    series.push([round(open, dp), round(close, dp)]);
  }
  s.sessions.push(date);
}

/** Make sure bars exist for every session up to and including `date`. */
export function ensureSessions(s, date) {
  const last = s.sessions[s.sessions.length - 1];
  let d = last ? nextSession(last) : s.fund_config.inception_date;
  while (d <= date) {
    generateSession(s, d);
    d = nextSession(d);
  }
}

/** [open, close] for a ticker on a session date, or null. */
export function barOn(s, ticker, date) {
  const i = s.sessions.lastIndexOf(date);
  if (i < 0) return null;
  return s.prices[ticker]?.[i] ?? null;
}

/** Close-price history for a ticker, as [{date, value}]. */
export function closeSeries(s, ticker) {
  const series = s.prices[ticker] || [];
  const lastDate = s.clock.date;
  const out = [];
  for (let i = 0; i < s.sessions.length && i < series.length; i++) {
    if (s.sessions[i] > lastDate) break;
    out.push({ date: s.sessions[i], value: series[i][1] });
  }
  return out;
}
