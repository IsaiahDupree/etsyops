// GET /etsy/connect — start the "connect your Etsy shop" OAuth handshake.
//
// The dashboard calls this with the seller's session bearer. We mint a PKCE
// verifier + CSRF state, stash them server-side keyed by state (so the callback
// — which arrives as a top-level redirect from etsy.com with no bearer — can
// recover which EtsyOps user it belongs to), and return the Etsy authorize URL
// for the client to redirect to. In demo mode (no ETSY_KEYSTRING) we say so
// plainly instead of sending the seller to a broken Etsy screen.
import { requireAuth } from '../../lib/auth.js';
import { baseUrl } from '../../lib/http.js';
import { redis } from '../../lib/redis.js';
import { etsyOAuthConfigured, makePkce, makeState, buildAuthorizeUrl } from '../../lib/etsyOAuth.js';

const STATE_TTL = 600; // 10 minutes to complete the handshake

export default async function handler(req, res) {
  const session = requireAuth(req, res, 'session');
  if (!session) return;

  if (!etsyOAuthConfigured) {
    return res.status(200).json({
      configured: false,
      message:
        'Live Etsy connection is not enabled on this deployment (demo mode). ' +
        'Set ETSY_KEYSTRING (your registered Etsy app keystring) to let sellers connect their shop.',
    });
  }

  const base = baseUrl(req);
  const state = makeState();
  const { verifier, challenge } = makePkce();
  await redis.set(`etsy:oauth:${state}`, JSON.stringify({ userId: session.sub, verifier }), STATE_TTL);

  const authorizeUrl = buildAuthorizeUrl({ state, challenge, base });
  return res.status(200).json({ configured: true, authorizeUrl });
}
