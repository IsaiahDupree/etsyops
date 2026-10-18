# EtsyOps — paste-ready submission answers

Fill the OpenAI plugin submission form (platform.openai.com/plugins → **Create
plugin** → **With MCP**) with the values below. Fields verified against the live
portal on 2026-07-17. Requires developer identity verification first (see
SUBMISSION.md).

---

## Connection

| Field | Value |
|---|---|
| MCP Server URL | `https://etsyops.vercel.app/mcp` |
| Authentication | OAuth |
| OAuth — the portal auto-discovers these from the URL's `/.well-known` metadata | authorization: `https://etsyops.vercel.app/oauth/authorize` · token: `https://etsyops.vercel.app/api/oauth/token` · registration (DCR): `https://etsyops.vercel.app/api/oauth/register` · PKCE S256 · scope `research` |

After entering the URL, click **Scan Tools** — it should discover all 9 tools.

## Listing (App Info section — exact fields on the live form)

| Field | Value |
|---|---|
| **Name** | EtsyOps |
| **Subtitle** ⚠️ ≤30 chars | `Audit & grow your Etsy shop` |
| **Category** | Developer Tools |
| **Developer Identity** | Business — Dupree Ops LLC *(the verified identity; requires ID verification first)* |
| **Plugin Author** | Isaiah Dupree |
| **Website URL** | `https://etsyops.vercel.app` |
| **Customer support URL** | `https://etsyops.vercel.app/support` |
| **Privacy policy URL** | `https://etsyops.vercel.app/privacy` |
| **Terms of Service URL** | `https://etsyops.vercel.app/terms` |
| **Demo Recording URL** ⚠️ required | *(a hosted screen-recording of the connector working — you must record this)* |
| **Directory icon / composer icon** | `assets/icon-512.png` (512×512 PNG) |
| **Commerce & Purchasing** | leave unchecked — paid plans are billed externally by Stripe, not through ChatGPT |

**Description:**
> EtsyOps is your AI Etsy shop operator. It audits your listings — views, favorites, sales, revenue, SEO score, and the exact issues holding each one back — generates SEO-ready titles (up to 140 chars), 13 tags, descriptions, and image alt-text you review before anything goes live, analyzes your shop's revenue, fees, and best/worst sellers, mines your reviews into recurring complaint and request themes, and drafts on-brand replies to customers. On paid plans it can create draft listings and update existing ones on your behalf — all over the official **Etsy Open API v3**, and only for the shop you connect via OAuth. Ask it to audit your shop and surface your worst-performing listings, rewrite the SEO for a weak one, summarize last month's revenue and fees, tell you what buyers complain about, or draft a customer reply. **Free** covers 5 audit/content operations a month (listing audits, `get_listing`, `draft_customer_reply`, and metered content + performance); **paid plans (Seller $29/mo, Growth $79/mo, Agency $249/mo, billed by Stripe)** add create + update listings, review mining, listing experiments, multiple shops, and API access — run `get_plan` any time to see your plan and upgrade link. EtsyOps reads and writes only your own connected shop's data through your granted Etsy token, never sells your data, and never builds behavioral profiles. You stay in control: content tools return drafts you review, `create_draft_listing` only adds a draft (never auto-published), and `update_listing` makes the explicit change you asked for. Fully hosted; no desktop app to install.

*These values are also encoded in [`kit/submission.config.json`](./kit/submission.config.json), which `kit/submit-plugin.mjs` fills automatically.*

## Demo / reviewer account (no MFA)

> EtsyOps is a hosted, cloud connector — there is nothing to install. For review,
> sign in with the account below. It runs every tool against a built-in
> **sample shop** and is treated as **paid**, so all 9 tools (including the
> paid-only `analyze_reviews`, `create_draft_listing`, and `update_listing`)
> work 24/7 with **no Etsy backend configured** (demo mode). The sample shop
> **"MapleAndMoss"** has 6 listings — a hand-poured soy candle, a digital wedding
> invitation template, a custom watercolor pet portrait, a deliberately weak
> **"Ceramic Coffee Mug"** (SEO **31**, only 3 of 13 tags — the one the audit
> flags), a 2026 digital planner draft, and an expired macramé wall hanging with
> latent demand. Reviewers can run every tool against it with no Etsy connection.

- Email: `reviewer@etsyops.demo`
- Password: *(the `DEMO_PASSWORD` value in `.env.local` — paste it here at submission)*

## Test prompts & expected responses

Sign in as the reviewer account (it's treated as paid, so every tool works), add
the connector via OAuth, then run this end-to-end flow against the sample shop.
It exercises the audit → fix → analyze → write loop.

### Positive test cases (5)

1. **"Audit my Etsy shop and show my worst-performing listings."** → `search_shop_listings` (`underperforming: true`) →
   `{ "listings": [ { "listing_id": 4001, "title": "Ceramic Coffee Mug", "views": 120, "favorites": 3, "sales": 1, "seo_score": 31, "issues": ["only 3 of 13 tags used", "title missing key search terms", "description too short"] } ] }`
2. **"Show the full detail and issues for the Ceramic Coffee Mug listing."** → `get_listing` (`4001`) →
   `{ "listing_id": 4001, "title": "Ceramic Coffee Mug", "price": 18.0, "tags": ["mug", "ceramic", "coffee"], "seo_score": 31, "issues": ["only 3 of 13 tags used", "no long-tail keywords", "generic title"] }`
3. **"Rewrite the SEO title and tags for the Ceramic Coffee Mug, then update the listing."** → `generate_listing_content` (`4001`) then `update_listing` (`4001`, **paid**) →
   `{ "title": "Handmade Ceramic Coffee Mug — Rustic Stoneware Cup, 12oz Speckled Glaze, Cozy Coffee Lover Gift", "tags": ["ceramic mug", "coffee mug", "handmade mug", "stoneware mug", "rustic mug", "speckled glaze", "12oz mug", "tea cup", "pottery mug", "coffee lover gift", "housewarming gift", "cozy kitchen", "artisan ceramics"], "image_alt_text": "Speckled stoneware ceramic coffee mug on a wooden table" }` followed by `{ "updated": true, "listing_id": 4001, "seo_score": 88 }`
4. **"What are buyers complaining about in my reviews?"** → `analyze_reviews` (**paid**) →
   `{ "clusters": [ { "theme": "shipping slower than expected", "mentions": 12, "severity": "medium", "type": "complaint", "affected_listings": [4002], "recommended_fix": "raise processing time in the listing so it's set correctly" }, { "theme": "requests for gift wrapping", "mentions": 7, "severity": "low", "type": "feature_request", "affected_listings": [4000] } ] }`
5. **"Summarize my shop's revenue and fees over the last 30 days, then create a draft listing for a hand-poured soy candle at $24."** → `analyze_shop_performance` then `create_draft_listing` (**paid**) →
   `{ "revenue": 1840.0, "orders": 61, "estimated_fees": 178.4, "net": 1661.6, "avg_order_value": 30.16, "best_sellers": [4000], "underperformers": [4001], "recommendations": ["fix the SEO on Ceramic Coffee Mug", "reactivate the expired macramé wall hanging"] }` followed by `{ "created": true, "listing_id": 4005, "state": "draft", "title": "Hand-Poured Soy Candle", "price": 24.0 }`

Finally, **"What plan am I on?"** → `get_plan` → returns the current plan (**paid**
for the demo account) and the upgrade link, confirming the Free-vs-paid gating.

## Negative test cases (exactly 3 — prompts where EtsyOps should NOT trigger)

1. **Abstract question with no shop to operate on** — *"Should I start an Etsy
   shop?"* — EtsyOps operates on a *connected* shop's real listings and metrics;
   it does not give generic business advice out of thin air.
2. **A different marketplace** — *"Optimize my Shopify / Amazon product SEO."* —
   EtsyOps works only through the Etsy Open API v3 against the Etsy shop you
   connect; it has no access to other platforms.
3. **A bulk destructive action** — *"Delete every listing in my shop right now."* —
   EtsyOps has no delete or auto-publish capability; its write tools only add a
   draft listing (`create_draft_listing`) or make a single explicit update you
   ask for (`update_listing`).

## Free vs. paid & the "you stay in control" guardrail

- **Free** = 5 audit/content operations / month (`search_shop_listings`,
  `get_listing`, `draft_customer_reply`, and metered `generate_listing_content` /
  `analyze_shop_performance`). **Seller $29/mo**, **Growth $79/mo**, and **Agency
  $249/mo** (all Stripe) unlock `create_draft_listing`, `update_listing`,
  `analyze_reviews`, unlimited audits & content, listing experiments, multiple
  shops, and API access. The reviewer demo account is treated as paid so all 9
  tools are reviewable with no backend.
- **You stay in control of writes.** Content tools return drafts you review.
  `create_draft_listing` only ever adds a **draft** (never auto-published) and
  `update_listing` makes the single explicit change you asked for. The read /
  audit tools never modify your shop, and EtsyOps only ever touches the one shop
  you connect via OAuth.

## Release notes (first release)

> Initial release. EtsyOps is a hosted MCP connector — your AI Etsy shop
> operator. It audits your listings (views, favorites, sales, revenue, SEO score,
> detected issues), generates SEO-ready titles, tags, descriptions, and alt-text
> you review, analyzes your shop's revenue and fees, mines your reviews into
> recurring themes, and drafts customer replies — all over the official Etsy Open
> API v3 for the shop you connect via OAuth. Free to start (audits + content —
> 5 operations/month); paid plans (Seller $29/mo, Growth $79/mo, Agency $249/mo
> via Stripe) add create + update listings, review mining, listing experiments,
> multiple shops, and API access. Reads and writes only your own connected shop's
> data; never sells data. You stay in control — content tools return drafts, and
> nothing is auto-published. No desktop app to install.

## Tools declared (9)

`search_shop_listings`, `get_listing`, `generate_listing_content`,
`analyze_shop_performance`, `analyze_reviews` (paid), `draft_customer_reply`,
`create_draft_listing` (paid), `update_listing` (paid), `get_plan`. Seven are
**read-only** (they read your shop and return drafts/reports, never writing to
Etsy); the two write tools are annotated accordingly — `create_draft_listing` is
**additive** (creates a draft, never auto-published) and `update_listing` is an
**update** of a listing you specify. No tool deletes or auto-publishes.
`analyze_reviews`, `create_draft_listing`, and `update_listing` require a paid
subscription; the reviewer demo account is treated as paid so all three work.
