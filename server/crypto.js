'use strict';

// Small crypto helpers built on Node's built-in `crypto` — no native deps.
// Used for: hashing parent passwords (scrypt) and encrypting the parent's
// provider API key at rest (AES-256-GCM with a key derived from APP_SECRET).

const crypto = require('crypto');
const { appSecret } = require('./config');

// ---- Password hashing (scrypt) --------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(String(password), salt, expected.length);
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

// ---- Symmetric encryption for provider API keys ---------------------------

const KEY = crypto.scryptSync(appSecret, 'curio-provider-key-v1', 32);

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(blob) {
  try {
    const [ivHex, tagHex, dataHex] = String(blob).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null; // e.g. APP_SECRET rotated — treat as "no key connected"
  }
}

// ---- Field encryption with legacy-plaintext fallback ----------------------
// For stored PII fields (child transcripts, safety snippets, digests) that hold
// a MIX of newly-encrypted and legacy-plaintext rows during the migration.
// Ciphertext has the shape `<24hex-iv>:<32hex-tag>:<hex>`; anything that doesn't
// match is treated as legacy plaintext and returned unchanged.
const FIELD_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i;

function encryptField(text) {
  if (text === null || text === undefined) return text;
  return encrypt(text);
}

function decryptField(blob) {
  if (blob === null || blob === undefined) return blob;
  const s = String(blob);
  if (!FIELD_RE.test(s)) return blob;    // legacy plaintext — return unchanged
  const plain = decrypt(s);
  return plain === null ? blob : plain;  // decrypt failed (e.g. rotated key) → raw
}

// ---- Cookie signing --------------------------------------------------------

function sign(value) {
  const mac = crypto.createHmac('sha256', appSecret).update(value).digest('hex');
  return `${value}.${mac}`;
}

function unsign(signed) {
  if (typeof signed !== 'string' || !signed.includes('.')) return null;
  const idx = signed.lastIndexOf('.');
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', appSecret).update(value).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { hashPassword, verifyPassword, encrypt, decrypt, encryptField, decryptField, sign, unsign, randomToken };
