// chrome.mjs — shared agent-Chrome primitives for the EtsyOps go-live scripts
// (etsy-app-setup.mjs, connect-shop.mjs). Same conventions as submit-plugin.mjs:
// connect to the persistent chrome-bridge agent Chrome over CDP (auto-launch if
// down), screenshot every step, and print explicit "do this" blocks for anything
// that isn't safe to automate. Nothing here types or stores a secret in a log.

import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export const CDP = 'http://127.0.0.1:9222';
export const LAUNCHER = '/Users/isaiahdupree/Documents/Chrome/chrome-bridge/chrome-launcher.sh';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function mkLog(prefix) {
  return (...a) => console.log(`[${prefix} ${new Date().toTimeString().slice(0, 8)}]`, ...a);
}

// A big, unmissable "only a human can do this" block.
export function loud(lines) {
  const bar = '='.repeat(72);
  console.log(`\n${bar}\n  ACTION NEEDED (only you can do this):\n`);
  for (const l of [].concat(lines)) console.log(`    ${l}`);
  console.log(`${bar}\n`);
}

export function mkShot(prefix, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (page, label) => {
    n += 1;
    const f = path.join(dir, `${prefix}-${String(n).padStart(2, '0')}-${label}.png`);
    try {
      await page.bringToFront().catch(() => {});
      await page.screenshot({ path: f, fullPage: true });
      console.log(`[${prefix}] shot → ${path.basename(f)}`);
    } catch { /* screenshots are best-effort */ }
    return f;
  };
}

export const waitFor = async (fn, { timeoutMs = 0, intervalMs = 3000, desc = 'condition' } = {}) => {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (timeoutMs && Date.now() - t0 > timeoutMs) throw new Error('timeout: ' + desc);
    await sleep(intervalMs);
  }
};

async function cdpAlive() {
  try { return (await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}

// Connect to the agent Chrome, launching it (persistent profile) if CDP is down.
export async function connect(log = mkLog('chrome')) {
  if (!(await cdpAlive())) {
    log('CDP down — launching agent Chrome…');
    spawn('/bin/zsh', [LAUNCHER, 'agent'], { detached: true, stdio: 'ignore' }).unref();
    await waitFor(cdpAlive, { intervalMs: 1500, desc: 'CDP' });
  }
  const b = await puppeteer.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 180000 });
  log('connected to Chrome', await b.version());
  return b;
}

// Reuse an existing tab whose URL matches `re`, else open `fallbackUrl` in a new tab.
export async function openTab(browser, re, fallbackUrl, log = mkLog('chrome')) {
  const pages = await browser.pages();
  let page = pages.find((p) => { try { return re.test(p.url()); } catch { return false; } });
  if (!page) {
    page = await browser.newPage();
    if (fallbackUrl) { await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded' }).catch(() => {}); }
  } else {
    await page.bringToFront().catch(() => {});
  }
  return page;
}

// Defensive label→field fill for React/plain inputs (from submit-plugin.mjs).
export async function fillByLabel(page, matchers, value, log = mkLog('chrome')) {
  if (value == null || value === '') return false;
  const ok = await page.evaluate((matchers, value) => {
    const lc = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const setVal = (el) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      el.focus(); setter ? setter.call(el, value) : (el.value = value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    };
    for (const m of matchers) {
      const needle = lc(m);
      for (const el of document.querySelectorAll('input, textarea')) {
        if (el.type === 'file' || el.type === 'checkbox') continue;
        const lab = lc((el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.closest('label')?.textContent || '');
        const hint = lc(el.getAttribute('aria-label')) + ' ' + lc(el.placeholder) + ' ' + lab;
        if (hint.includes(needle)) { setVal(el); return true; }
      }
    }
    return false;
  }, matchers, value);
  log(`  field "${matchers[0]}": ${ok ? 'set' : 'NOT FOUND'}`);
  return ok;
}

// Trusted click on a button/link whose visible text contains `text`.
export async function clickByText(page, text, log = mkLog('chrome')) {
  const h = await page.evaluateHandle((text) => {
    const lc = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return [...document.querySelectorAll('button,a,[role="button"]')]
      .find((e) => lc(e.textContent).includes(lc(text)) && !e.disabled) || null;
  }, text);
  if (!(await h.evaluate((e) => !!e))) { log(`  click "${text}": NOT FOUND`); return false; }
  await h.click();
  log(`  click "${text}": ok`);
  return true;
}
