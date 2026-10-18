# Security Policy

Thanks for helping keep EtsyOps and its users safe.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Email **isaiahdupree33@gmail.com** with subject `EtsyOps security: <short summary>`, or
- Use GitHub's [private vulnerability reporting](https://github.com/IsaiahDupree/etsyops/security/advisories/new).

Include: affected component, a clear description, reproduction steps / PoC, and the impact you believe it has. We aim to acknowledge within 3 business days and to keep you updated through remediation. Please give us reasonable time to fix before any public disclosure. There is no paid bounty, but we're glad to credit reporters in the changelog.

## Scope

**In scope**
- The hosted relay: `https://etsyops.vercel.app` (OAuth, token, MCP, and billing endpoints).
- This repository's code: `server/`, `kit/`.

**Out of scope**
- Denial-of-service / volumetric attacks (the endpoints are rate-limited; please don't stress-test production).
- Social engineering, spam, or issues in third-party infrastructure we don't control (Vercel, Supabase, Resend, Stripe, the Etsy Open API v3, and OpenAI).
- Self-XSS or issues only exploitable against your own account.

## Design details relevant to security

- **We store only what's needed to operate your shop.** EtsyOps is a shop-operator connector: it queries the Etsy Open API v3 for your connected shop on demand and returns the results. The server persists only your account / auth records (email + hashed password), your connected shop id + Etsy OAuth token, usage counters, and subscription plan — it does not store your listings, orders, messages, or reviews, and never sells data or builds behavioral profiles. EtsyOps is a cloud service with no local agent and no device pairing.
- **Most tools are read-only; two are gated writes.** Seven of the tools (`search_shop_listings`, `get_listing`, `generate_listing_content`, `analyze_shop_performance`, `analyze_reviews`, `draft_customer_reply`, `get_plan`) only read your shop data and compute over it — content tools return drafts, not published changes. The two write tools — `create_draft_listing` (additive; creates a **draft**, never auto-published) and `update_listing` (updates a listing you specify) — are the only ones that change your shop, are paid-gated, and never delete or auto-publish. There is no money movement in the tools (billing is via Stripe, outside them).
- **Shop data comes from the official Etsy Open API v3.** EtsyOps calls `https://openapi.etsy.com/v3/application` with the app keystring (`x-api-key`) plus the seller's OAuth token, scoped to `listings_r`, `listings_w`, `shops_r`, `transactions_r`, and `email_r`. It only ever accesses the shop the seller connects, only with their granted token; it never touches another seller's shop and never bypasses Etsy's access controls, authentication, or rate limits.
- **Etsy secrets.** The app keystring (`ETSY_KEYSTRING`, the `x-api-key`) and each seller's Etsy access token are server-side secrets held in environment variables / KV only (`etsy:token:<userId>`, `etsy:shop:<userId>`, `etsy:refresh:<userId>`). They are never exposed to the client and never leave the relay. If `ETSY_KEYSTRING` is unset — or the current user hasn't connected a shop — the relay runs in demo mode rather than fabricating results.
- **Billing.** The relay stores the user's plan / subscription status (Free / Seller / Growth / Agency) so it can gate tools and caps server-side. Payment is handled by **Stripe** — no card data ever touches our servers.
- **Token model.** JWTs are HMAC-SHA256 signed with a server-only `JWT_SECRET`. Distinct kinds — `session` (dashboard) and `mcp` (the connected assistant's access token) — and each protected endpoint checks the required kind.
- **OAuth.** Authorization Code + PKCE (S256 required) with Dynamic Client Registration (RFC 7591). Authorization codes are single-use; `redirect_uri` must match a value the client registered.
- **Isolation.** Requests and any transient job state are keyed per user; one account never sees another's, and a seller's tools only ever reach their own connected shop. The reviewer demo account operates on an isolated server-side sample shop.
- **Secrets** are never committed; configuration lives in environment variables (see `server/.env.example`).

## Known limitations / accepted residual risk

These are understood trade-offs, not undiscovered bugs — documented for transparency:

- **Access tokens are long-lived but revocable.** Each carries a per-client id (`jti`) and the user's revocation epoch; a user can revoke one client (deletes its `jti`) or invalidate every outstanding token at once (bumps the epoch, invalidating everything outstanding). Revoked tokens are rejected on their next request. This per-device revocation machinery is inherited from the relay scaffold; because EtsyOps has no local agent, device pairing is currently dormant.
- **Refresh tokens rotate on use but there is no reuse-family detection** (RFC 9700). A stolen-and-used refresh token hijacks the chain; the victim's next refresh then fails, surfacing the compromise.
- **Open Dynamic Client Registration** (required by MCP clients like ChatGPT) means any party can register a client; the consent screen shows the redirect host so users can spot a client that isn't first-party. This is standard OAuth and requires user interaction to abuse.
- **Fixed-window rate limiting** permits up to ~2× the nominal limit across a window boundary. Acceptable for the abuse-prevention it provides.

## Hardening review

The auth/OAuth and relay surfaces were reviewed for: JWT forgery/alg-confusion (mitigated — HMAC-only, signature always required), PKCE downgrade/replay (S256 enforced, codes single-use), open redirect (redirect_uri exact-matched), cross-user token minting and isolation (per-user keys, kind-scoped tokens, ownership checked on results, a seller's tools scoped to their own shop), SQLi (parameterized RPCs), SSRF (fixed external endpoint — the Etsy Open API v3 base), and rate-limit spoofing (client IP taken from the platform's trusted headers — the rightmost, closest hop — not the client-controlled leftmost `X-Forwarded-For`).

If you're unsure whether something is in scope, email us and ask — we'd rather hear about it.
