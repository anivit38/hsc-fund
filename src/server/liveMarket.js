// Live market data. Uses Yahoo Finance's public chart endpoint, which needs no
// API key or signup — just a browser-like User-Agent header. This is a Node-only
// module (uses global fetch + console); it is never imported by the frontend
// bundle, only by the Express server.
//
// Securities priced `pricing: 'market'` (every listed equity, ETF, bond ETF,
// commodity ETF and crypto ETF in the universe) get their daily bars from here
// when LIVE_MARKET is enabled. Securities priced `pricing: 'appraisal'` (direct
// real estate, private-market fund units) have no public market feed — exactly
// like the real thing — and stay on the monthly valuation model in market.js.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const BASE = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

// ticker -> { [isoDate]: [open, close] }
const history = new Map();
// ticker -> { price, at }
const quotes = new Map();

const toISO = (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Pull daily [open, close] bars for one ticker between two ISO dates (inclusive-ish). */
async function fetchDailyBars(ticker, fromISO, toISO_) {
  const period1 = Math.floor(new Date(`${fromISO}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${toISO_}T23:59:59Z`).getTime() / 1000) + 86400;
  let lastErr;
  for (const base of BASE) {
    try {
      const url = `${base}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div,split`;
      const json = await fetchJson(url);
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error(`No data for ${ticker}`);
      const ts = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      const bars = {};
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i];
        const c = q.close?.[i];
        if (o == null || c == null) continue;
        bars[toISO(ts[i])] = [Math.round(o * 100) / 100, Math.round(c * 100) / 100];
      }
      return bars;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Refresh cached history for a list of {ticker} securities from `fromISO` through
 * today. Failures are per-ticker and non-fatal — a ticker Yahoo doesn't
 * recognise (or a rate-limit blip) just falls back to the simulator for that
 * name. Returns { ok: [tickers], failed: [tickers] }.
 */
export async function refreshLiveHistory(tickers, fromISO) {
  const today = new Date().toISOString().slice(0, 10);
  const ok = [];
  const failed = [];
  // Small concurrency cap so we don't fire 30 requests at once and get throttled.
  const queue = [...tickers];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const ticker = queue.shift();
      try {
        const bars = await fetchDailyBars(ticker, fromISO, today);
        const merged = { ...(history.get(ticker) || {}), ...bars };
        history.set(ticker, merged);
        ok.push(ticker);
      } catch (e) {
        failed.push(ticker);
        console.warn(`[live-market] ${ticker}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
  return { ok, failed };
}

/** Synchronous lookup used by market.js while generating a session's bar. */
export function liveBar(ticker, isoDate) {
  return history.get(ticker)?.[isoDate] ?? null;
}

export function hasLiveHistory(ticker) {
  return history.has(ticker);
}

/** Lightweight current-quote poll for the dashboard's intraday ticker — display only. */
export async function refreshQuotes(tickers) {
  let lastErr;
  for (const base of BASE) {
    try {
      const url = `${base}/v7/finance/quote?symbols=${tickers.map(encodeURIComponent).join(',')}`;
      const json = await fetchJson(url);
      const at = new Date().toISOString();
      for (const row of json?.quoteResponse?.result || []) {
        if (row.regularMarketPrice != null) quotes.set(row.symbol, { price: row.regularMarketPrice, changePct: row.regularMarketChangePercent ?? null, at });
      }
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[live-market] quote refresh failed:', lastErr?.message);
}

export function getQuotes() {
  return Object.fromEntries(quotes);
}
