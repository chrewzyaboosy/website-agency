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
├── script.js           ← nav, reveal, estimate, form, chat assistant, image loaders
├── favicon.svg         ← brand favicon
├── og-image.svg        ← social-share image (export a PNG for best previews)
├── _headers            ← security headers for Netlify
├── vercel.json         ← security headers for Vercel
├── robots.txt          ← crawl rules
├── sitemap.xml         ← sitemap
├── assets/             ← put your founder.jpg (and any real photos) here
├── blog/               ← SEO blog: index + 3 articles (BlogPosting schema)
├── legal/              ← privacy.html · terms.html · accessibility.html
└── demos/              ← contractor.html · restaurant.html · salon.html
```

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

## 1. Connect the lead form (required to receive messages)

The form posts to a placeholder endpoint. Until you set a real one, submitting
shows a friendly "not connected yet" message and keeps the user's typed data.

In `index.html`, find `REPLACE: your form endpoint` and set the form `action`:

```html
<form ... action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
```

- **Formspree:** create a free form at <https://formspree.io>, paste your id.
- **Netlify Forms:** add `data-netlify="true"` + a hidden `form-name`, deploy on Netlify.

> No API keys belong in the front end — providers use a public endpoint id, not a
> secret. The form already has validation, length caps, a honeypot and a throttle.

## 2. Make it yours

- **Copy** is plain text in `index.html` — search and edit.
- **Business details:** search for `414-687-8929`, `hello@clearroutecarrier.com`,
  `Milwaukee`, and `Abbas` (founder section). The booking button links to
  `https://calendly.com/your-link` — set it to your Calendly/Cal.com URL.
- **Founder photo:** save your headshot as **`assets/founder.jpg`** (square crop,
  ~600×600). Until it's there, a branded placeholder shows.
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
