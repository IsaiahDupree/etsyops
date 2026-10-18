// GET /etsy/callback — Etsy redirects the seller here after they authorize.
//
// This is a top-level browser redirect from etsy.com, so it carries no bearer.
// We recover the EtsyOps user from the single-use `state` we stashed in
// /etsy/connect, exchange the code for tokens (PKCE), identify the seller's shop
// via getMe, and persist the per-seller credentials the tools read:
//   etsy:token:<userId>     access token   (etsy.js authorizes with this)
//   etsy:refresh:<userId>   refresh token
//   etsy:shop:<userId>      numeric shop_id
//   etsy:token_exp:<userId> unix seconds the access token expires
// Then it bounces back to the dashboard with a status flag. Nothing sensitive is
// ever put in a query string.
import { baseUrl } from '../../lib/http.js';
import { redis } from '../../lib/redis.js';
import { etsyOAuthConfigured, exchangeCode, getMe } from '../../lib/etsyOAuth.js';

const done = (res, base, status) => res.redirect(302, `${base}/?etsy=${status}`);

export default async function handler(req, res) {
  const base = baseUrl(req);
  const { code, state, error } = req.query || {};

  if (!etsyOAuthConfigured) return done(res, base, 'unavailable');
  if (error) return done(res, base, 'denied'); // seller clicked "Cancel" on Etsy
  if (!code || !state) return done(res, base, 'error');

  // Recover + consume the handshake state (single-use).
  const raw = await redis.get(`etsy:oauth:${state}`);
  if (!raw) return done(res, base, 'expired');
  await redis.del(`etsy:oauth:${state}`);

  let userId, verifier;
  try {
    ({ userId, verifier } = typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return done(res, base, 'error');
  }
  if (!userId || !verifier) return done(res, base, 'error');

  try {
    const tok = await exchangeCode({ code, verifier, base });
    if (!tok?.access_token) return done(res, base, 'error');
    const me = await getMe(tok.access_token); // { user_id, shop_id }
    if (!me?.shop_id) return done(res, base, 'noshop'); // authorized account has no shop

    const expSec = Math.floor(Date.now() / 1000) + (Number(tok.expires_in) || 3600);
    await Promise.all([
      redis.set(`etsy:token:${userId}`, tok.access_token),
      tok.refresh_token ? redis.set(`etsy:refresh:${userId}`, tok.refresh_token) : Promise.resolve(),
      redis.set(`etsy:shop:${userId}`, String(me.shop_id)),
      redis.set(`etsy:token_exp:${userId}`, String(expSec)),
    ]);
    return done(res, base, 'connected');
  } catch (e) {
    console.error('[etsy/callback] error:', e.message || e);
    return done(res, base, 'error');
  }
}
