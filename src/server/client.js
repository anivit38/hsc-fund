// The only surface the React app talks to — the equivalent of supabase-js with the
// anon key. It carries the signed-in user's id (the JWT) and nothing else. It
// cannot bypass policies and cannot pass a role; every privileged action is an
// Edge Function call that re-checks the caller server-side.

import { getState } from './store.js';
import { ApiError } from './errors.js';
import { select, insert, update, remove, profileOf } from './policies.js';
import { FUNCTIONS, previewTrade } from './functions.js';
import * as V from './views.js';
import { closeSeries } from './market.js';

const VIEWS = {
  summary: (s) => V.summary(s),
  book: (s) => V.book(s),
  exposures: (s) => V.exposures(s),
  nav_series: (s) => V.navSeries(s),
  benchmark_series: (s, { ticker }) => V.benchmarkSeries(s, ticker),
  sleeve_index: (s, { sleeve_id }) => V.sleeveIndex(s, sleeve_id),
  price_series: (s, { ticker }) => closeSeries(s, ticker),
  leaderboard: (s) => V.leaderboard(s),
  pending_post_mortem: (s, { user_id }) => V.pendingPostMortem(s, user_id),
  preview_trade: (s, args) => previewTrade(s, args),
};

export function createClient(uid) {
  const member = () => {
    const me = profileOf(getState(), uid);
    if (!me?.active) throw new ApiError(401, 'Not signed in');
    return me;
  };
  return {
    uid,
    me: () => profileOf(getState(), uid),
    select: (table) => select(getState(), uid, table),
    insert: (table, row) => insert(uid, table, row),
    update: (table, id, patch) => update(uid, table, id, patch),
    remove: (table, id) => remove(uid, table, id),
    view: (name, args = {}) => {
      member();
      const fn = VIEWS[name];
      if (!fn) throw new ApiError(404, `Unknown view ${name}`);
      return fn(getState(), args);
    },
    invoke: (name, body = {}) => {
      const fn = FUNCTIONS[name];
      if (!fn) throw new ApiError(404, `Edge Function ${name} not found`);
      return fn(uid, body);
    },
  };
}
