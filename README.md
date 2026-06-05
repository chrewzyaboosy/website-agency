# Rivet — agency marketing site

A fast, single-page marketing website for a web + AI-automation studio, plus
three polished demo sites. No framework, no build step — just open
`index.html` in a browser, or drag the folder onto Netlify.

```
website-agency/
├── index.html          ← main marketing page
├── styles.css          ← all styles for the main page
├── script.js           ← nav, scroll reveal, estimate widget, form handling
├── favicon.svg         ← brand favicon
├── og-image.svg        ← social-share image
└── demos/
    ├── contractor.html ← "Ironclad Builders" demo (self-contained)
    ├── restaurant.html ← "Maple & Ember" demo (self-contained)
    └── salon.html      ← "Halo Studio" demo (self-contained)
```

Each demo is a single self-contained file (its own inline CSS + JS), so you can
copy one out as a starting point for a real client without touching anything else.

---

## 1. Connect the lead form (required to receive messages)

The form on `index.html` posts to a placeholder endpoint. Until you set a real
one, submitting shows a friendly "not connected yet" message and **keeps the
user's typed data** — it never sends to a dead URL.

### Option A — Formspree (easiest, works on any host)
1. Create a free form at <https://formspree.io>, copy your form ID.
2. In `index.html`, find the comment `REPLACE: your form endpoint` and update the
   form's `action`:
   ```html
   <form ... action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```
   Replace `YOUR_FORM_ID` with your real ID. That's it.

### Option B — Netlify Forms (if you deploy on Netlify)
1. Add `netlify` and a `name` to the form tag and remove the `action`:
   ```html
   <form id="leadForm" name="quote" method="POST" data-netlify="true" netlify>
   ```
2. Add a hidden input so Netlify knows the form name:
   ```html
   <input type="hidden" name="form-name" value="quote" />
   ```
3. Deploy. Submissions appear in your Netlify dashboard under **Forms**.

> **Security note:** there are no API keys or secrets in this front-end, and there
> shouldn't be. Form providers like Formspree/Netlify use a public endpoint ID,
> not a secret. The form already includes client-side validation, input
> sanitizing, a honeypot field, and a submit throttle to cut spam.

The demo pages' forms are intentionally **not** wired to a backend — they show a
friendly "this is a demo" message on submit.

---

## 2. Make it yours (copy, colors, contact)

**Business name, contact info, copy** — all live as plain text in `index.html`.
Search for these to swap quickly:
- `Rivet` — the business name / wordmark
- `hello@clearroutecarrier.com` — contact email (also in `tel:` links)
- `414-687-8929` — phone number (appears in `tel:+14146878929` links too)
- `Milwaukee` — service area

**Colors** live as CSS variables at the top of `styles.css` under `:root`:
```css
--ink:    #171311;  /* near-black text/dark sections */
--paper:  #f7f4ef;  /* warm off-white background     */
--accent: #d8451f;  /* ember — buttons, dots, links  */
```
Change `--accent` to re-skin the whole site in one edit. (If you pick a *lighter*
accent, also bump `--accent-ink` darker so text links keep a 4.5:1 contrast ratio.)

**Pricing / estimate** — tier prices are in the Pricing section of `index.html`.
The instant-estimate widget reads its base prices from the `BASE` object near the
top of the estimate code in `script.js`, and each add-on's cost from the
`data-once` / `data-mo` attributes on its checkbox in `index.html`. Keep those in
sync if you change prices.

**Placeholders to fill in** are marked with square brackets, e.g.
`[CLIENT NAME / BUSINESS]`, `[CASE STUDY: Green Ladder]`, `[LOGO]`,
`[STYLIST NAME]`. Search the project for `[` to find them all.

---

## 3. Deploy free

### Netlify (drag & drop)
1. Go to <https://app.netlify.com/drop>.
2. Drag the whole `website-agency` folder onto the page.
3. Done — you get a live URL. Add a custom domain in **Site settings → Domain**.

### Netlify (from GitHub, auto-deploys on push)
1. Push this repo to GitHub.
2. In Netlify, **Add new site → Import from Git**, pick the repo.
3. No build command needed. Publish directory: the repo root (`/`). Deploy.

### Vercel
1. <https://vercel.com/new>, import the repo (or use the Vercel CLI).
2. Framework preset: **Other**. No build command. Output directory: root. Deploy.

> Update the `og:url` / `canonical` URLs in `index.html`'s `<head>` to your real
> domain so link previews and SEO point to the right place.

---

## Accessibility & performance notes
- Semantic HTML5, proper heading order, visible focus states, `alt`/`aria` labels.
- Color contrast meets WCAG AA (≥ 4.5:1 for text).
- Respects `prefers-reduced-motion` — all animation is disabled for users who ask.
- No tracking scripts, no heavy libraries. One web font (Space Grotesk) with a
  system-font fallback. Total page weight is well under 500&nbsp;KB.
- Works with JavaScript disabled: the page reads fine, the FAQ opens (native
  `<details>`), and the form still posts to your endpoint.
