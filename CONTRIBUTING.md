# Contributing to EtsyOps

Thanks for your interest! EtsyOps is two small pieces — the Vercel relay
(`server/`) and the connector kit (`kit/`). It is a cloud service with no local
agent: the relay speaks OAuth 2.1 + MCP to ChatGPT / Claude / Codex and proxies
audit, content, and (on paid plans) listing-write calls to the Etsy Open API v3
for the seller's connected shop.
Contributions of any size are welcome.

## Getting set up

```bash
git clone https://github.com/IsaiahDupree/etsyops
cd etsyops

# server (relay)
cd server && cp .env.example .env.local   # fill in Supabase + JWT_SECRET
                                          # (+ ETSY_KEYSTRING for live Etsy data)
npm install                                # for local tests
node --test test-server-unit.mjs           # runs in-memory (no live DB needed)
```

The unit tests are the fast inner loop; run them before opening a PR. The
end-to-end test (`test/e2e-oauth.mjs`) runs against a live deployment and reads
`.env.local` — you only need it if you're changing the OAuth/MCP flow. Without
`ETSY_KEYSTRING` (or before a shop is connected) the relay runs in demo mode, so
most tool work can be done against the built-in sample shop with no live Etsy
connection.

## Guidelines

- **Match the surrounding style.** No formatter is enforced; keep the existing
  two-space indent and sparse, constraint-explaining comments.
- **No secrets in the repo.** Configuration lives in environment variables
  (`.env.example` documents them); `.env.local` is gitignored. The Etsy app
  keystring (`ETSY_KEYSTRING`, the `x-api-key`) is a server-side secret — it stays
  in env only, and each seller's Etsy token (`etsy:token:<userId>`) lives in KV.
  Neither is ever sent to the client or lands in the repo.
- **Keep writes deliberate and gated.** The read / audit / draft tools stay
  read-only against Etsy. The two write tools (`create_draft_listing`,
  `update_listing`) must stay paid-gated, add-a-draft / explicit-update only, and
  must never auto-publish or delete. Don't add new writes, money movement, or
  store-side actions without a security review.
- **Respect the "you stay in control" guardrail.** Content tools return drafts the
  seller reviews; nothing is published without the seller, and EtsyOps only ever
  touches the one shop the seller connects via OAuth.
- **Add or update tests** for behavior changes; keep CI green (syntax check +
  the server unit suite run on every push).
- **Security-sensitive changes** (auth, tokens, billing/plan gating, the
  `ETSY_KEYSTRING` / seller-token handling, the relay's isolation) deserve extra
  care — see [SECURITY.md](./SECURITY.md). Report vulnerabilities privately, don't
  open a public issue.

## Pull requests

Keep PRs focused, describe what changed and why, and flag anything you couldn't
test. By contributing you agree your work is licensed under the repository's
[MIT License](./LICENSE).
