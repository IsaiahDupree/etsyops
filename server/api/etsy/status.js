// GET /etsy/status — is this seller's Etsy shop connected? (dashboard polls this)
import { requireAuth } from '../../lib/auth.js';
import { redis } from '../../lib/redis.js';
import { etsyOAuthConfigured } from '../../lib/etsyOAuth.js';

export default async function handler(req, res) {
  const session = requireAuth(req, res, 'session');
  if (!session) return;
  const [token, shop] = await Promise.all([
    redis.get(`etsy:token:${session.sub}`),
    redis.get(`etsy:shop:${session.sub}`),
  ]);
  res.json({
    configured: etsyOAuthConfigured, // false => demo mode, live connect disabled
    connected: !!(token && shop),
    shop_id: shop ? String(shop) : null,
  });
}
