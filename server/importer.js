'use strict';

// Generalized curriculum importer. Turns a pasted (or uploaded) scope-and-
// sequence / skill list from ANY homeschool curriculum — Time4Learning, IXL,
// Abeka, The Good and the Beautiful, a co-op's outline, a CSV export — into a
// clean list of { subject, title, resource_url } objectives.
//
// It handles the formats people actually paste:
//   - "Math: Add fractions"            (Subject: title)
//   - "Math, Add fractions"            (CSV subject,title)
//   - "1. Add fractions" / "- Add ..." / "• Add ..."   (list markers)
//   - "Unit 3: Fractions" followed by indented/bulleted items  (section header)
//   - "Lesson 5 — Verbs"               (unit/lesson entry, flat)
//   - a flat list of plain objective lines
//   - skill name + https://… on the same line, or name then URL on the next line
//   - bare IXL skill URLs (title/subject derived from the path)
//
// Design goal: never silently return nothing useful. A section header only
// "groups" (rather than becoming an objective) when the next line is clearly a
// child item (bulleted or indented); otherwise we keep it as an objective. The
// UI shows a preview so the parent can fix any stragglers before importing.

const { guessSubject } = require('./safety');

const BULLET = /^\s*(?:\d+[.)]|[-*•·▪◦‣])\s+/;
const UNIT_PREFIX = /^(?:unit|chapter|week|module|lesson|day|part|topic)\s*\d*\s*[:.)\-–—]\s*(.+)$/i;
const SECTION_HEADER = /^(.{2,40}):\s*$/;                         // "Science:" on its own line
const SUBJECT_TITLE = /^([A-Za-z][\w &/'+-]{1,24})\s*[:,]\s+(.{2,})$/; // "Math: ..." / "Math, ..."
const TITLE_NOISE = /(scope\s*(?:&|and)?\s*sequence|table of contents|curriculum overview)/i;
const URL_RE = /https?:\/\/\S+/i;

const IXL_SUBJECT = {
  math: 'Math',
  ela: 'Language arts',
  science: 'Science',
  socialstudies: 'Social studies',
  'social-studies': 'Social studies',
  spanish: 'Spanish',
};

function cleanSubject(s) {
  return String(s || '')
    .replace(/^(?:unit|chapter|week|module|section|part|topic)\s*\d*\s*[:.\-–—]?\s*/i, '')
    .trim() || null;
}

// Pull the first URL out of a line before any "Subject:" parsing (so https: is
// never mistaken for a subject delimiter). Returns { text, resource_url }.
function extractUrl(line) {
  const m = String(line || '').match(URL_RE);
  if (!m) return { text: String(line || '').trim(), resource_url: null };
  let url = m[0].replace(/[).,;]+$/g, '').slice(0, 500);
  let text = String(line).replace(m[0], '');
  text = text.replace(/\s*[|—–\-–,]\s*$/g, '').replace(/^\s*[|—–\-–,]\s*/g, '').replace(/\s+/g, ' ').trim();
  return { text, resource_url: url || null };
}

// IXL path → { subject, title }. e.g. /math/grade-3/multiply-by-2
function deriveFromIxlUrl(url) {
  try {
    const u = new URL(url);
    if (!/ixl\.com$/i.test(u.hostname) && !/\.ixl\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const usable = parts.filter((p) => !/^grade-\d+/i.test(p));
    if (!usable.length) return null;
    const subjectKey = usable[0].toLowerCase();
    const subject = IXL_SUBJECT[subjectKey] || (subjectKey.charAt(0).toUpperCase() + subjectKey.slice(1));
    const slug = usable[usable.length - 1];
    if (!slug || slug === subjectKey) return { subject, title: subject };
    const title = slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    return { subject, title };
  } catch {
    return null;
  }
}

// Pre-tokenize: keep whether each non-empty line was bulleted or indented, so a
// header can look ahead and tell if the next line is one of its child items.
function tokenize(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indented = /^\s{2,}|^\t/.test(raw);
    const bullet = BULLET.test(raw);
    out.push({ text: raw.replace(/\t/g, ' ').trim().replace(BULLET, '').trim(), indented, bullet });
  }
  return out;
}

function pushRow(rows, { subject, title, resource_url }) {
  rows.push({
    subject: subject || 'General',
    title,
    resource_url: resource_url || null,
  });
}

function parseCurriculum(text) {
  const toks = tokenize(text);
  const rows = [];
  let currentSubject = null;

  for (let i = 0; i < toks.length; i++) {
    const rawLine = toks[i].text;
    if (!rawLine) continue;

    const { text: line, resource_url } = extractUrl(rawLine);

    // URL-only line (nothing left after stripping the link).
    if (!line) {
      if (resource_url) {
        const prev = rows[rows.length - 1];
        if (prev && !prev.resource_url) {
          prev.resource_url = resource_url;
        } else {
          const derived = deriveFromIxlUrl(resource_url);
          if (derived) pushRow(rows, { ...derived, resource_url });
        }
      }
      continue;
    }

    if (line.length < 3) continue;
    if (/^[\d.\s]+$/.test(line)) continue;      // bare numbers / page numbers
    if (TITLE_NOISE.test(line) && !toks[i].bullet) continue; // document titles

    // Look-ahead must also ignore URL-only following lines when deciding if a
    // unit header groups children — peek at next non-URL-only token if needed.
    const nextIsChild = toks[i + 1] && (toks[i + 1].bullet || toks[i + 1].indented);

    // "Science:" alone → section header, groups following items.
    const header = line.match(SECTION_HEADER);
    if (header && header[1].split(/\s+/).length <= 5) {
      currentSubject = cleanSubject(header[1]);
      continue;
    }

    // "Unit 3: Fractions" — a header IF the next line is a child item; else a
    // flat objective like "Unit 3: Add fractions".
    const unit = line.match(UNIT_PREFIX);
    if (unit) {
      const title = unit[1].trim();
      if (nextIsChild) { currentSubject = cleanSubject(title) || currentSubject; continue; }
      pushRow(rows, { subject: currentSubject || guessSubject(title), title, resource_url });
      continue;
    }

    // "Math: Add fractions" / "Math, Add fractions" → explicit subject.
    const st = line.match(SUBJECT_TITLE);
    if (st) {
      pushRow(rows, { subject: st[1].trim(), title: st[2].trim(), resource_url });
      continue;
    }

    // Plain objective line.
    pushRow(rows, { subject: currentSubject || guessSubject(line), title: line, resource_url });
  }

  // De-dupe by title (case-insensitive). If a later duplicate brings a URL and
  // the kept row has none, merge the URL in.
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    const key = r.title.toLowerCase();
    if (seen.has(key)) {
      const kept = seen.get(key);
      if (!kept.resource_url && r.resource_url) kept.resource_url = String(r.resource_url).slice(0, 500);
      continue;
    }
    const row = {
      subject: String(r.subject || 'General').slice(0, 40),
      title: r.title.replace(/\s+/g, ' ').slice(0, 200),
      resource_url: r.resource_url ? String(r.resource_url).slice(0, 500) : null,
    };
    seen.set(key, row);
    out.push(row);
    if (out.length >= 200) break;
  }
  return out;
}

module.exports = { parseCurriculum, extractUrl, deriveFromIxlUrl };
