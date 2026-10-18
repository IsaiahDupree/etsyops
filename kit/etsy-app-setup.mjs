// etsy-app-setup.mjs — get EtsyOps ready for LIVE shop data.
//
// Automates the Etsy-developer side of go-live over the agent Chrome:
//   1. open the Etsy "Your Apps" page (developers.etsy.com), wait for sign-in;
//   2. locate your app (or guide you to create one) and read its KEYSTRING;
//   3. register the OAuth callback URL EtsyOps needs
//      (https://etsyops.vercel.app/etsy/callback) with the required scopes;
//   4. save the keystring to ../.env.local (gitignored) and print the exact
//      `vercel env add` + redeploy commands to flip the deployment out of demo
//      mode. The keystring is masked in all console output.
//
// Defensive by design: the Etsy portal markup shifts, so every step screenshots
// to ./screenshots and anything it can't do reliably is printed as an explicit
// "do this" block instead of clicking blindly. Nothing is submitted for you.
//
//   node etsy-app-setup.mjs
//   BASE=https://etsyops.vercel.app node etsy-app-setup.mjs   # override target

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openTab, fillByLabel, clickByText, mkLog, mkShot, loud, waitFor, sleep } from './lib/chrome.mjs';

const KIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(KIT_DIR, 'screenshots');
const ENV_FILE = path.join(KIT_DIR, '..', '.env.local');
const BASE = (process.env.BASE || 'https://etsyops.vercel.app').replace(/\/+$/, '');
const CALLBACK = `${BASE}/etsy/callback`;
const SCOPES = 'listings_r listings_w shops_r transactions_r email_r';
const APPS_URL = 'https://www.etsy.com/developers/your-apps';

const log = mkLog('etsy-app');
const shot = mkShot('etsyapp', SHOTS);
const mask = (s) => (s ? `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)` : '(none)');

// Is the current page a signed-in developer view (not the login wall)?
async function signedIn(page) {
  try {
    const u = page.url();
    if (/signin|\/login/i.test(u)) return false;
    return await page.evaluate(() =>
      /your apps|create a new app|keystring|api key/i.test(document.body.innerText || ''));
  } catch { return false; }
}

// Heuristic: find the app's keystring on the page. Etsy shows it near the word
// "Keystring" as a ~24–32 char base36-ish token. Returns the token or null.
async function extractKeystring(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    // Prefer a token on the same line/adjacent to a "Keystring" / "API Key" label.
    const lines = text.split('\n').map((l) => l.trim());
    const tokenRe = /\b([a-z0-9]{24,32})\b/i;
    for (let i = 0; i < lines.length; i++) {
      if (/keystring|api key/i.test(lines[i])) {
        for (let j = i; j <= i + 2 && j < lines.length; j++) {
          const m = lines[j].match(tokenRe);
          if (m) return m[1];
        }
      }
    }
    // Fallback: any input/code element value that looks like a keystring.
    for (const el of document.querySelectorAll('input,code,pre,span')) {
      const v = (el.value || el.textContent || '').trim();
      const m = v.match(/^([a-z0-9]{24,32})$/i);
      if (m) return m[1];
    }
    return null;
  });
}

function saveKeystring(keystring) {
  let body = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  if (/^ETSY_KEYSTRING=.*$/m.test(body)) body = body.replace(/^ETSY_KEYSTRING=.*$/m, `ETSY_KEYSTRING=${keystring}`);
  else body += (body.endsWith('\n') || !body ? '' : '\n') + `ETSY_KEYSTRING=${keystring}\n`;
  fs.writeFileSync(ENV_FILE, body, { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); } catch {}
}

async function main() {
  log(`target: ${BASE}  |  callback to register: ${CALLBACK}`);
  const browser = await connect(log);
  const page = await openTab(browser, /etsy\.com\/developers/i, APPS_URL, log);
  await sleep(2500);
  await shot(page, 'apps-open');

  if (!(await signedIn(page))) {
    loud([
      'Sign in to Etsy in the agent Chrome window that just opened,',
      `then navigate to:  ${APPS_URL}`,
      'This script will continue automatically once you are on the Your Apps page.',
    ]);
    await waitFor(() => signedIn(page), { intervalMs: 4000, desc: 'Etsy sign-in' });
    await shot(page, 'signed-in');
  }
  log('signed in ✓');

  // 1) Keystring — try to read it; if there is no app yet, guide creation.
  let keystring = await extractKeystring(page);
  if (!keystring) {
    loud([
      'No existing app keystring detected on this page.',
      'If you have an app: open it (click its name) so the Keystring is visible, then re-run this script.',
      'If you do NOT have an app yet: click "Create a New App", fill:',
      '   • App name:  EtsyOps',
      '   • What are you building:  an AI assistant that helps sellers audit and improve their Etsy listings',
      '   • Agree to the API terms and create it.',
      'Then open the app so its Keystring shows, and re-run this script.',
    ]);
    await shot(page, 'no-keystring');
  } else {
    log('keystring found:', mask(keystring));
    saveKeystring(keystring);
    log(`saved ETSY_KEYSTRING to ${ENV_FILE} (gitignored, 0600) — masked ${mask(keystring)}`);
  }

  // 2) Callback URL — attempt to fill the field; always print the exact value.
  log(`registering callback URL: ${CALLBACK}`);
  const filled = await fillByLabel(page, ['callback url', 'callback urls', 'redirect uri', 'redirect url'], CALLBACK, log);
  if (filled) {
    await shot(page, 'callback-filled');
    loud([
      'A Callback URL field was filled with:',
      `   ${CALLBACK}`,
      'Review it in the browser and click SAVE on the Etsy app settings.',
      '(Etsy allows multiple callback URLs — keep any existing ones.)',
    ]);
  } else {
    loud([
      'Could not locate the Callback URL field automatically. In the app settings,',
      'find "Callback URL(s)" and add EXACTLY (byte-for-byte):',
      `   ${CALLBACK}`,
      'then Save. A mismatch makes Etsy reject the OAuth handshake.',
    ]);
    await shot(page, 'callback-manual');
  }

  // 3) Next steps to flip out of demo mode.
  loud([
    keystring ? 'Keystring captured. To take the deployment LIVE:' : 'Once you have the keystring, to go LIVE:',
    '   cd ../server',
    '   vercel env add ETSY_KEYSTRING production      # paste the keystring (in .env.local)',
    '   vercel --prod --yes                            # redeploy',
    `Confirm:  curl -s ${BASE}/api/health   → "etsyConfigured": true`,
    'Then run:  node connect-shop.mjs   to connect a shop and verify live data.',
    `Scopes this app requests: ${SCOPES}`,
  ]);

  browser.disconnect();
  log('done. Review the screenshots in ./screenshots/.');
}

main().catch((e) => { console.error('[etsy-app] fatal:', e.message || e); process.exit(1); });
