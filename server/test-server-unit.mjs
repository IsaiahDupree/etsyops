// Unit tests for the server's pure logic. Runs entirely in-memory — do NOT set
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY when running these (the storage layer
// falls back to its in-memory Map so no live DB is touched):
//   node --test test-server-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { signJwt, verifyJwt, sha256b64u, pairingCode, hashPassword, checkPassword, randomId } from './lib/auth.js';
import { isSendableEmail } from './lib/email.js';
import { clientIp } from './lib/ratelimit.js';
import { redis } from './lib/redis.js';
import { waitForJob } from './lib/relay.js';
import { demoExec } from './lib/demoStore.js';
import { getPlan, billingEnabled } from './lib/billing.js';
import { makePkce, makeState, buildAuthorizeUrl, ETSY_SCOPES, etsyOAuthConfigured } from './lib/etsyOAuth.js';
import { registerDevice, listDevices, revokeDevice, revokeAllDevices, currentEpoch } from './lib/agentauth.js';

// ---- auth: JWT ----
test('JWT round-trips and carries claims', () => {
  const t = signJwt({ kind: 'mcp', sub: 'usr_1' }, 60);
  const p = verifyJwt(t);
  assert.equal(p.kind, 'mcp');
  assert.equal(p.sub, 'usr_1');
});
test('JWT tamper is rejected', () => {
  const t = signJwt({ kind: 'session', sub: 'u' }, 60);
  const [h, b] = t.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ kind: 'session', sub: 'admin', exp: 9999999999 })).toString('base64url');
  assert.equal(verifyJwt(`${h}.${forgedBody}.${t.split('.')[2]}`), null);
});
test('JWT with a bogus/short signature returns null (no throw/bypass)', () => {
  const t = signJwt({ kind: 'agent', sub: 'u' }, 60);
  const [h, b] = t.split('.');
  assert.equal(verifyJwt(`${h}.${b}.short`), null);
  assert.equal(verifyJwt(`${h}.${b}.`), null);
  assert.equal(verifyJwt('not.a.jwt'), null);
});
test('expired JWT returns null', () => {
  const t = signJwt({ kind: 'mcp', sub: 'u' }, -1);
  assert.equal(verifyJwt(t), null);
});

// ---- auth: PKCE + helpers ----
test('sha256b64u matches PKCE S256 of a verifier', () => {
  // known vector: verifier -> challenge
  const c = sha256b64u('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(c, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('pairingCode is 8 chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const c = pairingCode();
    assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  }
});
test('password hash verifies and rejects wrong password', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(checkPassword('correct horse battery staple', stored), true);
  assert.equal(checkPassword('wrong', stored), false);
});
test('randomId has prefix and hex entropy', () => {
  const id = randomId('job');
  assert.match(id, /^job_[0-9a-f]{24}$/);
});

// ---- email deliverability guard ----
test('isSendableEmail accepts real addresses, rejects junk/test TLDs', () => {
  assert.equal(isSendableEmail('a@b.com'), true);
  assert.equal(isSendableEmail('user+tag@gmail.com'), true);
  assert.equal(isSendableEmail('x@y.test'), false);
  assert.equal(isSendableEmail('r@etsyops.demo'), false);
  assert.equal(isSendableEmail('nope'), false);
  assert.equal(isSendableEmail(''), false);
  assert.equal(isSendableEmail('a@localhost'), false);
});

// ---- rate-limit client IP parsing (must NOT trust the spoofable leftmost XFF) ----
test('clientIp prefers platform x-real-ip', () => {
  assert.equal(clientIp({ headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': 'spoofed, 203.0.113.9' }, socket: {} }), '203.0.113.9');
});
test('clientIp uses the RIGHTMOST forwarded hop, never the client-controlled leftmost', () => {
  // client sends "1.2.3.4" (spoofed), proxy appends the real IP on the right
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }, socket: {} }), '203.0.113.7');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': ['1.1.1.1', '203.0.113.5'] }, socket: {} }), '203.0.113.5');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }), '10.0.0.1');
});

// ---- storage (memory fallback) ----
test('redis memory: incr increments and expire works', async () => {
  await redis.del('t:c');
  assert.equal(await redis.incr('t:c'), 1);
  assert.equal(await redis.incr('t:c'), 2);
});
test('redis memory: lpush+rpop is FIFO', async () => {
  await redis.del('t:q');
  await redis.lpush('t:q', 'a');
  await redis.lpush('t:q', 'b');
  assert.equal(await redis.rpop('t:q'), 'a');
  assert.equal(await redis.rpop('t:q'), 'b');
  assert.equal(await redis.rpop('t:q'), null);
});

// ---- relay long-poll ----
test('waitForJob returns immediately when a job is queued', async () => {
  await redis.del('jobs:u');
  await redis.lpush('jobs:u', JSON.stringify({ jobId: 'j', tool: 'search_shop_listings', args: {} }));
  const t0 = Date.now();
  const job = await waitForJob('u', 5);
  assert.equal(job.jobId, 'j');
  assert.ok(Date.now() - t0 < 300);
});
test('waitForJob times out to null with no job', async () => {
  await redis.del('jobs:none');
  const job = await waitForJob('none', 1);
  assert.equal(job, null);
});
test('waitForJob picks up a job enqueued mid-wait', async () => {
  await redis.del('jobs:mid');
  setTimeout(() => redis.lpush('jobs:mid', JSON.stringify({ jobId: 'later', tool: 'x', args: {} })), 400);
  const job = await waitForJob('mid', 5);
  assert.equal(job.jobId, 'later');
});

// ---- demo store: sample Etsy shop intelligence ----
test('demoExec search_shop_listings returns listings and flags the weak one', async () => {
  const s = await demoExec('demoA', 'search_shop_listings', { state: 'all' });
  assert.ok(s.count >= 6 && Array.isArray(s.results));
  const mug = s.results.find((l) => l.listing_id === 700104);
  assert.ok(mug && mug.seo_score === 31); // the deliberately weak "Ceramic Coffee Mug"
});
test('demoExec search_shop_listings underperforming surfaces the mug', async () => {
  const s = await demoExec('demoA', 'search_shop_listings', { state: 'active', underperforming: true });
  assert.ok(s.results.some((l) => l.listing_id === 700104));
});
test('demoExec get_listing returns detail + issues', async () => {
  const l = await demoExec('demoA', 'get_listing', { listingId: 700104 });
  assert.equal(l.listing_id, 700104);
  assert.ok(Array.isArray(l.issues) && l.issues.length > 0);
});
test('demoExec generate_listing_content produces a full SEO draft', async () => {
  const c = await demoExec('demoA', 'generate_listing_content', { listingId: 700104 });
  assert.ok(c.suggested_title && c.suggested_title.length > 40);
  assert.equal(c.suggested_tags.length, 13); // Etsy allows up to 13 tags
});
test('demoExec analyze_shop_performance summarizes revenue + fees', async () => {
  const p = await demoExec('demoA', 'analyze_shop_performance', {});
  assert.ok(p.revenue_30d > 0 && p.estimated_fees_30d > 0);
  assert.ok(Array.isArray(p.best_sellers) && Array.isArray(p.recommendations));
});
test('demoExec analyze_reviews clusters complaints', async () => {
  const r = await demoExec('demoA', 'analyze_reviews', {});
  assert.ok(r.clusters.some((c) => /shipping|size/i.test(c.complaint) && typeof c.mentions === 'number'));
});
test('demoExec draft_customer_reply drafts (never sends) a reply', async () => {
  const d = await demoExec('demoA', 'draft_customer_reply', { messageId: 'msg-8802' });
  assert.ok(typeof d.draft_reply === 'string' && d.draft_reply.length > 0);
  assert.match(d.note, /Draft only|review/i);
});
test('demoExec create_draft_listing creates a draft (not published)', async () => {
  const d = await demoExec('demoA', 'create_draft_listing', { title: 'Test candle', price: 24 });
  assert.equal(d.created, true);
  assert.equal(d.listing.state, 'draft');
});
test('demoExec update_listing reports applied fields', async () => {
  const u = await demoExec('demoA', 'update_listing', { listingId: 700104, title: 'Better mug title' });
  assert.equal(u.updated, true);
  assert.equal(u.applied.title, 'Better mug title');
});
test('demoExec get_listing rejects an unknown listing', async () => {
  await assert.rejects(() => demoExec('demoA', 'get_listing', { listingId: 'nope' }), /Listing not found/);
});

// ---- Etsy connect-shop OAuth (auth-code + PKCE) ----
test('etsy OAuth: PKCE verifier + S256 challenge are well-formed', () => {
  const { verifier, challenge } = makePkce();
  assert.ok(verifier.length >= 43 && /^[A-Za-z0-9._~-]+$/.test(verifier)); // RFC 7636 alphabet
  assert.equal(challenge, sha256b64u(verifier));                            // S256(verifier)
  assert.ok(!challenge.includes('=')); // base64url, unpadded
});
test('etsy OAuth: authorize URL carries the required params', () => {
  const url = new URL(buildAuthorizeUrl({ state: 'st', challenge: 'ch', base: 'https://etsyops.vercel.app' }));
  assert.equal(url.origin + url.pathname, 'https://www.etsy.com/oauth/connect');
  const q = url.searchParams;
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('code_challenge'), 'ch');
  assert.equal(q.get('state'), 'st');
  assert.ok(q.get('redirect_uri').endsWith('/etsy/callback'));
  assert.equal(q.get('scope'), ETSY_SCOPES);
});
test('etsy OAuth: state values are unique', () => {
  assert.notEqual(makeState(), makeState());
});
test('etsy OAuth: disabled without a keystring (demo mode)', () => {
  assert.equal(etsyOAuthConfigured, false); // no ETSY_KEYSTRING in the test env
});

// ---- billing: default plan behaviour ----
test('getPlan defaults to pro when billing is not configured', async () => {
  assert.equal(billingEnabled, false); // no STRIPE_SECRET_KEY in the test env
  assert.equal(await getPlan('anybody'), 'pro');
});

// ---- agent device registry + revocation ----
test('device register/list/revoke lifecycle', async () => {
  const u = 'usr_devtest';
  await registerDevice(u, 'dev_a', "Isaiah's MacBook");
  await registerDevice(u, 'dev_b', 'Studio');
  let list = await listDevices(u);
  assert.equal(list.length, 2);
  assert.ok(list.find((d) => d.jti === 'dev_a' && d.label === "Isaiah's MacBook"));
  await revokeDevice(u, 'dev_a');
  list = await listDevices(u);
  assert.equal(list.length, 1);
  assert.equal(list[0].jti, 'dev_b');
});
test('revokeAllDevices clears the list and bumps the epoch', async () => {
  const u = 'usr_epochtest';
  assert.equal(await currentEpoch(u), 0);
  await registerDevice(u, 'dev_x', 'X');
  const n = await revokeAllDevices(u);
  assert.equal(n, 1);
  assert.equal((await listDevices(u)).length, 0);
  assert.equal(await currentEpoch(u), 1); // any token issued at epoch < 1 is now revoked
});

