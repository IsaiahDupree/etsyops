// etsyOAuth.js — the seller "connect your Etsy shop" flow (OAuth 2.0 auth-code + PKCE).
//
// EtsyOps's tools act on a seller's own shop using a per-seller Etsy access token.
// This module implements the one-time connect handshake that obtains and refreshes
// that token, grounded in the documented Etsy Open API v3 OAuth flow:
//   authorize:  https://www.etsy.com/oauth/connect            (response_type=code, PKCE S256)
//   token:      https://api.etsy.com/v3/public/oauth/token    (x-www-form-urlencoded)
//   identify:   GET {BASE}/users/me  (getMe)  -> { user_id, shop_id }
// The app "keystring" (ETSY_KEYSTRING) is the OAuth client_id AND the x-api-key.
// Access tokens have the form "<user_id>.<token>"; getMe returns the shop_id.
//
// If ETSY_KEYSTRING is unset (demo mode), etsyOAuthConfigured is false and the
// connect route tells the seller live connection isn't enabled on this deployment.

import crypto from 'node:crypto';
import { sha256b64u } from './auth.js';

const KEYSTRING = process.env.ETSY_KEYSTRING || '';
export const etsyOAuthConfigured = !!KEYSTRING;

const APP_BASE = 'https://openapi.etsy.com/v3/application';
const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const TIMEOUT_MS = 25_000;

// Scopes EtsyOps needs: read+write listings, read shop, read receipts (revenue/fees),
// read the seller's email for account matching. Space-separated per the Etsy spec.
export const ETSY_SCOPES = 'listings_r listings_w shops_r transactions_r email_r';

// The callback must EXACTLY match a redirect URI registered on the Etsy app.
export function redirectUri(base) {
  const root = (process.env.PUBLIC_BASE_URL || base || 'https://etsyops.vercel.app').replace(/\/+$/, '');
  return `${root}/etsy/callback`;
}

// PKCE: a high-entropy verifier (base64url, 43 chars, within the allowed alphabet)
// and its S256 challenge.
export function makePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url'); // 43 chars, [A-Za-z0-9_-]
  const challenge = sha256b64u(verifier);
  return { verifier, challenge };
}

export function makeState() {
  return crypto.randomBytes(16).toString('base64url');
}

export function buildAuthorizeUrl({ state, challenge, base }) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: KEYSTRING,
    redirect_uri: redirectUri(base),
    scope: ETSY_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

async function postForm(url, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* leave null */ }
    if (!res.ok) {
      const detail = json?.error_description || json?.error || text.slice(0, 200);
      throw new Error(`Etsy token endpoint failed (HTTP ${res.status}): ${detail}`);
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Etsy token request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Exchange an authorization code for tokens. Returns { access_token, refresh_token, expires_in }.
export function exchangeCode({ code, verifier, base }) {
  return postForm(TOKEN_URL, {
    grant_type: 'authorization_code',
    client_id: KEYSTRING,
    redirect_uri: redirectUri(base),
    code,
    code_verifier: verifier,
  });
}

// Refresh an expired access token. Returns { access_token, refresh_token, expires_in }.
export function refreshToken(refresh_token) {
  return postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: KEYSTRING,
    refresh_token,
  });
}

// getMe — identify the authenticated seller's user_id + primary shop_id.
export async function getMe(accessToken) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APP_BASE}/users/me`, {
      headers: { 'x-api-key': KEYSTRING, authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Etsy getMe failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    return JSON.parse(text); // { user_id, shop_id }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Etsy getMe timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
