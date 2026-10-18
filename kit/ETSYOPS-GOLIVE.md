# EtsyOps go-live runbook

Every remaining step from "deployed in demo mode" to "live + submitted", with the
browser automation that drives each one. All scripts use the persistent
**chrome-bridge agent Chrome** (CDP `127.0.0.1:9222`), screenshot every step to
`kit/screenshots/`, and **leave every legal attestation + final Submit to you**.

```bash
cd kit && npm install          # puppeteer-core
```

Current state: **https://etsyops.vercel.app** is live in **demo mode**
(`/api/health` → `etsyConfigured:false`). Reviewers can already exercise all 9
tools against the sample shop. The steps below add live shop data and submit to
the OpenAI directory.

---

## 1 — Register the Etsy app + callback  → `npm run etsy-app`

Drives `developers.etsy.com`: waits for you to sign in, reads your app's
**keystring**, and registers the OAuth callback
`https://etsyops.vercel.app/etsy/callback` (scopes `listings_r listings_w
shops_r transactions_r email_r`). The keystring is saved to `../.env.local`
(gitignored, masked in output). If you have no app yet, it prints exactly what to
create.

Then flip the deployment out of demo mode:

```bash
cd ../server
vercel env add ETSY_KEYSTRING production      # paste the keystring from .env.local
vercel --prod --yes
curl -s https://etsyops.vercel.app/api/health # → "etsyConfigured": true
```

## 2 — Connect a shop + verify live data  → `npm run connect-shop`

Signs in to the EtsyOps account, starts `/etsy/connect`, opens Etsy's consent
screen in the agent Chrome (sign in as the shop owner if prompted), clicks
**Allow**, and polls `/etsy/status` until the shop is connected — printing the
`shop_id`. Uses `DEMO_EMAIL`/`DEMO_PASSWORD` from `../.env.local`, or
`SELLER_EMAIL=… SELLER_PASSWORD=…`. This is the end-to-end proof the live path
works.

## 3 — Register the dev-mode connector (optional, for the demo)  → `npm run register`

Adds EtsyOps as a developer-mode connector in your own ChatGPT (OAuth → Allow),
so you can drive it in a real chat for the recording. `npm run preflight` does a
health + login check only.

## 4 — Record the demo video  → `npm run record`

Opens a fresh ChatGPT chat and runs the EtsyOps demo arc against your connected
shop (or the demo shop): audit → rewrite SEO → update listing → shop performance
→ reviews. Produces a screen recording for the submission.

## 5 — Upload the video + set the URL  → `npm run upload`

Uploads the recording to YouTube (Unlisted). Put the resulting URL in
`kit/etsyops.openai.config.json` → `info.demoRecordingUrl` (currently `PENDING`).

## 6 — Submit to the OpenAI directory  → `npm run submit`

Fills the 7-section directory form at `platform.openai.com` from
`etsyops.openai.config.json` (MCP URL, listing copy, reviewer demo creds from
`../.env.local`, 3 prompts, 5 positive + 3 negative test cases) and **stops
before "Submit for review"**. Follow the field map in
[`SUBMIT-FLOW.md`](./SUBMIT-FLOW.md); the identity dropdown + the policy
attestations are yours to click.

---

### Preconditions checklist
- [ ] `../.env.local` has `DEMO_EMAIL` + `DEMO_PASSWORD` (for connect-shop / submit).
- [ ] Agent Chrome logged in to Etsy (step 1–2) and platform.openai.com (step 6).
- [ ] `info.demoRecordingUrl` set before step 6 (OpenAI requires the video).
- [ ] Domain-verification token served: set `OPENAI_APPS_CHALLENGE` on Vercel when
      the MCP section issues it, redeploy, then click Verify Domain.
