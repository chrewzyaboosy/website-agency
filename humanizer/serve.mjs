#!/usr/bin/env node
// Inkling dev server: static files + optional Deep-mode API (/api/rewrite), bound to 127.0.0.1.
//
//   npm start               -> http://127.0.0.1:4173 (or the next free port)
//   PORT=8080 npm start     -> http://127.0.0.1:8080 (or the next free port)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const BASE_PORT = parsePort(process.env.PORT) ?? 4173;
const MAX_PORT_TRIES = 25;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function parsePort(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : null;
}

function send(res, status, body, extra = {}) {
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    ...extra,
  });
  res.end(res.req.method === 'HEAD' ? undefined : buf);
}

function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

async function resolveFile(urlPath) {
  // Hidden files/dirs (e.g. .git, .env) are never served.
  if (urlPath.split('/').some((seg) => seg.startsWith('.') && seg !== '')) return { status: 404 };

  let target = path.resolve(ROOT, '.' + path.posix.normalize('/' + urlPath));
  if (!isInside(ROOT, target)) return { status: 403 };

  let stat;
  try {
    stat = await fs.promises.stat(target);
  } catch {
    return { status: 404 };
  }
  if (stat.isDirectory()) {
    target = path.join(target, 'index.html');
    try {
      stat = await fs.promises.stat(target);
    } catch {
      return { status: 404 };
    }
  }
  if (!stat.isFile()) return { status: 404 };

  // Follow symlinks, then re-check we're still inside the web root.
  let real;
  try {
    real = await fs.promises.realpath(target);
  } catch {
    return { status: 404 };
  }
  const realRoot = await fs.promises.realpath(ROOT);
  if (!isInside(realRoot, real)) return { status: 403 };

  return { status: 200, file: real, size: stat.size, mtime: stat.mtime };
}

/* ------------------------------------------------------------------ */
/* Deep mode API: POST /api/rewrite -> Claude rewrite (server-side key) */
/* ------------------------------------------------------------------ */
// The key never reaches the browser. Set ANTHROPIC_API_KEY (or use an
// `ant auth login` profile). Without credentials the UI falls back to the
// local engine only.
const MODEL = process.env.INKLING_MODEL || 'claude-opus-5-5';
const MAX_BODY = 256 * 1024;
const MAX_REWRITE_CHARS = 60000;
const RATE_LIMIT = { windowMs: 60_000, max: Number(process.env.INKLING_RATE_LIMIT) || 20 };
const hits = new Map(); // ip -> [timestamps]
let anthropicClient = null;
let rewriteLib = null;

const hasCredentials = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

async function getClient() {
  if (anthropicClient) return anthropicClient;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return anthropicClient;
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // bound memory
  return list.length > RATE_LIMIT.max;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/status' && (req.method === 'GET' || req.method === 'HEAD')) {
    sendJson(res, 200, { ai: hasCredentials(), model: hasCredentials() ? MODEL : null });
    return;
  }
  if (pathname !== '/api/rewrite') { sendJson(res, 404, { error: 'not_found' }); return; }
  if (req.method !== 'POST') { send(res, 405, 'Method Not Allowed\n', { Allow: 'POST' }); return; }

  // Same-origin only (blocks other websites from spending your API credits).
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) { sendJson(res, 403, { error: 'forbidden_origin' }); return; }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) { sendJson(res, 415, { error: 'json_required' }); return; }
  if (!hasCredentials()) { sendJson(res, 503, { error: 'ai_not_configured' }); return; }
  if (rateLimited(req.socket.remoteAddress || 'unknown')) { sendJson(res, 429, { error: 'rate_limited' }); return; }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { sendJson(res, e.status || 400, { error: 'bad_request' }); return; }
  const text = typeof body?.text === 'string' ? body.text : '';
  const tone = typeof body?.tone === 'string' ? body.tone : 'natural';
  if (!text.trim()) { sendJson(res, 400, { error: 'empty' }); return; }
  if (text.length > MAX_REWRITE_CHARS) { sendJson(res, 413, { error: 'too_long' }); return; }

  rewriteLib ||= await import('./engine/rewrite.js');
  const client = await getClient();
  const call = async (system, user) => {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
    if (msg.stop_reason === 'max_tokens') throw Object.assign(new Error('truncated'), { code: 'too_long' });
    return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  };
  try {
    const result = await rewriteLib.guardedRewrite(call, text, { tone });
    if (!result.text) { sendJson(res, 502, { error: 'empty_completion' }); return; }
    sendJson(res, 200, { text: result.text, missing: result.missing, overlap: Math.round(result.overlap * 100) / 100 });
  } catch (err) {
    const status = err?.status;
    if (err?.code === 'refused') { sendJson(res, 422, { error: 'refused' }); return; }
    if (err?.code === 'too_long') { sendJson(res, 413, { error: 'too_long' }); return; }
    console.error('rewrite failed:', status || '', err?.message || err);
    if (status === 401 || status === 403) sendJson(res, 503, { error: 'ai_auth_failed' });
    else if (status === 429) sendJson(res, 429, { error: 'rate_limited' });
    else sendJson(res, 502, { error: 'upstream_error' });
  }
}

async function handle(req, res) {
  const apiPath = (req.url || '').split('?')[0];
  if (apiPath.startsWith('/api/')) { await handleApi(req, res, apiPath); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
    return;
  }

  const rawUrl = req.url || '/';
  if (rawUrl.includes('\0') || rawUrl.length > 4096) {
    send(res, 400, 'Bad Request\n');
    return;
  }

  let pathname;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    send(res, 400, 'Bad Request\n');
    return;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) {
    send(res, 400, 'Bad Request\n');
    return;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const found = await resolveFile(pathname);
  if (found.status !== 200) {
    send(res, found.status, found.status === 403 ? 'Forbidden\n' : 'Not Found\n');
    return;
  }

  const type = MIME[path.extname(found.file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Content-Length': found.size,
    'Last-Modified': found.mtime.toUTCString(),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(found.file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function listen(port, triesLeft) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) send(res, 500, 'Internal Server Error\n');
        else res.destroy();
      });
    });
    server.once('error', (err) => {
      if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && triesLeft > 0 && port !== 0) {
        resolve(listen(port + 1, triesLeft - 1));
      } else {
        reject(err);
      }
    });
    server.listen(port, HOST, () => resolve(server));
  });
}

const server = await listen(BASE_PORT, MAX_PORT_TRIES).catch((err) => {
  console.error(`Could not start server: ${err.message}`);
  process.exit(1);
});
const { port } = server.address();
if (port !== BASE_PORT && BASE_PORT !== 0) console.log(`Port ${BASE_PORT} is busy, using ${port} instead.`);
console.log(`Inkling is running at http://${HOST}:${port}/`);
console.log('Press Ctrl+C to stop.');

const shutdown = () => {
  server.close(() => process.exit(0));
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
