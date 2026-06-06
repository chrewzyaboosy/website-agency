# Main Street Web — agency marketing site

A fast marketing site for a web + AI-automation studio, built with
**React + Tailwind CSS** and **no build step** (React + [htm] + the Tailwind
Play CDN), plus three polished standalone demo sites. Open `index.html` in a
browser, or deploy the folder to Netlify/Vercel as static files.

```
website-agency/
├── index.html          ← app shell: meta, fonts, Tailwind config, mounts React
├── app.js              ← the whole React app (components, estimate, lead form)
├── favicon.svg         ← brand favicon
├── og-image.svg        ← social-share image
├── _headers            ← security headers for Netlify
├── vercel.json         ← security headers for Vercel
├── robots.txt          ← crawl rules (update the domain)
├── sitemap.xml         ← sitemap (update the domain)
└── demos/
    ├── contractor.html ← "Ironclad Builders" demo (self-contained)
    ├── restaurant.html ← "Maple & Ember" demo (self-contained)
    └── salon.html      ← "Halo Studio" demo (self-contained)
```

[htm]: https://github.com/developit/htm

## Tech &amp; how to run

- **React 18 + Tailwind, no bundler.** `index.html` loads React, ReactDOM and
  htm from unpkg, and Tailwind from `cdn.tailwindcss.com`. `app.js` renders the
  whole site. There is **nothing to install and nothing to build** — just open
  or deploy the files.
- **Animations** are tasteful and reduced-motion-aware: fade/rise on scroll
  (IntersectionObserver), hover lifts, a sticky-nav transition, an animated
  mobile menu, an accordion FAQ, and a gently floating hero device mockup.
- **Going to production later?** The Play CDN is great for this stage but isn't
  optimised for production (it compiles Tailwind in the browser). When you're
  ready, paste these components into a **Vite + React + Tailwind** project — the
  markup is 1:1 with JSX — and you'll get a tiny, pre-built bundle and can drop
  the CDN/`unsafe-inline` allowances from the CSP.

## 1. Connect the lead form (required to receive messages)

The form posts to a placeholder endpoint. Until you set a real one, submitting
shows a friendly "not connected yet" message and keeps the user's typed data.

In **`app.js`**, change the `FORM_ENDPOINT` constant near the top:

```js
var FORM_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID"; // ← your Formspree id
```

- **Formspree:** create a free form at <https://formspree.io>, paste your id.
- **Netlify Forms:** point `FORM_ENDPOINT` at your handler, or wire a native
  Netlify form. (For a static React app, Formspree is the simplest path.)

> No API keys belong in the front end — form providers use a public endpoint id,
> not a secret. The form already includes validation, trimmed + length-capped
> inputs, a honeypot field, and a submit throttle to cut spam.

The demo pages' forms are intentionally **not** wired to a backend.

## 2. Make it yours (copy, colours, contact)

- **Copy** lives in `app.js` as plain text inside each component — search for the
  text you want to change.
- **Business details:** the `PHONE`, `TEL`, `EMAIL` and `CAL` (booking link)
  constants at the top of `app.js` (also update `Milwaukee` mentions, the
  founder name in the "Talk to the person" section, and the footer).
- **Booking link:** set `CAL` to your Calendly/Cal.com URL so "Book a free
  15-min call" works. The founder photo is a stock placeholder — swap its URL
  for a real headshot.
- **SEO:** update the domain in `robots.txt`, `sitemap.xml`, the JSON-LD block
  and the `og:url`/`canonical` tags in `index.html` once you have a real domain.
- **Colours** live in the Tailwind config in `index.html` (`tailwind.config`):
  ```js
  ink: '#171311', paper: '#f7f4ef', accent: '#cc3d18', /* … */
  ```
  Change `accent` to re-skin buttons, dots and links across the whole site.
- **Pricing / estimate:** the `TIERS`, `BASE` and `ADDONS` arrays in `app.js`.
- **Placeholders to fill in** are marked with square brackets — `[CLIENT NAME,
  BUSINESS]`, `[LOGO]`, `[STYLIST NAME]`. Search the project for `[`.
- **Demo photos** use topical stock placeholders from
  [LoremFlickr](https://loremflickr.com) (free, no key); each sits over a themed
  gradient and hides on error. Swap the image URLs in `app.js` / the demo files
  for your own (or hand-picked Unsplash/Pexels) shots, and add any new image host
  to `img-src` in `_headers` / `vercel.json`.

## 3. Deploy free

- **Netlify:** drag the folder onto <https://app.netlify.com/drop>, or import the
  repo (no build command, publish directory = repo root). `_headers` applies.
- **Vercel:** import the repo, framework preset **Other**, no build command.
  `vercel.json` applies.
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `/ (root)`.

> Update the `og:url` / `canonical` URLs in `index.html` to your real domain.

## Security

- **No `eval`** anywhere — htm renders without Babel, so the CSP needs no
  `unsafe-eval`. `unsafe-inline` is required only for the Tailwind runtime/config.
- **Headers** (`_headers` for Netlify, `vercel.json` for Vercel): a
  Content-Security-Policy scoped per path, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  HSTS and COOP. The CSP whitelists only React/Tailwind CDNs, Google Fonts, the
  LoremFlickr image host and your Formspree endpoint.
- **Form** is hardened (validation, length caps, honeypot, throttle); real spam
  filtering happens at your form provider, which should never trust client input.

## Accessibility &amp; performance notes

- Semantic landmarks, labelled controls, visible focus states, AA colour
  contrast, and `prefers-reduced-motion` honoured (animations disable cleanly).
- One web font (Space Grotesk) with a system fallback; topical images lazy-load.
- Because the UI renders with React, **JavaScript is required** — a `<noscript>`
  block shows your name, phone and email so no-JS visitors can still reach you.
  (A production Vite build can pre-render/SSG for no-JS + faster first paint.)
