// connect-shop.mjs — drive + verify the "connect your Etsy shop" OAuth handshake.
//
// End-to-end test of the live path built in server/api/etsy/*:
//   1. sign in to the EtsyOps account via the API (session token);
//   2. GET /etsy/status — bail early if the deployment is in demo mode
//      (no ETSY_KEYSTRING) or already connected;
//   3. GET /etsy/connect — get the Etsy authorize URL;
//   4. open it in the agent Chrome (which must be logged in to Etsy as the
//      seller), screenshot the consent page, and click Allow;
//   5. Etsy → /etsy/callback (server stores token/shop) → /?etsy=connected;
//   6. poll /etsy/status until connected and print the shop_id.
//
// Credentials come from ../.env.local (DEMO_EMAIL/DEMO_PASSWORD) or the env
// (SELLER_EMAIL/SELLER_PASSWORD). Nothing sensitive is printed.
//
//   node connect-shop.mjs
//   SELLER_EMAIL=me@shop.com SELLER_PASSWORD=… node connect-shop.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, mkLog, mkShot, loud, waitFor, sleep, clickByText } from './lib/chrome.mjs';

const KIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(KIT_DIR, 'screenshots');
const ENV_FILE = path.join(KIT_DIR, '..', '.env.local');
const BASE = (process.env.BASE || 'https://etsyops.vercel.app').replace(/\/+$/, '');

const env = fs.existsSync(ENV_FILE)
  ? Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {};
const EMAIL = process.env.SELLER_EMAIL || env.DEMO_EMAIL || 'reviewer@etsyops.demo';
const PASSWORD = process.env.SELLER_PASSWORD || env.DEMO_PASSWORD || '';

const log = mkLog('connect');
const shot = mkShot('connect', SHOTS);

async function api(pathname, { token, method = 'GET' } = {}) {
  const r = await fetch(BASE + pathname, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${pathname} → HTTP ${r.status}`);
  return j;
}

async function login() {
  if (!PASSWORD) {
    loud([
      'No password available. Set the seller credentials first:',
      '   • add DEMO_PASSWORD to ../.env.local (the reviewer demo account), or',
      '   • SELLER_EMAIL=… SELLER_PASSWORD=… node connect-shop.mjs',
    ]);
    process.exit(1);
  }
  const r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error('login failed: ' + (j.error || r.status));
  return j.token;
}

async function main() {
  log(`target ${BASE}  |  account ${EMAIL}`);
  const token = await login();
  log('signed in ✓');

  let status = await api('/etsy/status', { token });
  if (!status.configured) {
    loud([
      'This deployment is in DEMO MODE (no ETSY_KEYSTRING) — there is no live Etsy',
      'connection to make. Run  node etsy-app-setup.mjs  first, set ETSY_KEYSTRING on',
      'Vercel, redeploy, then re-run this script.',
    ]);
    process.exit(0);
  }
  if (status.connected) {
    log(`already connected to Etsy shop #${status.shop_id} ✓ — nothing to do.`);
    process.exit(0);
  }

  const { authorizeUrl } = await api('/etsy/connect', { token });
  if (!authorizeUrl) throw new Error('no authorizeUrl returned from /etsy/connect');
  log('got Etsy authorize URL');

  const browser = await connect(log);
  const page = await browser.newPage();
  await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(3000);
  await shot(page, 'etsy-consent');

  // If Etsy shows its sign-in wall, the seller must log in first.
  if (/signin|\/login/i.test(page.url())) {
    loud([
      'Etsy is asking you to sign in (as the shop owner) in the agent Chrome window.',
      'Sign in, and — if shown — click "Allow" / "Grant access" on the EtsyOps consent screen.',
    ]);
  } else {
    // Try to approve automatically; fall back to a manual prompt.
    const clicked =
      (await clickByText(page, 'Allow', log)) ||
      (await clickByText(page, 'Grant access', log)) ||
      (await clickByText(page, 'Continue', log));
    if (!clicked) {
      loud(['Could not find the Allow button. Click "Allow" / "Grant access" in the browser to approve.']);
    }
  }

  // Wait for the redirect back to the dashboard (…/?etsy=connected) OR for the
  // server-side status to flip — whichever happens first.
  log('waiting for the shop to connect…');
  const connected = await waitFor(async () => {
    const s = await api('/etsy/status', { token }).catch(() => ({}));
    return s.connected ? s : false;
  }, { timeoutMs: 180000, intervalMs: 4000, desc: 'etsy connected' });

  await shot(page, 'connected');
  log(`✓ CONNECTED to Etsy shop #${connected.shop_id}. Live tools now act on this shop.`);
  loud([
    `Verified: ${EMAIL} → Etsy shop #${connected.shop_id}.`,
    'Try it in your assistant:  "Audit my Etsy shop and show my worst-performing listings."',
    'Disconnect any time from the EtsyOps dashboard.',
  ]);
  browser.disconnect();
}

main().catch((e) => { console.error('[connect] fatal:', e.message || e); process.exit(1); });
