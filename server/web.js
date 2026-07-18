'use strict';

// A minimal web toolkit on Node's built-in http — no framework dependency, so
// `node server/index.js` runs with zero `npm install`. Provides a tiny router,
// JSON body parsing, cookie helpers, and static file serving.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.apk': 'application/vnd.android.package-archive',
};

function createApp({ publicDir }) {
  const routes = []; // { method, pattern, handler }

  function on(method, pattern, handler) {
    routes.push({ method, pattern, handler });
  }

  const api = {
    get: (p, h) => on('GET', p, h),
    post: (p, h) => on('POST', p, h),
    del: (p, h) => on('DELETE', p, h),
    put: (p, h) => on('PUT', p, h),
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    req.path = url.pathname;
    req.query = Object.fromEntries(url.searchParams);
    req.cookies = parseCookies(req.headers.cookie);
    res.json = (obj, status = 200) => sendJson(res, obj, status);
    res.text = (str, status = 200) => sendText(res, str, status);
    res.setCookie = (name, value, opts) => setCookie(res, name, value, opts);

    // Match a route.
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const params = matchPath(r.pattern, req.path);
      if (params) {
        req.params = params;
        try {
          if (req.method === 'POST' || req.method === 'PUT') req.body = await parseBody(req);
          await r.handler(req, res);
        } catch (err) {
          console.error(`[curio] handler error on ${req.method} ${req.path}:`, err.message);
          if (!res.headersSent) sendJson(res, { error: err.publicMessage || 'Something went wrong.' }, err.status && err.status < 500 ? err.status : 500);
        }
        return;
      }
    }

    // Fall back to static files.
    if (req.method === 'GET' && serveStatic(publicDir, req.path, res)) return;
    sendText(res, 'Not found', 404);
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  return { ...api, server, listen: (port, cb) => server.listen(port, cb) };
}

// ---- Path matching ("/api/kids/:id") --------------------------------------

function matchPath(pattern, pathname) {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = pathname.split('/').filter(Boolean);
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
    else if (pParts[i] !== uParts[i]) return null;
  }
  return params;
}

// ---- Body / cookies / responses -------------------------------------------

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (opts.secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const header = prev ? [].concat(prev, parts.join('; ')) : parts.join('; ');
  res.setHeader('Set-Cookie', header);
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendText(res, str, status = 200) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(str);
}

function serveStatic(publicDir, pathname, res) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.normalize(path.join(publicDir, rel));
  if (!filePath.startsWith(publicDir)) return false; // path traversal guard
  const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
  // Clean-URL fallback: /welcome → /welcome.html when there's no extension.
  if (!isFile(filePath) && !path.extname(filePath) && isFile(filePath + '.html')) {
    filePath += '.html';
  }
  if (!isFile(filePath)) return false;
  res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

module.exports = { createApp };
