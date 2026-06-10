# Mortar Web — agency marketing site

A fast, framework-free marketing site for a web design + automation studio
(**mortarweb.com**), plus three polished demo sites. **No build step, no
dependencies** — open `index.html` in a browser, or deploy the folder to
Netlify/Vercel/GitHub Pages as static files. The main page loads **zero
third-party assets**: every visual (hero browser/phone mock-ups, the live
preview, portfolio thumbnails) is hand-drawn inline SVG/CSS, so first paint is
instant and nothing can break or track.

```
website-agency/
├── index.html          ← the marketing page (mockup generator, grader, chat, etc.)
├── 404.html            ← branded not-found page
├── styles.css          ← all styles (design tokens at the top)
├── script.js           ← nav, reveal, estimate, form, chat, dark-mode, builder
├── theme.js            ← sets light/dark before first paint (loaded in <head>)
├── favicon.svg         ← brand favicon (ember "M" badge)
├── logo.svg            ← full wordmark, for proposals/invoices/social
├── og-image.png        ← social-share image (1200×630 PNG, used by OG/Twitter)
├── og-image.svg        ← vector source for the share image (edit, then re-export)
├── _headers            ← security headers for Netlify
├── vercel.json         ← security headers for Vercel
├── robots.txt          ← crawl rules (search + AI crawlers explicitly welcomed)
├── llms.txt            ← AI-assistant summary of the business (answer-engine SEO)
├── sitemap.xml         ← sitemap (indexable pages only)
├── fonts/              ← self-hosted Space Grotesk: fonts.css + 4 .woff2 files
├── assets/             ← founder.webp + any other real photos
├── blog/               ← SEO blog: index + 3 articles (BlogPosting schema)
├── legal/              ← privacy.html · terms.html · accessibility.html
└── demos/              ← contractor.html · restaurant.html · salon.html
```

> **Dark mode** is built in (toggle in the nav, ☾/☀). It remembers the choice
> and respects the OS setting. Colours are driven by `--bg`/`--surface`/`--text`
> in `styles.css`; a `:root[data-theme="dark"]` block remaps them.
>
> **Self-hosted font:** the agency pages load Space Grotesk locally (no Google
> Fonts call) — the 4 `.woff2` weights (400/500/600/700) live in `/fonts` and
> the three most-used weights are preloaded for a fast first paint.
> (The demo pages still use Google Fonts for their own typefaces.)
>
> **Legal pages** are professional templates, not legal advice — have a lawyer
> review `legal/terms.html` and `legal/privacy.html` before you rely on them.
>
> **AI assistant:** the chat widget's knowledge base is the `KB` array in
> `script.js`. It answers from your info and routes to a quote/call — no API key.
> To make it a live generative LLM, point `respond()` at your own serverless
> endpoint that holds the API key (never put keys in the front end).

## 1. Lead form — already works on Netlify, never loses a lead

The form is wired for **Netlify Forms out of the box** (`data-netlify="true"` +
a hidden `form-name`). If you deploy to Netlify (drag-and-drop or Git import),
submissions show up under **Site → Forms** with **zero configuration**.

- **Prefer Formspree?** Create a free form at <https://formspree.io> and set the
  form `action` (search `FORM DELIVERY` in `index.html`) to
  `https://formspree.io/f/YOUR_ID`. The JS auto-detects Formspree and switches.
- **Any other host (Vercel, GitHub Pages, etc.)?** Netlify Forms won't capture
  there, so wire Formspree as above — or rely on the built-in fallback below.

> **No lead is ever silently lost.** If the form can't deliver automatically
> (unconfigured host, or a network error), the visitor is shown a one-tap
> **"Email my request instead"** button with every field pre-filled into a
> `mailto:` to `hello@mortarweb.com`. Keep that inbox monitored.

> No API keys belong in the front end — providers use a public endpoint id, not a
> secret. The form already has validation, length caps, a honeypot and a throttle.

## 2. Make it yours

- **Copy** is plain text in `index.html` — search and edit.
- **Business details:** search for `414-687-8929`, `hello@mortarweb.com`,
  `Milwaukee`, and `Abbas` (founder section).
- **Booking link:** the founder section's "Book a free 15-min call" button
  currently points to `#contact` (the quote form) so it never 404s. When your
  scheduler is live, search `REPLACE href with your Calendly` in `index.html`
  and swap in your Calendly/Cal.com URL.
- **Founder photo:** installed as **`assets/founder.webp`** (a studio headshot),
  center-cropped to a square via CSS `object-fit: cover`. To replace it, drop in
  a new `assets/founder.webp` and the founder section updates automatically.
- **Colours & shape** are CSS design tokens at the top of `styles.css`
  (`:root`): `--accent` / `--grad-accent` re-skin buttons, dots and links in
  one place.
- **Interactive widgets:** the **live mockup generator** (`#try`) reads its
  industry list from the `TYPES` object in `script.js` and its colour themes
  from the `[data-industry=…]` block in `styles.css`; the **website grader**
  (`#grader`) has its questions in `index.html` and verdict text in `script.js`.
- **Pricing / estimate:** tier prices are in the Pricing section of `index.html`
  *and* in the JSON-LD offer catalog in `<head>` — keep them in sync. The
  estimate widget reads base prices from the `BASE` object in `script.js` and
  each add-on from `data-once`/`data-mo` on its checkbox.
- **Reviews:** the three testimonials use generic role attributions — swap in
  real client names/businesses as reviews come in (search `Swap these in`).
- **Demo pages** use hand-drawn CSS/SVG artwork (no stock photos) — drop in
  real project photos whenever you have them. Their only external dependency
  is Google Fonts, allowed by the `/demos/` CSP in `_headers` / `vercel.json`.

## 3. SEO — what's wired in

- **Entity-consistent branding:** Mortar Web everywhere — title, schema,
  manifest, OG image — matching the mortarweb.com domain and email.
- **Structured data** on the home page: `ProfessionalService` (with geo, areas
  served, hours, priced `OfferCatalog`), `WebSite`, `WebPage`, and a 7-question
  `FAQPage`. Blog posts ship `BlogPosting` + `BreadcrumbList`.
- **llms.txt** + a permissive `robots.txt` that explicitly welcomes the AI
  search/assistant crawlers (GPTBot, OAI-SearchBot, ClaudeBot & friends) — AI
  answers are a growing source of "who builds websites near me" referrals.
- **Core Web Vitals:** no third-party requests on the main page, preloaded
  fonts, inline-SVG hero (text LCP), lazy-loaded founder photo.
- **After deploy:** verify the domain in Google Search Console + Bing Webmaster
  Tools, submit `sitemap.xml`, and create the Google Business Profile —
  that's the single biggest local-SEO lever.

## 4. Deploy free

- **Netlify:** drag the folder onto <https://app.netlify.com/drop>, or import the
  repo (no build command, publish directory = repo root). `_headers` applies.
- **Vercel:** import the repo, framework preset **Other**, no build. `vercel.json` applies.
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `/ (root)`.

## Security

- No `eval`, no `innerHTML`, no inline event handlers, no third-party trackers.
- Strict, per-path **CSP** plus `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS and COOP (in `_headers` /
  `vercel.json`). The main page CSP allows only same-origin assets and your
  Formspree endpoint — there are no other hosts to allow.
- Form hardened (validation, length caps, honeypot, throttle); real spam
  filtering happens at your form provider.

## Accessibility & performance

- Loads instantly — static HTML/CSS/JS, no framework, no build, no third-party
  requests on the agency pages.
- Semantic landmarks, labelled controls, visible focus states, AA contrast, and
  `prefers-reduced-motion` honoured (animations and shimmer disable cleanly).
- Works with JavaScript disabled: the page reads fine, the FAQ opens (native
  `<details>`), and the form still posts to your endpoint.
