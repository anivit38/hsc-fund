import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const { profile } = await api.me();
      setProfile(profile);
    } catch {
      setToken(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    setError(null);
    const { token, profile } = await api.login(email, password);
    setToken(token);
    setProfile(profile);
    return profile;
  }, []);

  const signup = useCallback(async (fullName, email, password, sleeveId) => {
    setError(null);
    const { token, profile } = await api.signup(fullName, email, password, sleeveId);
    setToken(token);
    setProfile(profile);
    return profile;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setProfile(null);
  }, []);

  return <Ctx.Provider value={{ profile, loading, error, login, signup, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
