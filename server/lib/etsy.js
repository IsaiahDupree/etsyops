// etsy.js — the real-data client for EtsyOps.
//
// EtsyOps is a thin, well-annotated MCP surface over the **Etsy Open API v3**
// (https://developers.etsy.com). Each tool forwards to an Etsy endpoint on
// behalf of the connected seller. Etsy uses two credentials together:
//   • the app "keystring" (x-api-key) — one per registered Etsy app,
//   • a per-seller OAuth 2.0 access token (Authorization: Bearer …) — obtained
//     when the seller connects their shop (scopes: listings_r/w, shops_r,
//     transactions_r, email_r).
//
// Configuration (env + per-user KV):
//   ETSY_KEYSTRING          the registered Etsy app's keystring (x-api-key)
//   etsy:token:<userId>     the seller's OAuth access token (stored after they
//                           connect their shop; refreshed via etsy:refresh:<userId>)
//   etsy:shop:<userId>      the seller's numeric shop_id
//
// If the app keystring is unset, or the current user hasn't connected a shop,
// the connector is NOT wired to live Etsy data. Rather than invent numbers,
// every tool returns a clear, honest "connect your Etsy shop" error. Reviewers
// use the demo account (server-side sample shop); a real seller connects Etsy
// once and every tool lights up against their own shop.

import { redis } from './redis.js';
import { refreshToken as etsyRefresh } from './etsyOAuth.js';

const KEYSTRING = process.env.ETSY_KEYSTRING || '';
const BASE = 'https://openapi.etsy.com/v3/application';
const TIMEOUT_MS = 25_000;

export const etsyAppConfigured = !!KEYSTRING;

// Etsy access tokens expire after ~1 hour. Return a valid token, transparently
// refreshing (and re-storing) it when it's within 2 minutes of expiry so a
// connected shop keeps working without the seller re-authorizing.
async function tokenFor(userId) {
  const token = await redis.get(`etsy:token:${userId}`);
  if (!token) return null;
  const expRaw = await redis.get(`etsy:token_exp:${userId}`);
  const exp = Number(expRaw) || 0;
  const now = Math.floor(Date.now() / 1000);
  if (!exp || exp - now > 120) return token; // still fresh

  const refresh = await redis.get(`etsy:refresh:${userId}`);
  if (!refresh) return token; // no refresh token — try the (possibly stale) one
  try {
    const t = await etsyRefresh(refresh);
    if (!t?.access_token) return token;
    const newExp = now + (Number(t.expires_in) || 3600);
    await Promise.all([
      redis.set(`etsy:token:${userId}`, t.access_token),
      t.refresh_token ? redis.set(`etsy:refresh:${userId}`, t.refresh_token) : Promise.resolve(),
      redis.set(`etsy:token_exp:${userId}`, String(newExp)),
    ]);
    return t.access_token;
  } catch {
    return token; // refresh failed — let the API call surface the real error
  }
}
async function shopFor(userId) {
  return redis.get(`etsy:shop:${userId}`);
}

// Is THIS user able to hit live Etsy? (app cred present AND they've connected a shop)
export async function etsyReady(userId) {
  if (!etsyAppConfigured) return false;
  const [tok, shop] = await Promise.all([tokenFor(userId), shopFor(userId)]);
  return !!(tok && shop);
}

function notConnected() {
  return new Error(
    'EtsyOps is not connected to a live Etsy shop for this account. ' +
    'Reviewers: sign in with the demo account to explore a sample shop. ' +
    'Sellers: connect your Etsy shop from the EtsyOps dashboard (one-time OAuth), ' +
    'and self-hosters must set ETSY_KEYSTRING (your registered Etsy app keystring).'
  );
}

async function etsyFetch(userId, method, path, { query, body } = {}) {
  const token = await tokenFor(userId);
  const shopId = await shopFor(userId);
  if (!etsyAppConfigured || !token || !shopId) throw notConnected();
  const url = BASE + path.replace(':shop_id', shopId) + (query ? `?${new URLSearchParams(query)}` : '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'x-api-key': KEYSTRING,
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Etsy ${method} ${path} failed (HTTP ${res.status})${t ? `: ${t.slice(0, 200)}` : ''}`);
    }
    return res.status === 204 ? {} : await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Etsy request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Map each MCP tool to Etsy Open API v3 operations. Content generation and
// review clustering are derived server-side from fetched data (Etsy has no
// "write my SEO" endpoint) — they read the shop, then compute.
export async function etsyExec(userId, tool, args = {}) {
  if (!(await etsyReady(userId))) throw notConnected();
  switch (tool) {
    case 'search_shop_listings': {
      const state = args.state || 'active';
      const data = await etsyFetch(userId, 'GET', '/shops/:shop_id/listings', {
        query: { state, limit: args.limit || 50, includes: 'Images' },
      });
      return { state, count: data.count, results: data.results };
    }
    case 'get_listing':
      return etsyFetch(userId, 'GET', `/listings/${encodeURIComponent(args.listingId)}`, {
        query: { includes: 'Images,Inventory,Shipping' },
      });
    case 'analyze_shop_performance': {
      // Receipts drive revenue/fee/fulfillment analysis.
      const receipts = await etsyFetch(userId, 'GET', '/shops/:shop_id/receipts', {
        query: { limit: args.limit || 100 },
      });
      return { period: args.period || 'recent', receipts };
    }
    case 'create_draft_listing':
      return etsyFetch(userId, 'POST', '/shops/:shop_id/listings', { body: args });
    case 'update_listing':
      return etsyFetch(userId, 'PATCH', `/shops/:shop_id/listings/${encodeURIComponent(args.listingId)}`, { body: args });
    // generate_listing_content / analyze_reviews / draft_customer_reply read
    // shop data then synthesize; wire their specific fetches as the shop is
    // connected. Until Etsy is live, the demo account serves these.
    default:
      throw new Error(`EtsyOps: "${tool}" requires additional shop scopes — connect your Etsy shop to enable it.`);
  }
}
