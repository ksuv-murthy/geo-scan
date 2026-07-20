# GEO Scan — Progress

Last updated: 2026-07-21

## What this is

AI visibility audit tool for Indian businesses. Checks whether a business gets
mentioned when real buyers ask ChatGPT, Gemini, Perplexity, and Claude
buyer-intent questions, plus an India-specific citation check (JustDial,
IndiaMART, Practo, Quora, Google Business). Drafts FAQ + schema fixes for the
gaps and can auto-publish them — WordPress, a hosted page we serve ourselves,
or copy-paste for anywhere else (Canva, Google Business Q&A, any site
builder).

Positioning: India-local GEO data + a fix/publish pipeline, not just another
AI-visibility scanner (that category is already crowded — Profound, Peec AI,
Otterly, Semrush's AI toolkit). Sold to both agencies/freelancers and
individual business owners, plug-and-play, ₹299 flat per scan, first scan
free per email.

**Stack:** Next.js (App Router) + Supabase (DB, auth, RLS) + Vercel (hosting)
+ Razorpay (payments, not yet live).

**Repo:** `github.com/ksuv-murthy/geo-scan`
**Source:** `M:\SEO - GEO\geo-scan-v1`
**Live:** Vercel deployment (see Vercel dashboard for current URL)

## Built and working

- **Landing page** — business form (name, domain, description, competitors),
  free AI-suggested test queries, ₹299 Razorpay checkout with first-scan-free
  logic per email.
- **Scan engine** (`lib/scan-engine.ts`) — parallelized checks across Claude,
  ChatGPT, Gemini, Perplexity; India citation-check (JustDial/IndiaMART/
  Practo/Quora/GMB via SerpApi); AI-written plain-language summary; drafted
  FAQ + JSON-LD schema fixes for the biggest visibility gaps. Models updated
  from the original prototype (gemini-2.0-flash was shut down June 2026 →
  gemini-2.5-flash; gpt-4o-mini deprecated → gpt-5.4-nano).
- **Report page** — score cards, full results table, citation footprint,
  AI summary + recommendations.
- **Auto-implementation (the core differentiator)** — "Fix everything"
  one-click button publishes every drafted fix automatically: to WordPress
  (as a draft, with a review link) if credentials are connected, otherwise
  falling back to a hosted page we serve ourselves (`/p/[slug]`). Individual
  per-fix publish buttons also available (WordPress / hosted page /
  copy-paste) for manual review. Publish results now show clickable links
  (WP draft edit link, live hosted-page URL).
- **Auth + dashboard** — email-only magic-link login (no passwords), scans
  auto-link to account on first sign-in, dashboard lists past scans.
- **Demo account support** — `DEMO_EMAILS` env var (comma-separated) gets
  unlimited free scans, no payment ever. Currently set to
  `ksuvmurthy@gmail.com`.
- **Supabase schema** (`supabase/schema.sql`) — `scans` + `publishes` tables,
  RLS policies, ready to run as one file.
- **Animated scan-in-progress state** — radar-sweep visual cycling through
  the four platforms plus rotating status lines, so a 20-40s wait doesn't
  read as frozen.

## Incidents fixed along the way (worth knowing about)

1. **Skeleton project mixup** — an unrelated generic Next.js scaffold got
   force-pushed over by mistake early on; resolved by rebuilding the real
   app from source and force-pushing the correct code to `main`.
2. **`[object Object]` error bug** — Supabase's `PostgrestError` isn't
   `instanceof Error`, so the old `err instanceof Error ? err.message :
   String(err)` pattern rendered raw DB errors as literally `[object
   Object]`. Fixed with a shared `lib/error-message.ts` helper, applied
   across all API routes.
3. **Supabase Data API table exposure** — `scans` and `publishes` were never
   toggled on under Supabase's Data API settings (Integrations → Data API →
   Exposed tables), which blocks all REST access regardless of RLS/service
   role key. This was the real cause of "permission denied for table scans."
4. **Scan hanging forever** — 32+ sequential AI platform calls (plus fix
   drafts, plus citation checks) could exceed Vercel's Hobby-plan function
   timeout. Fixed by parallelizing all the independent calls
   (`Promise.all`) and setting `export const maxDuration = 60` on
   `/api/scan/run`.

## Remaining / pending

- **Razorpay still in placeholder mode.** Business KYC pending; app runs in
  "payments not live" fallback (scan saved as draft, no checkout popup)
  without real `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Vercel.
- **Only `ANTHROPIC_API_KEY` confirmed configured.** `OPENAI_API_KEY`,
  `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, and `SERPAPI_KEY` still need to be
  added to Vercel env vars — without them those platform checks and the
  citation-check return errors/empty instead of real data.
- **No usage metering/caps yet.** Flagged since the original prototype's
  proxy worker comments — needed before opening this to paying users at
  real volume, so no single user (or bug) can run up the AI/SerpApi bill
  unbounded.
- **No admin/ops view.** Nothing yet for seeing all scans across users,
  revenue, error rates, etc.
- **Publish destinations are WordPress / hosted page / copy-paste only.**
  Broader options (Shopify, Wix, direct Canva API) discussed as future,
  not built.

## To pick this back up

1. Confirm which env vars are actually set in Vercel (Settings →
   Environment Variables) vs. what's listed in `.env.local.example`.
2. Decide next priority: finish wiring remaining AI keys, get Razorpay live,
   or build usage metering first.
3. Local dev: `npm install`, copy `.env.local.example` to `.env.local` and
   fill in keys, `npm run dev`.
