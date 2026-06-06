# Main Street Web — agency marketing site

A fast, framework-free marketing site for a web + AI-automation studio, plus
three polished demo sites. **No build step, no dependencies** — open
`index.html` in a browser, or deploy the folder to Netlify/Vercel/GitHub Pages
as static files. It loads instantly (there's no app to boot), and images fade in
behind tasteful skeleton-shimmer placeholders.

```
website-agency/
├── index.html          ← the marketing page (mockup generator, grader, chat, etc.)
├── 404.html            ← branded not-found page
├── styles.css          ← all styles
├── script.js           ← nav, reveal, estimate, form, chat, dark-mode, image loaders
├── theme.js            ← sets light/dark before first paint (loaded in <head>)
├── favicon.svg         ← brand favicon
├── og-image.png        ← social-share image (1200×630 PNG, used by OG/Twitter)
├── og-image.svg        ← vector source for the share image (edit, then re-export)
├── _headers            ← security headers for Netlify
├── vercel.json         ← security headers for Vercel
├── robots.txt          ← crawl rules
├── sitemap.xml         ← sitemap
├── fonts/              ← self-hosted font: fonts.css + your 4 .woff2 files
├── assets/             ← founder.webp (installed) + any other real photos
├── blog/               ← SEO blog: index + 3 articles (BlogPosting schema)
├── legal/              ← privacy.html · terms.html · accessibility.html
└── demos/              ← contractor.html · restaurant.html · salon.html
```

> **Dark mode** is built in (toggle in the nav, ☾/☀). It remembers the choice
> and respects the OS setting. Colours are driven by `--bg`/`--surface`/`--text`
> in `styles.css`; a `:root[data-theme="dark"]` block remaps them.
>
> **Self-hosted font:** the agency pages load Space Grotesk locally (no Google
> Fonts call) — the 4 `.woff2` weights (400/500/600/700) are installed in
> `/fonts` and the two most-used weights are preloaded for a fast first paint.
> To swap a weight, overwrite the matching file. (The demo pages still use
> Google Fonts for their own typefaces.)

> **Domain:** the site uses `mainstreetweb.com` in canonical/OG/JSON-LD/sitemap.
> Several similarly-named agencies exist (mainstreetweb.co, etc.) — confirm the
> domain is yours before launch.
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
> `mailto:` to `hello@mainstreetweb.com`. Set up that inbox (or change the
> address in `index.html` + `script.js`) so those emails reach you.

> No API keys belong in the front end — providers use a public endpoint id, not a
> secret. The form already has validation, length caps, a honeypot and a throttle.

## 2. Make it yours

- **Copy** is plain text in `index.html` — search and edit.
- **Business details:** search for `414-687-8929`, `hello@mainstreetweb.com`,
  `Milwaukee`, and `Abbas` (founder section).
- **Booking link:** the founder section's "Book a free 15-min call" button
  currently points to `#contact` (the quote form) so it never 404s. When your
  scheduler is live, search `REPLACE href with your Calendly` in `index.html`
  and swap in your Calendly/Cal.com URL.
- **Founder photo:** installed as **`assets/founder.webp`** (a studio headshot),
  center-cropped to a square via CSS `object-fit: cover`. To replace it, drop in
  a new `assets/founder.webp` and the founder section updates automatically.
- **Colours** are CSS variables at the top of `styles.css` (`:root`): change
  `--accent` (`#cc3d18`) to re-skin buttons, dots and links in one edit.
- **Interactive widgets:** the **live mockup generator** (`#try`) reads its
  industry list from the `TYPES` object in `script.js`; the **website grader**
  (`#grader`) has its questions in `index.html` and verdict text in `script.js`.
- **Pricing / estimate:** tier prices are in the Pricing section of `index.html`;
  the estimate widget reads its base prices from the `BASE` object in `script.js`
  and each add-on from `data-once`/`data-mo` on its checkbox.
- **Placeholders to fill in:** `[CLIENT NAME, BUSINESS]`, `[LOGO]`,
  `[STYLIST NAME]` — search the project for `[`.
- **Demo / hero photos** use topical stock placeholders from
  [LoremFlickr](https://loremflickr.com) (free, no key) and fade in behind a
  skeleton shimmer. Swap the image URLs for your own (or hand-picked
  Unsplash/Pexels) shots; if you change the host, update `img-src` in `_headers`
  / `vercel.json`.
- **SEO:** update the domain in `robots.txt`, `sitemap.xml`, the JSON-LD block,
  and `og:url`/`canonical` in `index.html` once you have a real domain.

## 3. Deploy free

- **Netlify:** drag the folder onto <https://app.netlify.com/drop>, or import the
  repo (no build command, publish directory = repo root). `_headers` applies.
- **Vercel:** import the repo, framework preset **Other**, no build. `vercel.json` applies.
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `/ (root)`.

## Security

- No `eval`, no `innerHTML`, no inline event handlers, no third-party trackers.
- Strict, per-path **CSP** plus `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS and COOP (in `_headers` /
  `vercel.json`). The main page CSP allows only same-origin code, Google Fonts,
  the placeholder image host, and your Formspree endpoint.
- Form hardened (validation, length caps, honeypot, throttle); real spam
  filtering happens at your form provider.

## Accessibility & performance

- Loads instantly — static HTML/CSS/JS, no framework or build, total page weight
  well under 500&nbsp;KB. Images are lazy-loaded with skeleton placeholders.
- Semantic landmarks, labelled controls, visible focus states, AA contrast, and
  `prefers-reduced-motion` honoured (animations and shimmer disable cleanly).
- Works with JavaScript disabled: the page reads fine, the FAQ opens (native
  `<details>`), and the form still posts to your endpoint.
