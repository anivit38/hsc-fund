import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Fetch a view/table and expose { data, loading, error, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fn();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export const useView = (name, params) => useLoad(() => api.view(name, params), [name, JSON.stringify(params || {})]);
export const useTable = (table) => useLoad(() => api.select(table), [table]);
