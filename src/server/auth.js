// Authentication. Self-signup is open (any email works — there's no school-
// domain check) but a new account always starts as an 'analyst' in whatever
// sleeve they pick; only an existing CIO can promote someone to pm/cio/advisor
// from the Members screen. Passwords are bcrypt-hashed on the profile row;
// login/signup exchange credentials for a short-lived JWT signed with
// JWT_SECRET. Every subsequent request carries that JWT and the server
// re-derives the caller's uid (and, from there, their role) from it — the token
// is never trusted to say who it is except via its verified signature.

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { tx, getState, uuid } from './store.js';
import { ApiError } from './errors.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const EXPIRES_IN = '12h';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] JWT_SECRET is not set — using an insecure default. Set it in your Render environment.');
}

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function issueToken(uid) {
  return jwt.sign({ sub: uid }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.sub;
  } catch {
    return null;
  }
}

export function login(email, password) {
  const s = getState();
  const normalized = String(email || '').trim().toLowerCase();
  const profile = s.profiles.find((p) => p.email?.toLowerCase() === normalized);
  if (!profile || !profile.active) throw new ApiError(401, 'Invalid email or password');
  if (!profile.password_hash || !bcrypt.compareSync(String(password || ''), profile.password_hash)) {
    throw new ApiError(401, 'Invalid email or password');
  }
  return { token: issueToken(profile.user_id), profile: publicProfile(profile) };
}

export function signup({ full_name, email, password, sleeve_id }) {
  return tx((s) => {
    const name = String(full_name || '').trim();
    const normalized = String(email || '').trim().toLowerCase();
    if (!name) throw new ApiError(400, 'Full name is required');
    if (!normalized || !normalized.includes('@')) throw new ApiError(400, 'A valid email is required');
    if (String(password || '').length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
    if (s.profiles.some((p) => p.email?.toLowerCase() === normalized)) {
      throw new ApiError(409, 'An account with that email already exists — try signing in instead');
    }
    const sleeve = sleeve_id ? s.sleeves.find((x) => x.id === sleeve_id) : null;
    if (sleeve_id && !sleeve) throw new ApiError(400, 'Unknown sleeve');

    const profile = {
      user_id: `u-${uuid().slice(0, 8)}`,
      full_name: name,
      email: normalized,
      role: 'analyst', // self-signup only ever creates an analyst; a CIO promotes from Members
      sleeve_id: sleeve?.id ?? null,
      grade: null,
      active: true,
      created_at: new Date().toISOString(),
      password_hash: hashPassword(password),
    };
    s.profiles.push(profile);
    s.seq.audit += 1;
    s.audit_log.push({ id: s.seq.audit, actor_id: profile.user_id, action: 'member.signed_up', entity: 'profiles', entity_id: null, payload: { user_id: profile.user_id, sleeve_id: profile.sleeve_id }, at: profile.created_at });
    return { token: issueToken(profile.user_id), profile: publicProfile(profile) };
  });
}

export function changePassword(uid, currentPassword, newPassword) {
  return tx((s) => {
    const profile = s.profiles.find((p) => p.user_id === uid);
    if (!profile) throw new ApiError(404, 'Profile not found');
    if (!bcrypt.compareSync(String(currentPassword || ''), profile.password_hash)) {
      throw new ApiError(401, 'Current password is incorrect');
    }
    if (String(newPassword || '').length < 8) throw new ApiError(400, 'New password must be at least 8 characters');
    profile.password_hash = hashPassword(newPassword);
    return { ok: true };
  });
}

export function publicProfile(p) {
  if (!p) return null;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...rest } = p;
  return rest;
}

export function requestPasswordReset(_email) {
  // No email service is wired up for a school club of ~12 people — the CIO
  // resets a forgotten password from the Members screen instead (manage_member
  // already lets a CIO set a profile's fields; see functions.js reset_password).
  throw new ApiError(501, 'Self-service reset is not available. Ask your CIO to reset your password from the Members screen.');
}
