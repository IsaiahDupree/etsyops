// POST /etsy/disconnect — forget this seller's Etsy credentials. The tools go
// back to the honest "connect your Etsy shop" state immediately.
import { requireAuth } from '../../lib/auth.js';
import { redis } from '../../lib/redis.js';

export default async function handler(req, res) {
  const session = requireAuth(req, res, 'session');
  if (!session) return;
  await Promise.all([
    redis.del(`etsy:token:${session.sub}`),
    redis.del(`etsy:refresh:${session.sub}`),
    redis.del(`etsy:shop:${session.sub}`),
    redis.del(`etsy:token_exp:${session.sub}`),
  ]);
  res.json({ ok: true, connected: false });
}
