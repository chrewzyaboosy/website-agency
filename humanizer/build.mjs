#!/usr/bin/env node
// Build a single self-contained HTML file: dist/inkling.html
//
// - CSS is inlined in one <style>, the theme bootstrap and the bundled app
//   (UI + engine) are inlined as classic <script>s.
// - A strict CSP <meta> allows exactly those inline blocks via sha256 hashes
//   computed here (no 'unsafe-inline'), and nothing else: no network at all.
// - Works from file:// (double-click). The background worker is not available
//   there, so the bundle runs the engine on the main thread.
//
// Bundling uses esbuild: a locally installed copy if present, otherwise
// `npx --yes esbuild@0.24.0` (downloaded once by npm and cached).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'inkling.html');
const ESBUILD_VERSION = '0.24.0';
const ENTRY = path.join(ROOT, 'assets', 'app.js');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function fail(msg) {
  console.error(`\nBuild failed: ${msg}\n`);
  process.exit(1);
}

const ESBUILD_OPTIONS = {
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  charset: 'utf8',
  legalComments: 'none',
  define: { __INKLING_INLINE__: 'true' },
};

async function bundleWithLocalEsbuild() {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    return null;
  }
  const result = await esbuild.build({
    ...ESBUILD_OPTIONS,
    entryPoints: [ENTRY],
    write: false,
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

function bundleWithNpx() {
  const args = [
    '--yes',
    `esbuild@${ESBUILD_VERSION}`,
    path.relative(ROOT, ENTRY),
    '--bundle',
    `--format=${ESBUILD_OPTIONS.format}`,
    '--minify',
    `--target=${ESBUILD_OPTIONS.target}`,
    `--charset=${ESBUILD_OPTIONS.charset}`,
    `--legal-comments=${ESBUILD_OPTIONS.legalComments}`,
    '--define:__INKLING_INLINE__=true',
    '--log-level=warning',
  ];
  try {
    return execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  } catch (err) {
    const detail = [err.stderr, err.message].filter(Boolean).join('\n').trim();
    fail(`esbuild could not run via npx (is npm reachable?).\n${detail}`);
  }
  return '';
}

// Very small, safe CSS minifier: strips comments and redundant whitespace.
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

const sha256 = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function replaceOnce(haystack, needle, replacement, what) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) fail(`could not find ${what} in index.html`);
  if (haystack.indexOf(needle, idx + needle.length) !== -1) fail(`found ${what} more than once in index.html`);
  // Plain slicing (not String.replace) so `$` sequences in the bundle are never interpreted.
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

async function main() {
  const t0 = Date.now();
  if (!fs.existsSync(path.join(ROOT, 'engine', 'index.js'))) {
    fail('engine/index.js is missing. The single-file build needs the engine.');
  }

  let html = read('index.html');
  const css = minifyCss(read('assets/app.css')).replace(/<\/style/gi, '<\\/style');
  const themeJs = read('assets/theme-init.js').trim().replace(/<\/script/gi, '<\\/script');
  const favicon = fs.readFileSync(path.join(ROOT, 'assets', 'favicon.svg'));

  let bundle = await bundleWithLocalEsbuild();
  const bundler = bundle == null ? `npx esbuild@${ESBUILD_VERSION}` : 'local esbuild';
  if (bundle == null) bundle = bundleWithNpx();
  if (!bundle || bundle.length < 1000) fail('esbuild produced an empty bundle.');
  // Make the bundle safe to embed in <script>…</script>.
  bundle = bundle.trim().replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

  const styleHash = sha256(css);
  const themeHash = sha256(themeJs);
  const appHash = sha256(bundle);

  const csp = [
    "default-src 'none'",
    `script-src ${themeHash} ${appHash}`,
    `style-src ${styleHash}`,
    'img-src data:',
    "connect-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  html = html.replace(
    /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
    () => `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
  if (!html.includes(appHash)) fail('could not replace the CSP meta tag');

  html = replaceOnce(
    html,
    '<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">',
    `<link rel="icon" href="data:image/svg+xml;base64,${favicon.toString('base64')}" type="image/svg+xml">`,
    'favicon link',
  );
  html = replaceOnce(html, '<link rel="stylesheet" href="assets/app.css">', `<style>${css}</style>`, 'stylesheet link');
  html = replaceOnce(html, '<script src="assets/theme-init.js"></script>', `<script>${themeJs}</script>`, 'theme-init script');
  html = replaceOnce(html, '<script type="module" src="assets/app.js"></script>', `<script>${bundle}</script>`, 'app module script');

  // Sanity check: nothing should still point at local files.
  const leftover = html.match(/\s(?:src|href)="(?!#|data:|mailto:|https?:)[^"]+"/g);
  if (leftover) fail(`unresolved local references remain: ${leftover.join(', ')}`);

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');

  const bytes = Buffer.byteLength(html, 'utf8');
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`Built ${path.relative(process.cwd(), OUT) || OUT}`);
  console.log(`  size:    ${kb(bytes)} (${bytes.toLocaleString('en-US')} bytes)`);
  console.log(`  script:  ${kb(Buffer.byteLength(bundle))}   style: ${kb(Buffer.byteLength(css))}`);
  console.log(`  bundler: ${bundler}   time: ${Date.now() - t0} ms`);
  console.log('  Open it directly in a browser (file://) - no server needed.');
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
