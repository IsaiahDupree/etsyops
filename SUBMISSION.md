# EtsyOps — App Directory Submission Playbook

Everything needed to submit EtsyOps to the OpenAI app directory (apps SDK /
connector review), what's already done, and what only the account owner can do.

## Status: what's built and verified

| Requirement | Status | Proof |
|---|---|---|
| MCP server, streamable HTTP, OAuth 2.1 + PKCE + DCR | ✅ live | `https://etsyops.vercel.app/mcp`; e2e suite |
| Privacy policy | ✅ live | https://etsyops.vercel.app/privacy (accurate: Vercel + Supabase + Resend + Stripe subprocessors, plus the Etsy Open API v3 for the seller's own shop; stores only login + connected shop token + usage + plan; no data resale) |
| Support page | ✅ live | https://etsyops.vercel.app/support |
| Rate limiting on auth + OAuth endpoints | ✅ live | signup 5/10min, login 10/10min, authorize 30/10min, token 60/min, register 20/hr — 429 verified in e2e |
| **Reviewer demo mode** | ✅ live | Any account with email `reviewer@etsyops.demo` runs all 9 tools against a built-in **sample shop ("MapleAndMoss", 6 listings)** and is treated as **paid** — so `analyze_reviews`, `create_draft_listing`, and `update_listing` work too, 24/7 with **no Etsy backend configured**. Real accounts are unaffected. Verified in e2e (audit / content / performance / reviews / draft-reply / create-draft / update with no live shop). |
| **Stripe billing (Free / Seller / Growth / Agency)** | ✅ live | Free tier capped at 5 audit/content operations/month; paid plans (Seller $29, Growth $79, Agency $249) unlock create + update listings, review mining, listing experiments, multiple shops, and API access — gated by Stripe subscription (test mode). `get_plan` surfaces the plan + `/upgrade` link. When Stripe is unconfigured, every account is treated as paid. |
| Onboarding UX | ✅ live | Sign-in + plan picker + connect-your-shop + connector instructions at the root URL |
| 512×512 icon | ✅ | `assets/icon-512.png` |
| OAuth tool scan | ✅ live | Form "Scan Tools" completes the OAuth consent and discovers all 9 tools |
| Domain verification | ✅ live | `/.well-known/openai-apps-challenge` (`server/api/challenge.js`) — form shows "Domain verified" |
| Complete tool annotations | ✅ | All 9 tools declare readOnly/idempotent/openWorld hints; the two write tools (`create_draft_listing` = additive, `update_listing` = update) are annotated as writes, none delete or auto-publish (0 form warnings) |
| Full e2e suite | ✅ 22 green checks | `node test/e2e-oauth.mjs` |

## Steps only the account owner can do

*(Portal flow verified live 2026-07-17: the submission form is at
`platform.openai.com/plugins` → **Create plugin** → **With MCP**. It is gated by
identity verification — clicking Create plugin shows "Complete identity
verification — you need a verified developer identity before you can create or
upload a plugin." That check requires a government ID / selfie and can only be
done by you.)*

1. **Complete developer identity verification.** platform.openai.com → **Plugins**
   → **Create plugin** → **With MCP** → **Continue** on the "Complete identity
   verification" dialog, and finish the ID check (or do it up front at Settings →
   Organization → **Verifications**). Requires the Owner role. *(Note: the org
   already shows a base "Verified" status, but plugin creation needs this
   developer-identity tier on top of it.)*
2. **Keep the demo credentials handy** for the form:
   - Email: `reviewer@etsyops.demo`
   - Password: the `DEMO_PASSWORD` value in `.env.local` (already created &
     verified — do not rotate it after submitting; reviewers use it)
3. **Create the plugin & fill the form.** Back at Plugins → Create plugin →
   With MCP → Standard → Continue. The editor has **seven** sections, advanced
   by the bottom **Continue** button (not the top tabs). Verified end-to-end on
   the live portal 2026-07-17:

   1. **Info** — name, ≤30-char subtitle, description, Category + Developer
      Identity (custom comboboxes), author, Website/Support/Privacy/Terms URLs,
      Demo Recording URL (required — the hosted screen-recording link), two icon
      uploads. All paste-ready in **LISTING.md**.
   2. **MCP** — MCP Server URL `https://etsyops.vercel.app/mcp`;
      Authentication **OAuth** (auto-discovers config from our `/.well-known`
      metadata); **Domain verification** — the form issues a token you must
      serve at `/.well-known/openai-apps-challenge` (our `server/api/challenge.js`
      already does this) then click **Verify Domain**; **Scan Tools** — opens an
      "Authorize MCP" OAuth consent (sign in with the reviewer demo account,
      Allow) and then discovers all 9 tools; **Tool justification** — one line
      per annotation per tool (Read Only / Open World, plus the write annotation
      on `create_draft_listing` and `update_listing`) explaining why it's
      accurate.
   3. **Skills** — none; click **Skip**.
   4. **Prompts** — up to 3 showcase prompts (audit my shop and surface the worst
      listings / rewrite the SEO title and tags for a weak listing / summarize my
      revenue and fees over the last 30 days).
   5. **Testing** — reviewer demo credentials (email + `DEMO_PASSWORD`), exactly
      **5 positive** test cases (scenario / user prompt / tool / expected) and
      exactly **3 negative** test cases (scenario + prompt where the app should
      *not* trigger). The demo account is treated as paid, so the
      `analyze_reviews`, `create_draft_listing`, and `update_listing` cases all
      work.
   6. **Global** — English (US) translation is prefilled from Info; Allowed
      Countries = Allow all.
   7. **Submit** — Release Notes, then the policy-compliance checkboxes and the
      mature-content radio (**the account owner's legal attestations**), which
      enable **Submit for Review**.

## Directory listing copy

All paste-ready form values (name, tagline, description, URLs, demo credentials,
test prompts + expected responses, OAuth endpoints) live in **LISTING.md**.

*(Copy references "Etsy" descriptively / nominatively only; EtsyOps is an
independent tool operated by Dupree Ops LLC and the product name and branding
contain no third-party marks.)*

## Review risks & mitigations

- **Write actions / auto-publishing (the important one).** A tool that can create
  and update listings could be misread as changing a shop without consent.
  Mitigation: only the two paid write tools touch the shop — `create_draft_listing`
  is **additive** and only ever adds a **draft** (never auto-published), and
  `update_listing` makes the single explicit change the user asked for. Content
  tools return drafts the seller reviews; read / audit tools never write. This is
  stated in the description, the release notes, one negative test case, and the
  consent copy.
- **Demo mode / current state.** Live data requires the deployment to set
  `ETSY_KEYSTRING` (the registered Etsy app's keystring) and each seller to
  connect their own shop via Etsy OAuth. Until then EtsyOps runs in **demo mode**:
  the reviewer account answers against the bundled sample shop ("MapleAndMoss"),
  and accounts without a connected shop get a clear *"connect your Etsy shop"*
  message rather than fabricated numbers. The app is fully reviewable in this
  state, and going live is one config away. This is stated honestly in the listing
  and privacy copy.
- **Third-party trademark ("Etsy").** Used descriptively / nominatively only; no
  Etsy logos are used; the product name has no marks. EtsyOps is an independent
  tool operated by Dupree Ops LLC, not affiliated with, endorsed by, or sponsored
  by Etsy, Inc.
- **Data access.** EtsyOps accesses only the seller's **own** shop data, only with
  the OAuth token they grant (scopes `listings_r`, `listings_w`, `shops_r`,
  `transactions_r`, `email_r`), and only via the official Etsy Open API v3. It
  never touches another seller's shop and never bypasses Etsy's access controls.
  Documented in the privacy policy.
- **Latency.** A tool call round-trips to the Etsy Open API v3 (~1.5–4s typical).
  Within MCP norms; the server caps waits so nothing hangs.
- **Paid tier.** Paid plans are billed by Stripe outside ChatGPT; the Free tier is
  fully functional (audits + content, 5 operations/month) and the reviewer demo
  account is treated as paid so every tool is reviewable. `get_plan` discloses the
  current plan and the `/upgrade` link, and the description states the Free-vs-paid
  split up front.
- **Write tools are constrained.** Of the 9 tools, 7 are read-only; the two writes
  (`create_draft_listing`, `update_listing`) only add a draft or make one explicit
  update — nothing on the user's shop is deleted or auto-published.

## Fallback plan

If the directory review is rejected or slow: nothing is lost. The developer-mode
connector keeps working exactly as it does today for the owner and anyone who
creates an account on the dashboard, connects their Etsy shop, and adds the
connector in their MCP client — the submission only affects public discoverability.

## Automation

`kit/submit-plugin.mjs` drives the submission form in the agent Chrome (CDP :9222),
config-driven from `kit/submission.config.json`. It walks Create plugin → With MCP
→ Standard → the multi-section editor, fully automates the **App Info** section
(name, ≤30-char subtitle, description, Category + Developer Identity comboboxes,
author, all four URLs, icon uploads), fills later sections best-effort, detects
which required fields still block "Continue", and **stops before "Submit for review"**.

```bash
cd kit && npm install
node submit-plugin.mjs                                   # fill the form, stop before submit
DRAFT_URL="https://platform.openai.com/plugins/edit/..." \
  node submit-plugin.mjs                                 # resume an existing draft
SUBMIT=1 node submit-plugin.mjs                          # also click Submit for review
```

Two fields the script can only flag, not fill: **developer identity verification**
(step 1) and the **Demo Recording URL** (a hosted screen-recording of the connector
working — put it in `submission.config.json`). Full details + the companion
connector automation: **[kit/README.md](./kit/README.md)**.

## Re-verify before submitting

```bash
node test/e2e-oauth.mjs        # 22 checks, includes demo-mode + rate limits
curl -s https://etsyops.vercel.app/api/health   # jwtSecretSet true; etsyConfigured reflects demo vs live
```
