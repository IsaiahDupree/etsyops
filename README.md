<div align="center">

# 🛍️ EtsyOps

**Your AI Etsy shop operator — audit listings, fix SEO, and grow sales.**

[![License: MIT](https://img.shields.io/badge/License-MIT-f5b942.svg)](./LICENSE)
[![Category: Developer Tools](https://img.shields.io/badge/category-Developer%20Tools-4ade80.svg)](#)
[![Built on Etsy Open API v3](https://img.shields.io/badge/engine-Etsy%20Open%20API%20v3-3b82f6.svg)](https://github.com/IsaiahDupree/etsyops)

</div>

EtsyOps is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) connector that turns ChatGPT, Claude, or Codex into an **AI shop operator for Etsy sellers.** It audits your listings, generates SEO-ready titles, tags, and descriptions, analyzes your shop's performance and reviews, drafts customer replies, and — on paid plans — creates and updates listings on your behalf, all over the official **[Etsy Open API v3](https://github.com/IsaiahDupree/etsyops).**

It is a fully **hosted, cloud** connector. There is no desktop app or Mac agent to install and nothing to run locally — you sign in, subscribe, add EtsyOps as an MCP connector, connect your Etsy shop once via OAuth, and ask it to work on your shop.

```
  ChatGPT / Claude / Codex  ──OAuth──►  EtsyOps (Vercel)  ──►  Etsy Open API v3
       (MCP connector)                  (auth · plans · 9 tools)     (your connected shop)
```

EtsyOps reads and writes **only your own shop's data**, and only through the Etsy access token you grant when you connect your shop. It never touches another seller's shop, never sells your data, and never builds behavioral profiles. It is built on the [Etsy Open API v3](https://github.com/IsaiahDupree/etsyops).

> **You stay in control.** Content tools return **drafts you review** — a title, tags, a description, a customer reply — and publish nothing on their own. The write tools either create a **draft listing (never auto-published)** or make the explicit update you asked for. Nothing goes live without you.

---

## For users — 3 steps

**1. Create your account** at **[etsyops.vercel.app](https://etsyops.vercel.app)** and pick a plan (Free to start, no card required).

**2. Add the connector.** In your MCP client, add a custom connector pointing at the EtsyOps MCP Server URL and sign in with OAuth:

- **ChatGPT:** Settings → **Connectors** → turn on **Developer mode** → **Create** a custom connector → paste **`https://etsyops.vercel.app/mcp`** → Authentication **OAuth** → sign in & **Allow**.
- **Claude / Codex:** add the same URL as a custom MCP connector and authorize via OAuth.

**3. Connect your shop and ask.** Authorize EtsyOps against your Etsy shop once (Etsy OAuth), then in a new chat:

> *"Audit my Etsy shop, show my worst-performing listings, and rewrite the SEO title and tags for my weakest one."*

That's it — no local agent, no pairing, no files on your machine. Everything runs in the cloud against your connected shop.

> **Demo mode vs. live data.** A live deployment needs the registered Etsy app's keystring (`ETSY_KEYSTRING`) set server-side, and each seller connects their own shop via Etsy OAuth (which stores that seller's `etsy:token:<userId>` and `etsy:shop:<userId>`). Until `ETSY_KEYSTRING` is set — or before you've connected a shop — EtsyOps runs in **demo mode**: the reviewer demo account is served a built-in **sample shop**, and every other account gets a clear *"connect your Etsy shop"* message instead of invented numbers. Going live is one config away.

---

## What it can do

| Tool | Action | Plan |
|------|--------|------|
| `search_shop_listings` | Search and audit your listings — views, favorites, sales, revenue, SEO score, and detected issues (supports `underperforming: true`) | Free |
| `get_listing` | Full detail plus detected issues for a single listing | Free |
| `generate_listing_content` | Draft an SEO title (up to 140 chars), 13 tags, a description, and image alt-text — a draft you review; nothing is published | Free (metered) |
| `analyze_shop_performance` | Revenue, orders, estimated Etsy fees, net, average order value, best sellers, underperformers, and prioritized recommendations | Free (metered) |
| `analyze_reviews` | Cluster your reviews into recurring complaint / request themes with mention counts, severity, affected listings, and a recommended fix | **Paid** |
| `draft_customer_reply` | Draft an on-brand reply to a customer message or review — returns a draft, does not send | Free |
| `create_draft_listing` | Create a new **draft** listing (additive, never auto-published) | **Paid** |
| `update_listing` | Update a listing's title, price, tags, quantity, description, or state | **Paid** |
| `get_plan` | Show your current plan, what paid unlocks, and an upgrade link | Free |

EtsyOps is a **shop operator**, not just a dashboard. Analytics tools tell you *what your numbers are*; EtsyOps tells you *which listings are hurting you, exactly what's wrong, and drafts the fix* — then, on paid plans, creates or updates the listing for you.

The read and audit tools (`search_shop_listings`, `get_listing`, `draft_customer_reply`, `get_plan`) are **Free**. `generate_listing_content` and `analyze_shop_performance` are **metered** — 5 operations / month on Free. `create_draft_listing`, `update_listing`, and `analyze_reviews` are **paid-only**. Only the two write tools change your shop, and even then `create_draft_listing` merely adds a draft — nothing is auto-published.

---

## Plans

EtsyOps is free to start. Upgrade when you want to create and update listings, mine your reviews, and run unlimited audits and content generation. Billing is handled by **[Stripe](https://stripe.com)** — we store only your plan status, never card numbers.

| Plan | Price | What you get |
|---|---|---|
| **Free** | $0 | 5 audit / content operations per month — listing audits, `get_listing`, `draft_customer_reply`, and metered `generate_listing_content` / `analyze_shop_performance` |
| **Seller** | **$29/mo** | Create + update listings, unlimited audits & content generation |
| **Growth** | **$79/mo** | Everything in Seller, plus review mining (`analyze_reviews`) and listing experiments |
| **Agency** | **$249/mo** | Everything in Growth, plus multiple shops and API access |

Run `get_plan` in any chat to see your current plan plus an upgrade link. The server enforces the Free monthly cap and gates the paid tools by your Stripe subscription. Upgrade at **[etsyops.vercel.app/upgrade](https://etsyops.vercel.app/upgrade)**.

> When Stripe is **not** configured (e.g. a self-hosted instance), every account is treated as **paid** so all nine tools are available. The reviewer demo account is likewise treated as paid.

---

## Self-hosting

You can run your own EtsyOps so nothing depends on the hosted instance.

**Prereqs:** a [Vercel](https://vercel.com) account, a [Supabase](https://supabase.com) project (free tiers are fine), and a registered **[Etsy Open API v3](https://developers.etsy.com)** app (for its keystring).

1. **Storage** — in your Supabase project's SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql). It creates the accounts, plans, and monthly usage-counter tables with RLS on.
2. **Deploy** the `server/` directory to Vercel.
3. **Set env vars** (see [`server/.env.example`](./server/.env.example)):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — your project + service-role key
   - `JWT_SECRET` — `openssl rand -hex 32`
   - `ETSY_KEYSTRING` — your registered Etsy app's keystring (the `x-api-key`), a server-side secret. **Omit to run in demo mode** (sample shop only). Each seller then connects their own shop via Etsy OAuth, which stores their `etsy:token:<userId>`, `etsy:shop:<userId>`, and `etsy:refresh:<userId>` in KV.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — for the paid tiers (optional; when omitted, every account is treated as paid).
4. **Register the OAuth callback** on your Etsy app (developers.etsy.com → your app → *Callback URLs*): add exactly `https://YOUR-APP.vercel.app/etsy/callback`. It must match byte-for-byte, or Etsy rejects the handshake. The requested scopes are `listings_r listings_w shops_r transactions_r email_r`.
5. **Verify:** `curl https://YOUR-APP.vercel.app/api/health` → `jwtSecretSet`, `etsyConfigured` (false = demo mode), and `billingEnabled` reflect your setup.
6. Add the connector in your MCP client pointing at `https://YOUR-APP.vercel.app/mcp`.
7. **Connect a shop:** sign in at `https://YOUR-APP.vercel.app`, then **Connect your Etsy shop** — you'll authorize on Etsy once (auth-code + PKCE), and the tools light up against your real shop. Access tokens auto-refresh; **Disconnect** on the dashboard revokes access.

---

## How it works

- **Auth** — OAuth 2.1 with PKCE and Dynamic Client Registration (RFC 7591). Your MCP client registers itself, the user signs in on the EtsyOps consent page, and the client receives a scoped MCP access token. JWTs are HMAC-signed in two kinds (`session`, `mcp`) with distinct privileges. Optional email verification via Resend (`RESEND_API_KEY`); off unless configured, and enforcement is opt-in (`REQUIRE_EMAIL_VERIFICATION`).
- **Tools** — an MCP tool call → EtsyOps checks the account's plan and monthly usage cap → calls the **Etsy Open API v3** for that seller's connected shop → returns the result. The Free monthly cap and the metering on `generate_listing_content` / `analyze_shop_performance` are enforced here, and the paid tools (`create_draft_listing`, `update_listing`, `analyze_reviews`) are unlocked based on the account's Stripe subscription. When `ETSY_KEYSTRING` isn't configured — or the current user hasn't connected a shop — the tools run in **demo mode** against the bundled sample shop and real accounts get a clear *"connect your Etsy shop"* message instead of fabricated data.
- **Data** — EtsyOps calls the Etsy Open API v3 (`https://openapi.etsy.com/v3/application`) with the app keystring (`x-api-key: <ETSY_KEYSTRING>`) plus the seller's `Authorization: Bearer <access token>`, scoped to `listings_r`, `listings_w`, `shops_r`, `transactions_r`, and `email_r`. It reads and writes **only the shop the seller connects**, only with their granted token — no other seller's data is ever touched. Subprocessors: Vercel (hosting), Supabase (accounts + transient job queue), Resend (one-time email verification), and Stripe (billing).

## Repository layout

```
server/    Vercel functions: OAuth + MCP endpoint + the 9 tools + Etsy client + Stripe billing   (deploy this)
kit/       Browser automations: register the dev-mode connector AND
           fill the OpenAI directory submission (see kit/README.md)
supabase/  schema.sql — accounts, plans, and monthly usage counters (self-hosting)
test/      end-to-end OAuth + MCP integration test
```

## Development

```bash
# server
cd server && cp .env.example .env.local   # fill in, then: vercel dev
# end-to-end test against a live deployment (reads ../.env.local)
node test/e2e-oauth.mjs
```

## Security & privacy

- EtsyOps reads and writes **only your own shop's data**, and only through the Etsy access token you grant when you connect your shop. It never touches another seller's shop, never sells your data, and never builds behavioral profiles. It stores only your login (email + hashed password), your connected shop id + OAuth token, usage counters, and plan status.
- **You stay in control of writes.** Content tools return drafts you review. `create_draft_listing` only adds a **draft** (never auto-published); `update_listing` makes the explicit change you asked for. The read / audit tools never modify your shop.
- The seller's Etsy access token and `ETSY_KEYSTRING` are **server-side secrets** — held in env / KV only, never exposed to the client, never leaving the relay. If `ETSY_KEYSTRING` is unset or you haven't connected a shop, EtsyOps runs in demo mode rather than fabricating results.
- Paid tiers are billed by **Stripe** outside the chat client — we store only plan status, never card numbers. The Free tier is fully functional.
- No secrets are committed; see [`.gitignore`](./.gitignore) and the `.env.example` files.

## License

[MIT](./LICENSE) © Isaiah Dupree · Dupree Ops LLC

EtsyOps is an independent tool operated by Dupree Ops LLC and is not affiliated with, endorsed by, or sponsored by Etsy, Inc. "Etsy" is a trademark of Etsy, Inc.
