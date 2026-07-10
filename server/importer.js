'use strict';

// Generalized curriculum importer. Turns a pasted (or uploaded) scope-and-
// sequence / skill list from ANY homeschool curriculum — Time4Learning, IXL,
// Abeka, The Good and the Beautiful, a co-op's outline, a CSV export — into a
// clean list of { subject, title } objectives. No third-party parser needed.
//
// It handles the formats people actually paste:
//   - "Math: Add fractions"            (Subject: title)
//   - "Math, Add fractions"            (CSV subject,title)
//   - "1. Add fractions" / "- Add ..." / "• Add ..."   (list markers)
//   - "Unit 3: Fractions" followed by indented/bulleted items  (section header)
//   - "Lesson 5 — Verbs"               (unit/lesson entry, flat)
//   - a flat list of plain objective lines
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

function cleanSubject(s) {
  return String(s || '')
    .replace(/^(?:unit|chapter|week|module|section|part|topic)\s*\d*\s*[:.\-–—]?\s*/i, '')
    .trim() || null;
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

function parseCurriculum(text) {
  const toks = tokenize(text);
  const rows = [];
  let currentSubject = null;

  for (let i = 0; i < toks.length; i++) {
    const line = toks[i].text;
    if (!line || line.length < 3) continue;
    if (/^[\d.\s]+$/.test(line)) continue;      // bare numbers / page numbers
    if (TITLE_NOISE.test(line) && !toks[i].bullet) continue; // document titles

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
      rows.push({ subject: currentSubject || guessSubject(title), title });
      continue;
    }

    // "Math: Add fractions" / "Math, Add fractions" → explicit subject.
    const st = line.match(SUBJECT_TITLE);
    if (st) { rows.push({ subject: st[1].trim(), title: st[2].trim() }); continue; }

    // Plain objective line.
    rows.push({ subject: currentSubject || guessSubject(line), title: line });
  }

  // De-dupe by title (case-insensitive), sanitize, and cap.
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = r.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      subject: String(r.subject || 'General').slice(0, 40),
      title: r.title.replace(/\s+/g, ' ').slice(0, 200),
    });
    if (out.length >= 200) break;
  }
  return out;
}

module.exports = { parseCurriculum };
