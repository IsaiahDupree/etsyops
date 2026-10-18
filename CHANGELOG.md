# Changelog

All notable changes to EtsyOps — the hosted AI Etsy shop-operator connector and
its Stripe-billed plans.

## [Unreleased]

### Changed
- **Forked the EtsyOps connector from the SecondBrainBridge relay scaffold — a
  cloud AI shop-operator SaaS (no Mac agent); wired to the Etsy Open API v3.**
  EtsyOps keeps the scaffold's OAuth 2.1 (PKCE + DCR) relay and Stripe billing but
  drops any local agent: the flow is ChatGPT / Claude / Codex → EtsyOps relay
  (Vercel) → Etsy Open API v3 for the seller's connected shop. It now serves nine
  tools: `search_shop_listings`, `get_listing`, `generate_listing_content`,
  `analyze_shop_performance`, `analyze_reviews` (paid), `draft_customer_reply`,
  `create_draft_listing` (paid, write), `update_listing` (paid, write), and
  `get_plan`.

### Added
- **Free / Seller / Growth / Agency tiers.** Free allows 5 audit/content
  operations/mo. Seller ($29/mo) adds create + update listings and unlimited
  audits & content; Growth ($79/mo) adds review mining (`analyze_reviews`) and
  listing experiments; Agency ($249/mo) adds multiple shops and API access. Plans
  are billed via Stripe; gating happens server-side from the plan stored in the
  relay.
- **Live shop data via the Etsy Open API v3.** When `ETSY_KEYSTRING` is set and
  the seller has connected their shop via Etsy OAuth (storing their
  `etsy:token:<userId>` / `etsy:shop:<userId>`), the tools query that live shop.
  Without them the relay runs in demo mode — the reviewer account gets the sample
  shop ("MapleAndMoss"), and accounts without a connected shop get an honest
  "connect your Etsy shop" notice instead of fabricated results.
- **Listing write tools.** `create_draft_listing` (paid) creates a new **draft**
  listing (additive, never auto-published) and `update_listing` (paid) updates a
  listing's title, price, tags, quantity, description, or state. Guardrail:
  content tools return drafts the seller reviews, and no tool auto-publishes.

## [1.3.0] — 2026-07-17

### Added
- **Connector token revocation.** Access tokens now carry a per-client id
  (`jti`) and a per-user revocation epoch. A dashboard card lists connected
  clients and lets you revoke one or invalidate every outstanding token at once.
  Endpoints: `GET /api/agent/devices`, `POST /api/agent/revoke`.

### Security
- Protected endpoints reject revoked tokens on the next request; legacy tokens
  (pre-1.3) are grandfathered until re-issued.

## [1.2.0] — 2026-07-17

### Added
- **Push-based relay path.** The relay streams the Etsy Open API results back the
  instant a query resolves, keeping round-trip overhead low.
- **Shop read & audit tools.** `search_shop_listings`, `get_listing`,
  `generate_listing_content`, and `analyze_shop_performance` return structured
  results (audited listings with SEO scores and issues, full listing detail,
  draft SEO content, and revenue/fees/best-seller summaries) to the connected
  assistant.
- **Email verification** via Resend (soft by default; opt-in enforcement via
  `REQUIRE_EMAIL_VERIFICATION`). `/verify`, `/api/resend-verification`, `/api/me`.
- Reviewer **demo mode** — the `reviewer@…` account exercises all tools against a
  server-side sample shop with no live Etsy connection.
- **Rate limiting** on all auth/OAuth endpoints. Privacy & support pages.

### Security
- Adversarial auth + relay review; fixes: rate-limit IP no longer trusts the
  spoofable leftmost `X-Forwarded-For` (it takes the rightmost, closest hop);
  `JWT_SECRET` fails closed in production; login normalization + timing
  equalization; ownership check on results; atomic rate-limit TTL;
  password-length cap; `PUBLIC_BASE_URL` host pinning. See
  [SECURITY.md](./SECURITY.md).

### Added (project)
- Server unit tests, GitHub Actions CI, SECURITY.md.

## [1.1.0] — 2026-07-15

### Changed
- Storage moved from Upstash Redis to a Redis-shaped surface on Supabase
  Postgres. `JWT_SECRET` support.

## [1.0.0] — 2026-07-15

### Added
- Initial release of the relay scaffold: OAuth 2.1 + PKCE + DCR,
  streamable-HTTP MCP endpoint, job relay, and Supabase-backed storage for
  accounts and plans.

Releases: https://github.com/IsaiahDupree/etsyops/releases
