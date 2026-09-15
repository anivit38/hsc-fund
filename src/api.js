// Thin REST client for the Render backend — the frontend's only line to the
// server. Mirrors src/server/client.js's shape (select/insert/update/view/invoke)
// but talks over HTTP with a bearer JWT instead of calling the engine in-process.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const TOKEN_KEY = 'hsc-fund:token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, json?.error || res.statusText, json?.details);
  return json;
}

const qs = (params) => {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return '';
  return `?${new URLSearchParams(entries).toString()}`;
};

export const api = {
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  signup: (full_name, email, password, sleeve_id) => request('POST', '/api/auth/signup', { full_name, email, password, sleeve_id }),
  publicSleeves: () => request('GET', '/api/public/sleeves'),
  me: () => request('GET', '/api/auth/me'),
  changePassword: (current_password, new_password) => request('POST', '/api/auth/change-password', { current_password, new_password }),
  health: () => request('GET', '/api/health'),
  select: (table) => request('GET', `/api/select/${table}`),
  insert: (table, row) => request('POST', `/api/insert/${table}`, row),
  update: (table, id, patch) => request('PATCH', `/api/update/${table}/${id}`, patch),
  remove: (table, id) => request('DELETE', `/api/remove/${table}/${id}`),
  view: (name, params) => request('GET', `/api/view/${name}${qs(params)}`),
  invoke: (name, body) => request('POST', `/api/invoke/${name}`, body || {}),
};

export { ApiError };
