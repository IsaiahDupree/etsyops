// Public health check — lets tooling verify the deployment is ready
// (Redis storage configured, and whether a live Etsy app credential is set)
// without authentication.
import { redisConfigured, redis } from '../lib/redis.js';
import { etsyAppConfigured } from '../lib/etsy.js';
import { billingEnabled } from '../lib/billing.js';

export default async function handler(req, res) {
  let redisOk = false;
  if (redisConfigured) {
    try {
      await redis.set('health:ping', '1', 10);
      redisOk = (await redis.get('health:ping')) != null;
    } catch {
      redisOk = false;
    }
  }
  const ok = redisConfigured && redisOk && !!process.env.JWT_SECRET;
  res.status(ok ? 200 : 503).json({
    ok,
    redisConfigured,
    redisOk,
    jwtSecretSet: !!process.env.JWT_SECRET,
    // When false, EtsyOps runs in demo mode (no ETSY_KEYSTRING); sellers can't
    // connect a live shop, and the reviewer demo account serves a sample shop.
    etsyConfigured: etsyAppConfigured,
    billingEnabled,
    version: '1.4.0',
  });
}
