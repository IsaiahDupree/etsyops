// mcpTools.js — the MCP server EtsyOps exposes to ChatGPT / Claude / Codex.
//
// EtsyOps is an AI Etsy shop operator: it researches and audits your listings,
// generates SEO-ready titles/tags/descriptions, analyzes shop performance and
// reviews, drafts customer replies, and creates/updates listings on your behalf
// over the Etsy Open API v3. Free accounts get a shop audit + limited read-only
// tools; paid plans unlock listing creation/updates and review mining.
//
// Real sellers forward to their connected Etsy shop (server/lib/etsy.js); the
// reviewer demo account is served a sample shop from demoStore.js. Read tools
// only read/derive; the two write tools are explicitly annotated (create =
// additive, update = overwrites) so the assistant asks before changing a shop.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { etsyExec } from './etsy.js';
import { demoExec } from './demoStore.js';
import { redis } from './redis.js';
import { getPlan, billingEnabled } from './billing.js';

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const asError = (err) => ({ isError: true, content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }] });

// Read tools only read/derive external Etsy data — openWorld true (Etsy is an
// external, changing world).
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
// Create a draft: writes to the shop but is additive (a new draft, not published).
const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
// Update a listing: overwrites existing fields on a real listing.
const UPDATE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

const UPGRADE_URL = `${(process.env.PUBLIC_BASE_URL || 'https://etsyops.vercel.app').replace(/\/+$/, '')}/upgrade`;
const FREE_MONTHLY = Number(process.env.FREE_MONTHLY_CHECKS || 5);

// Paid: writing to the shop + deep review mining are the Seller/Growth value.
const PRO_ONLY = new Set(['create_draft_listing', 'update_listing', 'analyze_reviews']);
// Free-tier quick tools, metered per month.
const CAPPED = new Set(['generate_listing_content', 'analyze_shop_performance']);

const month = () => new Date().toISOString().slice(0, 7).replace('-', '');
async function bumpMonthly(userId) {
  const key = `usage:${userId}:${month()}`;
  const n = await redis.incr(key);
  await redis.expire(key, 3456000); // 40 days
  return n;
}

export function buildServer(userId, { demo = false } = {}) {
  const server = new McpServer({ name: 'etsyops', version: '1.0.0' });

  // Demo accounts act as a paid plan so reviewers can exercise every tool
  // against the sample shop. Real accounts get their plan from Stripe.
  const planIsPro = async () => (demo ? true : billingEnabled ? (await getPlan(userId)) === 'pro' : true);
  const exec = demo ? (tool, args) => demoExec(userId, tool, args) : (tool, args) => etsyExec(userId, tool, args);

  const forward = (tool) => async (args) => {
    try {
      const pro = await planIsPro();
      if (PRO_ONLY.has(tool) && !pro) {
        return asText({
          upgrade_required: true,
          message: `${tool} is a paid feature. Upgrade (Seller $29/mo) to create and update listings and mine your reviews.`,
          upgrade_url: UPGRADE_URL,
        });
      }
      if (CAPPED.has(tool) && !pro) {
        const n = await bumpMonthly(userId);
        if (n > FREE_MONTHLY) {
          return asText({
            upgrade_required: true,
            message: `You've used your ${FREE_MONTHLY} free operations this month. Upgrade (Seller $29/mo) for unlimited audits and content, or Growth ($79/mo) for review mining + experiments.`,
            upgrade_url: UPGRADE_URL,
          });
        }
      }
      return asText(await exec(tool, args ?? {}));
    } catch (e) {
      return asError(e);
    }
  };

  server.registerTool('search_shop_listings', {
    title: 'Search & audit your listings',
    description: "List and search your Etsy shop's listings by state (active, draft, sold out, expired) and keyword, with each listing's views, favorites, sales, revenue, SEO score, and detected issues. Use `underperforming: true` to surface listings that need attention.",
    inputSchema: {
      query: z.string().optional(),
      state: z.string().optional().describe('active | draft | sold_out | expired | all'),
      underperforming: z.boolean().optional(),
      limit: z.number().int().optional(),
    },
    annotations: RO,
  }, forward('search_shop_listings'));

  server.registerTool('get_listing', {
    title: 'Get a listing',
    description: 'Full detail for one listing — price, quantity, tags, SEO score, and the specific issues holding it back.',
    inputSchema: { listingId: z.union([z.string(), z.number()]) },
    annotations: RO,
  }, forward('get_listing'));

  server.registerTool('generate_listing_content', {
    title: 'Generate SEO listing content',
    description: 'Generate an Etsy-optimized title (up to 140 chars), 13 tags, a description, and image alt-text for an existing listing (by id) or a described product. Returns a draft you review — nothing is published. This is where a weak listing gets fixed.',
    inputSchema: { listingId: z.union([z.string(), z.number()]).optional(), product: z.string().optional(), tone: z.string().optional() },
    annotations: RO,
  }, forward('generate_listing_content'));

  server.registerTool('analyze_shop_performance', {
    title: 'Analyze shop performance',
    description: "Summarize the shop's recent revenue, orders, estimated Etsy fees, net, average order value, best sellers, and underperformers — with prioritized recommendations.",
    inputSchema: { period: z.string().optional().describe('e.g. 30d, 90d') },
    annotations: RO,
  }, forward('analyze_shop_performance'));

  server.registerTool('analyze_reviews', {
    title: 'Mine your reviews (Growth)',
    description: 'Paid. Cluster your shop reviews into recurring complaint/request themes with how often each is mentioned, severity, affected listings, and a recommended fix — so you know exactly what to improve.',
    inputSchema: { listingId: z.union([z.string(), z.number()]).optional() },
    annotations: RO,
  }, forward('analyze_reviews'));

  server.registerTool('draft_customer_reply', {
    title: 'Draft a customer reply',
    description: 'Draft a friendly, on-brand reply to a customer message or review (by message id, or from pasted text). Returns a draft to review — it does not send anything.',
    inputSchema: { messageId: z.string().optional(), text: z.string().optional(), intent: z.string().optional() },
    annotations: RO,
  }, forward('draft_customer_reply'));

  server.registerTool('create_draft_listing', {
    title: 'Create a draft listing (Seller)',
    description: 'Paid, write. Create a new DRAFT listing (physical or digital download) in your shop — title, description, price, tags, quantity, type. It is created as a draft for you to review and publish; it is never published automatically.',
    inputSchema: {
      title: z.string(), description: z.string().optional(), price: z.number(),
      tags: z.array(z.string()).optional(), type: z.string().optional().describe('physical | download'),
      quantity: z.number().int().optional(),
    },
    annotations: CREATE,
  }, forward('create_draft_listing'));

  server.registerTool('update_listing', {
    title: 'Update a listing (Seller)',
    description: 'Paid, write, overwrites. Update fields on an existing listing — title, price, quantity, tags, description, or state (e.g. activate/deactivate). Read the listing first; this overwrites the fields you pass.',
    inputSchema: {
      listingId: z.union([z.string(), z.number()]),
      title: z.string().optional(), price: z.number().optional(), quantity: z.number().int().optional(),
      tags: z.array(z.string()).optional(), description: z.string().optional(), state: z.string().optional(),
    },
    annotations: UPDATE,
  }, forward('update_listing'));

  server.registerTool('get_plan', {
    title: 'Check plan & upgrade',
    description: "Report the user's current plan (free or paid), what the paid plans unlock, the monthly free allowance, and the upgrade link.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const pro = await planIsPro();
    return asText({
      plan: pro ? 'paid' : 'free',
      billing_enabled: billingEnabled,
      paid_features: ['Create & update listings', 'Review mining (analyze_reviews)', 'Listing experiments', 'Unlimited audits & content'],
      free_allowance: `${FREE_MONTHLY} audits/content operations / month`,
      plans: { seller: '$29/mo — create + update listings, unlimited content', growth: '$79/mo — review mining + experiments', agency: '$249/mo — multiple shops + API' },
      upgrade_url: UPGRADE_URL,
      note: pro ? 'You are on a paid plan — everything is unlocked.' : `You're on the free plan (${FREE_MONTHLY} operations/month). Upgrade at ${UPGRADE_URL}.`,
    });
  });

  return server;
}
