/**
 * Form 2 Tree Risk Assessment field extraction.
 * Housing Department Form 2 layout: labels and values are positioned;
 * pdf.js reading order often puts the value BEFORE the English label.
 * Prefer coordinate proximity (value to the right of / near the label).
 */

export function itemsFromTextContent(content) {
  return (content.items || [])
    .filter((it) => it && typeof it.str === 'string' && it.str.trim())
    .map((it) => ({
      str: it.str.trim(),
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
    }));
}

function findLabel(items, patterns) {
  for (const p of patterns) {
    const re = typeof p === 'string' ? new RegExp(p, 'i') : p;
    const hit = items.find((it) => re.test(it.str));
    if (hit) return hit;
  }
  return null;
}

function nearestNumber(items, label, opts = {}) {
  if (!label) return 0;
  const {
    maxDy = 20,
    minDx = -8,
    maxDx = 180,
    minVal = null,
    maxVal = null,
  } = opts;
  const cands = items.filter((it) => {
    if (!/^\d+(?:\.\d+)?$/.test(it.str)) return false;
    const v = parseFloat(it.str);
    if (!Number.isFinite(v)) return false;
    if (minVal != null && v < minVal) return false;
    if (maxVal != null && v > maxVal) return false;
    const dy = Math.abs(it.y - label.y);
    const dx = it.x - label.x;
    return dy <= maxDy && dx >= minDx && dx <= maxDx;
  });
  cands.sort((a, b) => {
    const da = Math.hypot(a.x - label.x, a.y - label.y);
    const db = Math.hypot(b.x - label.x, b.y - label.y);
    return da - db;
  });
  return cands[0] ? parseFloat(cands[0].str) : 0;
}

function padTime(h, m) {
  return `${String(parseInt(h, 10)).padStart(2, '0')}:${String(parseInt(m, 10)).padStart(2, '0')}`;
}

function isValidHourMinute(h, m) {
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  return Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function nearestDate(items, label, opts = {}) {
  if (!label) return '';
  const {
    maxDy = 22,
    minDx = -8,
    maxDx = 260,
    maxX = Infinity,
    minX = -Infinity,
  } = opts;
  const cands = items.filter((it) => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(it.str)) return false;
    const dy = Math.abs(it.y - label.y);
    const dx = it.x - label.x;
    return dy <= maxDy && dx >= minDx && dx <= maxDx && it.x <= maxX && it.x >= minX;
  });
  cands.sort((a, b) => {
    const da = Math.hypot(a.x - label.x, a.y - label.y);
    const db = Math.hypot(b.x - label.x, b.y - label.y);
    return da - db;
  });
  return cands[0] ? cands[0].str : '';
}

function nearestTimePart(items, label, maxVal) {
  if (!label) return null;
  const cands = items.filter((it) => {
    if (!/^\d{1,2}$/.test(it.str)) return false;
    const v = parseInt(it.str, 10);
    if (v < 0 || v > maxVal) return false;
    const dy = Math.abs(it.y - label.y);
    const dx = Math.abs(it.x - label.x);
    return dy <= 24 && dx <= 22;
  });
  cands.sort((a, b) => {
    const da = Math.hypot(a.x - label.x, a.y - label.y);
    const db = Math.hypot(b.x - label.x, b.y - label.y);
    return da - db;
  });
  return cands[0] ? cands[0].str : null;
}

function timeRightOfDate(items, dateStr, lastLabel) {
  if (!dateStr) return '';
  const dateItems = items.filter((it) => it.str === dateStr);
  for (const dateItem of dateItems) {
    const maxX = lastLabel ? lastLabel.x - 2 : dateItem.x + 120;
    const parts = items
      .filter((it) => {
        if (it === dateItem) return false;
        const dy = Math.abs(it.y - dateItem.y);
        return dy <= 10 && it.x > dateItem.x && it.x < maxX;
      })
      .sort((a, b) => a.x - b.x);

    const colon = parts.find((it) => /^\d{1,2}:\d{2}$/.test(it.str));
    if (colon) {
      const [h, m] = colon.str.split(':');
      if (isValidHourMinute(h, m)) return padTime(h, m);
    }

    const nums = parts.filter((it) => /^\d{1,2}$/.test(it.str));
    if (nums.length >= 2 && isValidHourMinute(nums[0].str, nums[1].str)) {
      return padTime(nums[0].str, nums[1].str);
    }
  }
  return '';
}

function textRightOf(items, label, opts = {}) {
  if (!label) return '';
  const { maxDy = 10, minDx = 4, maxX = label.x + 280, allow = () => true } = opts;
  const parts = items
    .filter((it) => {
      if (it === label) return false;
      const dy = Math.abs(it.y - label.y);
      const dx = it.x - label.x;
      return dy <= maxDy && dx >= minDx && it.x <= maxX && allow(it);
    })
    .sort((a, b) => a.x - b.x);
  return parts.map((p) => p.str).join(' ').trim();
}

function officerFromItems(items) {
  const label = findLabel(items, [/Inspection Officer/i, /巡查人員/]);
  if (!label) return '';
  const post = findLabel(items, [/^Post\b/i, /職位/]);
  const maxX = post ? post.x - 2 : label.x + 220;
  const name = textRightOf(items, label, {
    maxX,
    allow: (it) =>
      /[A-Za-z]/.test(it.str) &&
      !/Inspection|Officer|巡查|人員|Post|職位/.test(it.str),
  });
  return name.replace(/\s+/g, ' ').trim();
}

function fileRefFromItems(items) {
  const label = findLabel(items, [/File Ref/i, /檔案編號/]);
  if (!label) return '';
  const freq = findLabel(items, [/Inspection Frequency/i, /巡查週期/]);
  const timeSpent = findLabel(items, [/Inspection Time Spent/i, /是次巡查所用時間/]);
  let maxX = label.x + 280;
  for (const stop of [freq, timeSpent]) {
    if (stop && stop.y < label.y - 8) continue; // different row below
    if (stop && stop.x > label.x) maxX = Math.min(maxX, stop.x - 2);
  }
  const val = textRightOf(items, label, {
    maxX,
    allow: (it) =>
      /[A-Z0-9\-]/i.test(it.str) &&
      !/File\s*Ref|檔案編號|Inspection|Frequency|Time Spent/i.test(it.str),
  });
  const m = val.match(/[A-Z0-9][A-Z0-9\-]{4,}/i);
  return m ? m[0] : val;
}


const TRIAGE_CANON = { black: 'Black', red: 'Red', orange: 'Orange', yellow: 'Yellow', nil: 'NIL' };
const NO_TRIAGE_CANON = 'No Triage colour';
const NO_TRIAGE_RE = /^no\s+triage\s+colou?r$/i;
const NO_TRIAGE_ZH_RE = /^(沒有|無|不)分流顏色$/;
const TRIAGE_VALUE_RE = 'No\\s+Triage\\s+colou?r|沒有分流顏色|無分流顏色|不分流顏色|Black|Red|Orange|Yellow|NIL';

/**
 * Normalize a triage colour token to Black / Red / Orange / Yellow / NIL
 * or "No Triage colour". Returns '' for anything else so nearby words
 * (including a lone "No") are not treated as a colour.
 */
export function normalizeTriageColour(value) {
  const collapsed = String(value || '').trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  if (NO_TRIAGE_RE.test(collapsed) || NO_TRIAGE_ZH_RE.test(collapsed.replace(/\s+/g, ''))) {
    return NO_TRIAGE_CANON;
  }
  return TRIAGE_CANON[collapsed.toLowerCase()] || '';
}

export function extractTriageColourFromItems(items) {
  const label = findLabel(items, [/^Triage Colou?r/i, /^分流顏色/]);
  if (!label) return '';
  const cands = items.filter((it) => {
    if (it === label) return false;
    if (!normalizeTriageColour(it.str)) return false;
    const dy = Math.abs(it.y - label.y);
    const dx = it.x - label.x;
    return dy <= 22 && dx >= 4 && dx <= 220;
  });
  cands.sort((a, b) => {
    const da = Math.hypot(a.x - label.x, a.y - label.y);
    const db = Math.hypot(b.x - label.x, b.y - label.y);
    return da - db;
  });
  if (cands[0]) return normalizeTriageColour(cands[0].str);

  // Value may be split across tokens, e.g. "No" + "Triage" + "colour".
  const nearby = items
    .filter((it) => {
      if (it === label) return false;
      const dy = Math.abs(it.y - label.y);
      const dx = it.x - label.x;
      return dy <= 22 && dx >= 4 && dx <= 220;
    })
    .sort((a, b) => a.x - b.x || b.y - a.y);
  let acc = '';
  for (const it of nearby) {
    acc = acc ? `${acc} ${it.str}` : it.str;
    const n = normalizeTriageColour(acc);
    if (n) return n;
  }
  return '';
}

/**
 * Flat-text fallback: only accept the known colours / "No Triage colour"
 * near the label. Handles label-then-value (including pdf.js order with
 * other fields in between) and value-then-label.
 */
export function extractTriageColourFromFlatText(text) {
  const clean = String(text).replace(/\s+/g, ' ');
  const patterns = [
    new RegExp(`(?<!No\\s)Triage Colou?r(?:\\s*分流顏色)?[\\s\\S]{0,220}?(${TRIAGE_VALUE_RE})`, 'i'),
    new RegExp(`分流顏色[\\s\\S]{0,220}?(${TRIAGE_VALUE_RE})`, 'i'),
    new RegExp(`(${TRIAGE_VALUE_RE})(?:\\s+\\S+){0,8}\\s+(?:Triage Colou?r|分流顏色)`, 'i'),
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m) return normalizeTriageColour(m[1]);
  }
  return '';
}

/**
 * Light normalize for Tree Species comparison: trim and collapse whitespace.
 * Display should keep the extracted spelling / capitalization.
 */
export function normalizeSpeciesForCompare(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

/**
 * Drop a trailing 「/中文名」 or 「／中文名」 vernacular (spaces around the slash OK).
 * Only strips when the segment after the last slash contains CJK characters.
 * Used for comparison only; display should keep the original Excel text.
 */
function stripTrailingChineseVernacular(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const m = raw.match(/^(.*)[\/\uFF0F]([^\/\uFF0F]*)$/);
  if (m && CJK_RE.test(m[2])) return m[1].trim();
  return raw;
}

/**
 * Comparison key for a Tree Species value: scientific name only,
 * lowercased, with whitespace, punctuation, and hybrid ×/x normalized.
 */
export function scientificNameForCompare(value) {
  let s = stripTrailingChineseVernacular(value);
  if (!s) return '';
  s = s.normalize('NFKC');
  s = s.replace(/[\u00D7\u2715\u2716]/g, ' x ');
  s = s.toLowerCase();
  s = s.replace(/[.,;:!?()[\]{}<>'"`~_\-–—]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** True when two Tree Species values share the same scientific name. */
export function speciesScientificNamesMatch(a, b) {
  return scientificNameForCompare(a) === scientificNameForCompare(b);
}

export function isExcelSpeciesHeader(header) {
  const s = String(header || '').replace(/\s+/g, ' ').trim();
  return /樹種/.test(s) || /tree\s*species/i.test(s) || /^species\b/i.test(s);
}

const SPECIES_LABEL_TOKEN =
  /^(Tree|Species|Triage|Colou?r|Height|Crown|Spread|Dept\.?|ID|TMCP|Location|Inspection|Officer|Aggregated|DBH|Trunks?|Status|Black|Red|Orange|Yellow|NIL|No\.?|of|Information|樹種|分流顏色|部門樹木編號|TMCP樹木編號|樹高|樹冠闊度)$/i;

function isSpeciesValueToken(str) {
  const s = String(str || '').trim();
  if (!s) return false;
  if (SPECIES_LABEL_TOKEN.test(s)) return false;
  if (/[A-Z]{2,}\d*-T\d+/i.test(s)) return false;
  if (/^\d+(?:\.\d+)?$/.test(s)) return false;
  if (/^20種需特別注意/.test(s)) return false;
  if (!/[A-Za-z\u00C0-\u024F\u4e00-\u9fff]/.test(s) && !/^[x\u00D7]$/i.test(s)) return false;
  return true;
}

function isPlausibleSpeciesName(value) {
  const v = normalizeSpeciesForCompare(value);
  if (!v || v.length < 3 || v.length > 80) return false;
  if (/[A-Z]{2,}\d*-T\d+/i.test(v)) return false;
  if (
    /\b(Large|Tree|Triage|Height|Crown|Common|requiring|Officer|Location|Department|Species|Inspection|Aggregated)\b/i.test(
      v
    )
  ) {
    return false;
  }
  if (!/[A-Za-z]{3,}/.test(v)) return false;
  return true;
}

function findTreeSpeciesLabel(items) {
  const combined = findLabel(items, [/^Tree\s*Species$/i, /Tree\s+Species/i]);
  if (combined) return combined;

  const speciesWord = items.find((it) => /^Species$/i.test(it.str));
  if (speciesWord) {
    const treeWord = items.find(
      (it) =>
        /^Tree$/i.test(it.str) &&
        Math.abs(it.y - speciesWord.y) <= 8 &&
        speciesWord.x - it.x > 0 &&
        speciesWord.x - it.x < 50
    );
    if (treeWord) return { str: 'Tree Species', x: treeWord.x, y: treeWord.y };
  }

  return findLabel(items, [/^樹種$/]);
}

/**
 * Coordinate extraction: value to the right of Tree Species / 樹種 on page 1.
 * Stops before the Triage Colour column so Orange / Tree ID / location / officer
 * are not captured. Handles split "Tree"+"Species" labels and a single
 * "Michelia x alba" item or separate tokens.
 */
export function extractTreeSpeciesFromItems(items) {
  const label = findTreeSpeciesLabel(items);
  if (!label) return '';
  const triageLabel = findLabel(items, [/^Triage/i, /^分流顏色/, /^Colou?r$/i]);
  let maxX = label.x + 200;
  if (triageLabel && triageLabel.x > label.x) maxX = Math.min(maxX, triageLabel.x - 2);
  const val = textRightOf(items, label, {
    maxDy: 12,
    minDx: 4,
    maxX,
    allow: (it) => isSpeciesValueToken(it.str),
  });
  return normalizeSpeciesForCompare(val);
}

/**
 * Flat-text fallback for Tree Species.
 * Handles label-then-value (including 樹種 between label and name, and
 * stopping before "Large Tree") and value-then-label (pdf.js order).
 * Ignores the footnote "20 Common Tree Species requiring special attention".
 */
export function extractTreeSpeciesFromFlatText(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const tokens = clean.split(/\s+/).filter(Boolean);

  const stopWord = new Set([
    'tree', 'species', 'triage', 'colour', 'color', 'height', 'crown', 'spread',
    'large', 'dept', 'dept.', 'id', 'tmcp', 'location', 'inspection', 'officer',
    'aggregated', 'dbh', 'no', 'no.', 'of', 'trunk', 'trunks', 'trunk(s)',
    'status', 'black', 'red', 'orange', 'yellow', 'nil', 'information',
    'department', 'common', 'requiring', 'special', 'attention',
  ]);

  const take = (start, direction) => {
    const out = [];
    for (let i = start; i >= 0 && i < tokens.length; i += direction) {
      const t = tokens[i].replace(/[(),:]+/g, '');
      if (!t) break;
      if (/[\u4e00-\u9fff]/.test(t) && !/[A-Za-z]/.test(t)) break;
      if (stopWord.has(t.toLowerCase())) break;
      if (/[A-Z]{2,}\d*-T\d+/i.test(t)) break;
      if (/^\d+(?:\.\d+)?$/.test(t)) break;
      if (
        !/[A-Za-z\u00C0-\u024F]/.test(t) &&
        !/^[x\u00D7]$/i.test(t) &&
        !/^(var\.|subsp\.|ssp\.|cv\.|f\.|sp\.)$/i.test(t)
      ) {
        break;
      }
      if (direction === 1) out.push(tokens[i]);
      else out.unshift(tokens[i]);
      if (out.length >= 6) break;
    }
    const s = normalizeSpeciesForCompare(out.join(' '));
    return isPlausibleSpeciesName(s) ? s : '';
  };

  const around = (labelIdx, labelLen) => take(labelIdx + labelLen, 1) || take(labelIdx - 1, -1);

  for (let i = 0; i < tokens.length; i++) {
    if (/^Tree$/i.test(tokens[i]) && tokens[i + 1] && /^Species$/i.test(tokens[i + 1])) {
      const prev = tokens[i - 1] || '';
      const prev2 = tokens[i - 2] || '';
      if (/^Common$/i.test(prev) || (/^\d+$/.test(prev2) && /^Common$/i.test(prev))) continue;
      const got = around(i, 2);
      if (got) return got;
    }
    if (/^樹種$/.test(tokens[i])) {
      const got = around(i, 1);
      if (got) return got;
    }
  }
  return '';
}

/**
 * Flat-text fallbacks for Date / Time / Last Inspection Date / Officer / File Ref.
 * Handles BOTH orders: label then 27/12/2025 09 30, AND 27/12/2025 09 30 then label.
 * Does not treat Last Inspection Date as the inspection date, or
 * Inspection Time Spent / Frequency as the time.
 */
export function extractInspectionFieldsFromFlatText(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  let date = '';
  let time = '';
  let last_insp_date = '';
  let officer = '';
  let file_ref = '';

  // Value then label (pdf.js-style or compact)
  let m = clean.match(
    /(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{1,2})[:\s]+(\d{2}))?\s+(?:Date and Time of Inspection|巡查日期及時間)/i
  );
  if (m) {
    date = m[1];
    if (m[2] != null && isValidHourMinute(m[2], m[3])) time = padTime(m[2], m[3]);
  }

  // Label then date, without jumping over "Last Inspection Date"
  if (!date) {
    m = clean.match(
      /Date and Time of Inspection(?:\s*巡查日期及時間)?\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{1,2})[:\s]+(\d{2}))?/i
    );
    if (m) {
      date = m[1];
      if (m[2] != null && isValidHourMinute(m[2], m[3])) time = padTime(m[2], m[3]);
    }
  }
  if (!date) {
    m = clean.match(
      /巡查日期及時間\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{1,2})[:\s]+(\d{2}))?/i
    );
    if (m) {
      date = m[1];
      if (m[2] != null && isValidHourMinute(m[2], m[3])) time = padTime(m[2], m[3]);
    }
  }

  // Last Inspection Date (label then value, or value then label)
  m = clean.match(/Last Inspection Date(?:\s*上次巡查日期)?\s+(\d{2}\/\d{2}\/\d{4})/i)
    || clean.match(/上次巡查日期\s+(\d{2}\/\d{2}\/\d{4})/)
    || clean.match(/(\d{2}\/\d{2}\/\d{4})\s+(?:Last Inspection Date|上次巡查日期)/i);
  if (m) last_insp_date = m[1];

  // If the two dates collided (same token captured twice), try the other dd/mm/yyyy
  if (date && last_insp_date && date === last_insp_date) {
    const all = [...clean.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map((x) => x[1]);
    const other = all.find((d) => d !== date);
    if (other) last_insp_date = other;
  }

  // Time from the (hr)(min) boxes — do not use "0.5 hr" or "12 months"
  if (!time) {
    const timePatterns = [
      /\(hr\)\s+(\d{1,2})\s+(\d{2})\s+\(min\)/i,
      /(\d{1,2})\s+\(hr\)\s+(\d{1,2})\s+\(min\)/i,
      /\(hr\)\s+(\d{1,2})\s+\(min\)\s+(\d{2})/i,
      /(\d{1,2})\s+(\d{2})\s+\(hr\)\s+\(min\)/i,
    ];
    for (const re of timePatterns) {
      m = clean.match(re);
      if (m && isValidHourMinute(m[1], m[2])) {
        time = padTime(m[1], m[2]);
        break;
      }
    }
  }

  // Compact "27/12/2025 09 30" / "27/12/2025 09:30" near the inspection date
  if (!time && date) {
    const re = new RegExp(
      `${date.replace(/\//g, '\\/')}\\s+(\\d{1,2})[:\\s]+(\\d{2})(?!\\d)`
    );
    m = clean.match(re);
    if (m && isValidHourMinute(m[1], m[2])) time = padTime(m[1], m[2]);
  }

  officer = officerFromFlatText(clean);

  m = clean.match(/File Ref\.?\s*檔案編號\s+([A-Z0-9][A-Z0-9\-]+)/i)
    || clean.match(/File Ref\.?[^\w]*([A-Z][A-Z0-9\-]{4,})/i)
    || clean.match(/([A-Z][A-Z0-9\-]{6,})\s+File Ref/i);
  if (m) file_ref = m[1];

  return { date, time, last_insp_date, officer, file_ref };
}

function officerFromFlatText(clean) {
  let m = clean.match(
    /Inspection Officer(?:\s*巡查人員)?\s+([A-Za-z][A-Za-z0-9.\-']+(?:\s+[A-Za-z][A-Za-z0-9.\-']+){0,4})\s+(?:Post|職位)/i
  );
  if (m) return m[1].trim();

  const idx = clean.search(/Inspection Officer/i);
  if (idx > 0) {
    const before = clean.slice(Math.max(0, idx - 80), idx).trim();
    const tokens = before.split(/\s+/);
    const nameToks = [];
    const stop = /^(Department|Agency|機構|部門|Housing|Project|Contract|No\.?|工程|合約編號?|General|Information|基本資料)$/i;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (stop.test(tokens[i]) || !/^[A-Za-z][A-Za-z0-9.\-']*$/.test(tokens[i])) break;
      nameToks.unshift(tokens[i]);
      if (nameToks.length >= 5) break;
    }
    if (nameToks.length) return nameToks.join(' ');
  }
  return '';
}

export function extractInspectionFieldsFromItems(items, flat = null) {
  const text = flat ?? items.map((i) => i.str).join(' ');
  const dateLabel = findLabel(items, [/Date and Time of Inspection/i, /巡查日期及時間/]);
  const lastLabel = findLabel(items, [/^Last Inspection Date/i, /上次巡查日期/]);
  const hrLabel = findLabel(items, [/^\(hr\)$/i]);
  const minLabel = findLabel(items, [/^\(min\)$/i]);

  let date = nearestDate(items, dateLabel, {
    maxX: lastLabel ? lastLabel.x - 4 : Infinity,
  });
  let last_insp_date = nearestDate(items, lastLabel, {
    minX: lastLabel ? lastLabel.x + 2 : -Infinity,
  });

  let time = '';
  const hour = nearestTimePart(items, hrLabel, 23);
  const minute = nearestTimePart(items, minLabel, 59);
  if (hour != null && minute != null && isValidHourMinute(hour, minute)) {
    time = padTime(hour, minute);
  }
  if (!time) time = timeRightOfDate(items, date, lastLabel);

  let officer = officerFromItems(items);
  let file_ref = fileRefFromItems(items);

  const fb = extractInspectionFieldsFromFlatText(text);
  if (!date) date = fb.date;
  if (!time) time = fb.time;
  if (!last_insp_date) last_insp_date = fb.last_insp_date;
  if (!officer) officer = fb.officer;
  if (!file_ref) file_ref = fb.file_ref;

  return { date, time, last_insp_date, officer, file_ref };
}

function extractTreeId(items, flat, filename = '') {
  let treeId = '';
  const filenameMatch = String(filename).match(/([A-Z0-9]+-T\d+)/i);
  if (filenameMatch) treeId = filenameMatch[1].toUpperCase();

  if (!treeId) {
    const dept = findLabel(items, [/^Dept\.?\s*Tree ID/i, /部門樹木編號/]);
    if (dept) {
      const nearby = items
        .filter((it) => /[A-Z]{2,}\d*-T\d+/i.test(it.str) && Math.abs(it.y - dept.y) <= 25)
        .sort((a, b) => Math.hypot(a.x - dept.x, a.y - dept.y) - Math.hypot(b.x - dept.x, b.y - dept.y));
      if (nearby[0]) treeId = nearby[0].str.match(/[A-Z]{2,}\d*-T\d+/i)[0].toUpperCase();
    }
  }

  if (!treeId) {
    const m = flat.match(/\b([A-Z]{2,}\d*-T\d{3,})\b/i);
    if (m) treeId = m[1].toUpperCase();
  }
  return treeId;
}

/**
 * Text fallbacks for when coordinates are missing (e.g. odd PDF producers).
 * Handles both pdf.js order (value before label) and pdftotext -layout
 * (labels then three values).
 */
export function extractMetricsFromFlatText(text, filename = '') {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  let height = 0;
  let spread = 0;
  let dbh = 0;

  // Layout row: labels then 18 6 1
  let m = clean.match(
    /Tree Height\s*\(m\)\s*Crown Spread\s*\(m\)\s*No\.\s*of Trunk\s*\(s\)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+)/i
  );
  if (m) {
    height = parseFloat(m[1]);
    spread = parseFloat(m[2]);
  }

  // pdf.js order: 18 Tree Height(m) ... 6 Crown Spread(m)
  if (!height) {
    m = clean.match(/(\d+(?:\.\d+)?)\s*Tree Height/i);
    if (m) height = parseFloat(m[1]);
  }
  if (!height) {
    m = clean.match(/Tree Height[^\d]{0,40}?(\d+(?:\.\d+)?)/i);
    // Avoid capturing Crown Spread's following digits when labels are adjacent:
    // only accept if the match window does not contain "Crown Spread" before the number
    if (m) {
      const between = clean.slice(m.index, m.index + m[0].length);
      if (!/Crown Spread/i.test(between)) height = parseFloat(m[1]);
    }
  }

  if (!spread) {
    m = clean.match(/(\d+(?:\.\d+)?)\s*Crown Spread/i);
    if (m) spread = parseFloat(m[1]);
  }
  if (!spread) {
    // Do NOT use Crown Spread[^\d]*(\d+) — that grabs Height's 18 when labels precede values.
    m = clean.match(/Crown Spread\s*\(m\)[^\d]{0,80}?No\.\s*of Trunk[^\d]{0,40}?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
    // weaker: number immediately after Chinese label row is unreliable; skip
  }

  // Aggregated DBH: prefer value immediately after label; avoid "1 Aggregated" trunk index
  m = clean.match(/Aggregated DBH\s*\(mm\)\s*(\d{2,4})\b/i);
  if (m) dbh = parseFloat(m[1]);
  if (!dbh) {
    m = clean.match(/\b(\d{2,4})\s+Aggregated DBH/i);
    if (m) dbh = parseFloat(m[1]);
  }
  if (!dbh) {
    m = clean.match(/總胸徑[^\d]{0,20}(\d{2,4})/);
    if (m) dbh = parseFloat(m[1]);
  }

  const treeId = extractTreeId([], clean, filename);
  const insp = extractInspectionFieldsFromFlatText(clean);
  const triage = extractTriageColourFromFlatText(clean);
  const species = extractTreeSpeciesFromFlatText(clean);
  return { treeId, height, spread, dbh, triage, species, ...insp };
}

export function extractMetricsFromItems(items, filename = '') {
  const flat = items.map((i) => i.str).join(' ');

  const heightLabel = findLabel(items, [/^Tree Height/i, /^樹高/]);
  const spreadLabel = findLabel(items, [/^Crown Spread/i, /^樹冠闊度/]);
  const aggLabel = findLabel(items, [/^Aggregated DBH/i, /^總胸徑/]);

  let height = nearestNumber(items, heightLabel, { maxDy: 18, maxDx: 160, minVal: 0.5, maxVal: 80 });
  let spread = nearestNumber(items, spreadLabel, { maxDy: 18, maxDx: 160, minVal: 0.5, maxVal: 80 });
  let dbh = nearestNumber(items, aggLabel, { maxDy: 22, maxDx: 160, minVal: 20, maxVal: 5000 });

  let triage = extractTriageColourFromItems(items);
  let species = extractTreeSpeciesFromItems(items);

  // Fall back to flat-text rules if coordinates miss
  const fb = extractMetricsFromFlatText(flat, filename);
  if (!height) height = fb.height;
  if (!spread) spread = fb.spread;
  if (!dbh) dbh = fb.dbh;
  if (!triage) triage = fb.triage;
  if (!species) species = fb.species;

  const insp = extractInspectionFieldsFromItems(items, flat);
  const treeId = extractTreeId(items, flat, filename);
  return { treeId, height, spread, dbh, triage, species, ...insp, flat };
}

/**
 * Target Assessment / Risk Categorisation / Mitigation / Notes / overall ratings.
 * Coordinate-based extraction for DEVB TMCP Form 2 (Sep 2023 / JasperReports).
 * Counts are not fixed (0–5 targets, 0–3 risk/mitigation rows).
 */

function collapseWs(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function findItem(items, patterns) {
  for (const p of patterns) {
    const re = typeof p === 'string' ? new RegExp(p, 'i') : p;
    const hit = items.find((it) => re.test(it.str));
    if (hit) return hit;
  }
  return null;
}

function findInPages(pages, patterns) {
  for (const p of pages || []) {
    const hit = findItem(p.items || [], patterns);
    if (hit) return { ...hit, page: p.page, pageItems: p.items || [] };
  }
  return null;
}

function columnBounds(headers, rightX) {
  const xs = headers
    .filter(Boolean)
    .map((h) => h.x)
    .sort((a, b) => a - b)
    .filter((x, i, arr) => i === 0 || x - arr[i - 1] > 8);
  return xs.map((x, i) => ({
    x,
    left: i === 0 ? x - 30 : (xs[i - 1] + x) / 2,
    right: i === xs.length - 1 ? rightX : (x + xs[i + 1]) / 2,
  }));
}

function itemMidX(it) {
  return it.x + (Number(it.w) || 0) / 2;
}

function itemsInXRange(items, left, right) {
  return items.filter((it) => {
    const mid = itemMidX(it);
    return mid >= left && mid < right;
  });
}

function joinVisual(items) {
  return collapseWs(
    [...items]
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((it) => it.str)
      .join(' ')
  );
}

function isPageFooter(it) {
  return /^A4-\d+$/i.test(it.str) || /DEVB TMCP Form/i.test(it.str) || it.y < 25;
}

function sectionItems(pageItems, topY, bottomY) {
  return pageItems.filter((it) => it.y < topY && it.y > bottomY && !isPageFooter(it));
}

function rowAnchors(items, col0, minY, maxY, maxRows) {
  const nums = items.filter((it) => {
    if (!/^[1-5]$/.test(it.str)) return false;
    const mid = itemMidX(it);
    if (mid < col0.left || mid >= col0.right) return false;
    if (it.y >= maxY || it.y <= minY) return false;
    return true;
  });
  nums.sort((a, b) => b.y - a.y);
  const limited = nums.slice(0, maxRows);
  return limited.map((a, i) => {
    const prev = limited[i - 1];
    const next = limited[i + 1];
    const top = prev ? (prev.y + a.y) / 2 : Math.min(maxY, a.y + 14);
    const bottom = next ? (next.y + a.y) / 2 : Math.max(minY, a.y - 14);
    return { no: a.str, y: a.y, top, bottom };
  });
}

function cellsForRowClean(items, band, bounds) {
  const inBand = items.filter((it) => it.y < band.top && it.y > band.bottom);
  return bounds.map((b, idx) => {
    const bits = itemsInXRange(inBand, b.left, b.right).filter((it) => {
      if (idx === 0 && /^[1-5]$/.test(it.str)) return false;
      return true;
    });
    return joinVisual(bits);
  });
}

function headerYWindow(headerItems) {
  const ys = headerItems.filter(Boolean).map((h) => h.y);
  if (!ys.length) return { top: Infinity, bottom: -Infinity };
  return { top: Math.max(...ys) + 6, bottom: Math.min(...ys) - 22 };
}

export function extractTargetAssessmentSummary(pages) {
  const overall = extractOverallRatings(pages);
  return {
    targets: extractTargetAssessmentRows(pages),
    risks: extractRiskCategorisationRows(pages),
    mitigations: extractMitigationRows(pages),
    notes: extractNotes(pages),
    overallTreeRisk: overall.tree,
    overallResidualRisk: overall.residual,
    nextInspectionDate: extractNextInspectionDate(pages),
  };
}

function extractTargetAssessmentRows(pages) {
  const title = findInPages(pages, [/Target Assessment/i, /目標物評估/]);
  if (!title) return [];
  const items = title.pageItems;
  const stop = findItem(items, [/Site Conditions/i, /場地狀況/]);
  const bottomY = stop ? stop.y : 30;
  const region = sectionItems(items, title.y - 1, bottomY);
  const hNo = findItem(region, [/^Target No\.?$/i, /目標物編號/]);
  const hDesc = findItem(region, [/Target Description/i, /目標物的描述/]);
  const hZone = findItem(region, [/^Target Zone$/i, /目標物範圍/]);
  const hOcc = findItem(region, [/Occupancy rate/i, /^佔用率$/]);
  const hRemove = findItem(region, [/Remove target/i, /可否移除目標物/]);
  const hRestrict = findItem(region, [/^Restrict$/i, /^usage\?$/i, /可否限制使用/]);
  const headers = [hNo, hDesc, hZone, hOcc, hRemove, hRestrict];
  if (headers.filter(Boolean).length < 4) return [];
  const bounds = columnBounds(headers, 595);
  const hy = headerYWindow(headers);
  const anchors = rowAnchors(region, bounds[0], bottomY, hy.bottom, 5);
  return anchors
    .map((band) => {
      const cells = cellsForRowClean(region, band, bounds);
      const row = {
        no: band.no,
        description: cells[1] || '',
        zone: cells[2] || '',
        occupancy: cells[3] || '',
        remove: cells[4] || '',
        restrict: cells[5] || '',
      };
      const filled = row.description || row.zone || row.occupancy || row.remove || row.restrict;
      return filled ? row : null;
    })
    .filter(Boolean);
}

function extractRiskCategorisationRows(pages) {
  const title = findInPages(pages, [/Risk Categorisation/i, /風險類別/]);
  if (!title) return [];
  const items = title.pageItems;
  const stop = findItem(items, [
    /^\* For tree obtained/i,
    /當風險評級組合的結果/,
    /^Matrix 1:/i,
  ]);
  const bottomY = stop ? stop.y : 30;
  const region = sectionItems(items, title.y - 1, bottomY);
  const hNo = findItem(region, [/^Target No\.?$/i, /目標物編號/]);
  const hPart = findItem(region, [/^Tree Part$/i, /^樹木部分$/]);
  const hCond = findItem(region, [/Condition\(s\) of Concern/i, /關注狀況/]);
  const hSize = findItem(region, [/^Part Size$/i, /部位大小/]);
  const hFall = findItem(region, [/^Fall Distance$/i, /下墜距離/]);
  const hFail = findItem(region, [/^Failure$/i, /^倒塌$/]);
  const hImpact = findItem(region, [/^Impact$/i, /^影響$/]);
  const hFI = findItem(region, [/Failure and Impact/i, /倒塌並影響/]);
  const hCons = findItem(region, [/^Consequences$/i, /^後果$/]);
  const hRisk = findItem(region, [/^Risk rating$/i, /^風險評級$/]);
  const headers = [hNo, hPart, hCond, hSize, hFall, hFail, hImpact, hFI, hCons, hRisk];
  if (headers.filter(Boolean).length < 8) return [];
  const bounds = columnBounds(headers, 595);
  const hy = headerYWindow(headers);
  // Subheaders such as "(Matrix 1 :" sit below the main header row; keep data below them.
  const headerBlockBottom = Math.min(hy.bottom, ...region.filter((it) => it.y < hy.top && it.y > (stop ? stop.y : 30) && /Matrix 1|可能性組合|Likelihood matrix/i.test(it.str)).map((it) => it.y - 2), hy.bottom);
  const anchors = rowAnchors(region, bounds[0], bottomY, headerBlockBottom, 3);
  return anchors
    .map((band) => {
      const cells = cellsForRowClean(region, band, bounds);
      const row = {
        no: band.no,
        treePart: cells[1] || '',
        condition: cells[2] || '',
        partSize: cells[3] || '',
        fallDistance: cells[4] || '',
        failure: cells[5] || '',
        impact: cells[6] || '',
        failureAndImpact: cells[7] || '',
        consequences: cells[8] || '',
        riskRating: cells[9] || '',
      };
      const filled = row.treePart || row.condition || row.partSize || row.failure;
      return filled ? row : null;
    })
    .filter(Boolean);
}

function extractMitigationRows(pages) {
  const title = findInPages(pages, [/Mitigation Measures\s*緩減措施/i]);
  if (!title) return [];
  const items = title.pageItems;
  const stop = findItem(items, [
    /^\*The level of "Residual Risk"/i,
    /當執行針對/,
    /Notes, explanations/i,
    /supplmentary Information/i,
    /說明、註解、描述及補充資料/,
  ]);
  const bottomY = stop ? stop.y : 30;
  const region = sectionItems(items, title.y - 1, bottomY);
  const hNo = findItem(region, [/^Target No\.?$/i, /目標物編號/]);
  const hPart = findItem(region, [/^Tree Part$/i, /^樹木部分$/]);
  const hMeas = findItem(region, [/^Mitigation Measures$/i, /^緩減措施$/]);
  const hDate = findItem(region, [/Anticipated Completion/i, /預算完成日期/, /^Date$/]);
  const hRes = findItem(region, [/Residual Risk/i, /剩餘風險/]);
  const headers = [hNo, hPart, hMeas, hDate, hRes];
  if (headers.filter(Boolean).length < 4) return [];
  const bounds = columnBounds(headers, 595);
  const hy = headerYWindow(headers);
  const anchors = rowAnchors(region, bounds[0], bottomY, hy.bottom, 3);
  return anchors
    .map((band) => {
      const cells = cellsForRowClean(region, band, bounds);
      const row = {
        no: band.no,
        treePart: cells[1] || '',
        measures: cells[2] || '',
        completionDate: cells[3] || '',
        residualRisk: cells[4] || '',
      };
      const filled = row.treePart || row.measures || row.completionDate || row.residualRisk;
      return filled ? row : null;
    })
    .filter(Boolean);
}

function extractNotes(pages) {
  const title = findInPages(pages, [
    /supplmentary Information/i,
    /Notes, explanations/i,
    /說明、註解、描述及補充資料/,
  ]);
  if (!title) return '';
  const stop = findItem(title.pageItems, [
    /^Advanced assessment$/i,
    /Overall tree risk/i,
    /進一步檢查/,
    /綜合樹木風險/,
  ]);
  const bottomY = stop ? stop.y : 30;
  const bits = title.pageItems.filter(
    (it) => it.y < title.y - 2 && it.y > bottomY && !isPageFooter(it)
  );
  return joinVisual(bits);
}

const OVERALL_RATING_RE = /^(Low|Moderate|High|Extreme|低|中|高|極高)$/i;

function extractOverallRatings(pages) {
  const treeLbl = findInPages(pages, [/^Overall tree risk$/i, /綜合樹木風險/]);
  const residualLbl = treeLbl
    ? findItem(treeLbl.pageItems, [/^Overall residual risk$/i, /綜合剩餘風險/])
    : findInPages(pages, [/^Overall residual risk$/i, /綜合剩餘風險/]);
  if (!treeLbl && !residualLbl) return { tree: '', residual: '' };
  const pageItems = treeLbl?.pageItems || residualLbl.pageItems;
  const label = treeLbl || residualLbl;
  const stop = findItem(pageItems, [/Inspection limitations/i, /檢查限制/, /Next inspection date/i, /下次檢查日期/]);
  const bottomY = stop ? stop.y : label.y - 80;
  const splitX = residualLbl && treeLbl ? (treeLbl.x + residualLbl.x) / 2 : 80;
  const maxX = 210;
  const vals = pageItems.filter(
    (it) =>
      OVERALL_RATING_RE.test(it.str) &&
      it.y < (label.y - 4) &&
      it.y > bottomY &&
      it.x < maxX
  );
  vals.sort((a, b) => a.x - b.x);
  let tree = '';
  let residual = '';
  for (const v of vals) {
    if (v.x + (v.w || 0) / 2 < splitX) tree = tree || collapseWs(v.str);
    else residual = residual || collapseWs(v.str);
  }
  if (!tree && vals[0]) tree = collapseWs(vals[0].str);
  if (!residual && vals[1]) residual = collapseWs(vals[1].str);
  return { tree, residual };
}

function extractNextInspectionDate(pages) {
  const label = findInPages(pages, [/Next inspection date/i, /下次檢查日期/]);
  if (!label) return '';
  const cands = label.pageItems.filter((it) => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(it.str)) return false;
    if (it.y >= label.y) return false;
    if (it.y < label.y - 60) return false;
    return true;
  });
  cands.sort((a, b) => {
    const da = Math.hypot(Math.max(0, label.x - a.x), label.y - a.y);
    const db = Math.hypot(Math.max(0, label.x - b.x), label.y - b.y);
    return da - db;
  });
  return cands[0] ? cands[0].str : '';
}


/**
 * Browser / Node helper: read first page items via an already-configured pdfjsLib.
 * Also reads later pages for Target Assessment / Risk / Mitigation / Notes.
 */
export async function extractForm2Metrics(pdfjsLib, data, filename = '') {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const c = await p.getTextContent();
    pages.push({ page: i, items: itemsFromTextContent(c) });
  }
  const first = pages[0]?.items || [];
  const metrics = extractMetricsFromItems(first, filename);
  const assessment = extractTargetAssessmentSummary(pages);
  // Keep a multi-page flat string for callers that still need raw text elsewhere
  let fullText = (metrics.flat || '') + '\n';
  for (let i = 1; i < pages.length; i++) {
    fullText += pages[i].items.map((it) => it.str).join(' ') + '\n';
  }
  return { ...metrics, ...assessment, text: fullText, pageCount: pdf.numPages };
}

/** Same person may complete at most this many Form 2s per inspection date. */
export const DAILY_FORM2_LIMIT = 15;

const MISSING_TOKENS = new Set(['', 'unknown', '-', '—', '未能提取', '未提取到', 'n/a', 'na']);

/**
 * Light name normalize for grouping only: trim + collapse internal whitespace.
 * Comparison is exact after this; no fuzzy / case folding.
 */
export function normalizeOfficerName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeDateToken(date) {
  return String(date ?? '').trim();
}

function isMissingToken(value) {
  return MISSING_TOKENS.has(String(value ?? '').trim().toLowerCase());
}

/**
 * True when officer or inspection date is missing / unusable for a quota group.
 * Treats empty values and placeholders such as "Unknown" as missing.
 */
export function isMissingOfficerOrDate(officer, date) {
  return isMissingToken(normalizeOfficerName(officer)) || isMissingToken(normalizeDateToken(date));
}

/**
 * Quota group key: normalized Inspection Officer + inspection date
 * (Date and Time of Inspection), or null if either field is missing.
 */
export function dailyOfficerDateKey(officer, date) {
  const o = normalizeOfficerName(officer);
  const d = normalizeDateToken(date);
  if (isMissingToken(o) || isMissingToken(d)) return null;
  return `${o}||${d}`;
}

function compareDmy(a, b) {
  const pa = String(a).split('/');
  const pb = String(b).split('/');
  if (pa.length === 3 && pb.length === 3) {
    const ta = `${pa[2]}-${pa[1]}-${pa[0]}`;
    const tb = `${pb[2]}-${pb[1]}-${pb[0]}`;
    if (ta !== tb) return ta.localeCompare(tb);
  }
  return String(a).localeCompare(String(b));
}

function firstDisplaySpelling(raw) {
  return String(raw ?? '').trim();
}

/**
 * Count Form 2s by Inspection Officer + inspection date.
 * @param {Array<{officer?: string, date?: string, filename?: string, treeId?: string, tree_id?: string}>} records
 * @param {number} [limit=15]
 * @returns {{groups: Array<{officer: string, date: string, count: number, overLimit: boolean, items: object[], key: string}>, missing: object[], limit: number, overLimitGroups: object[]}}
 */
export function summarizeDailyOfficerCounts(records, limit = DAILY_FORM2_LIMIT) {
  const cap = Number.isFinite(limit) ? limit : DAILY_FORM2_LIMIT;
  const groupsMap = new Map();
  const missing = [];

  for (const rec of records || []) {
    const rawOfficer = rec?.officer;
    const rawDate = rec?.date;
    if (isMissingOfficerOrDate(rawOfficer, rawDate)) {
      missing.push(rec);
      continue;
    }
    const key = dailyOfficerDateKey(rawOfficer, rawDate);
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        officer: firstDisplaySpelling(rawOfficer),
        date: normalizeDateToken(rawDate),
        count: 0,
        overLimit: false,
        items: [],
        key,
      });
    }
    const group = groupsMap.get(key);
    group.items.push(rec);
    group.count += 1;
  }

  const groups = [...groupsMap.values()].map((g) => ({
    ...g,
    overLimit: g.count > cap,
  }));

  groups.sort((a, b) => {
    if (a.overLimit !== b.overLimit) return a.overLimit ? -1 : 1;
    const byOfficer = a.officer.localeCompare(b.officer, 'en');
    if (byOfficer) return byOfficer;
    return compareDmy(a.date, b.date);
  });

  return {
    groups,
    missing,
    limit: cap,
    overLimitGroups: groups.filter((g) => g.overLimit),
  };
}

export function isOverLimitRecord(summary, officer, date) {
  const key = dailyOfficerDateKey(officer, date);
  if (!key || !summary) return false;
  return (summary.groups || []).some((g) => g.overLimit && g.key === key);
}

function defaultEscapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

function quotaItemLabel(it) {
  const id = it?.treeId || it?.tree_id || '';
  const fn = it?.filename || '';
  if (id && fn) return `${id}（${fn}）`;
  return id || fn || '';
}

/**
 * HTML for the daily Form 2 quota summary table (zh-HK).
 * Always includes columns 巡查人員 / 巡檢日期 / 份數 / 是否超限.
 */
export function renderDailyQuotaSummaryHtml(summary, escapeHtml = defaultEscapeHtml) {
  const esc = escapeHtml || defaultEscapeHtml;
  const groups = summary?.groups || [];
  const missing = summary?.missing || [];
  const limit = summary?.limit ?? DAILY_FORM2_LIMIT;
  const over = (summary?.overLimitGroups || groups.filter((g) => g.overLimit)).length;

  let html = `<div class="quota-summary">
    <div class="summary-box">
      每日份數上限：同一巡查人員於同一<strong>巡檢日期</strong>（Date and Time of Inspection／巡查日期及時間）最多 <strong>${limit}</strong> 份 Form 2；不以「完成表格2日期」計算。<br>
      超限組別：<strong class="${over ? 'mismatch' : 'match'}">${over}</strong>
      　｜　未能提取人員或日期：<strong>${missing.length}</strong>
    </div>
    <table><thead><tr>
      <th>巡查人員</th><th>巡檢日期</th><th>份數</th><th>是否超限</th><th>樹木／檔名</th>
    </tr></thead><tbody>`;

  if (!groups.length) {
    html += `<tr><td colspan="5" style="color:#6c757d">沒有可計入每日份數的記錄（須同時提取到巡查人員及巡檢日期）。</td></tr>`;
  }

  for (const g of groups) {
    const labels = g.items.map(quotaItemLabel).filter(Boolean).join('、');
    html += `<tr class="${g.overLimit ? 'overlimit-row' : ''}">
      <td>${esc(g.officer)}</td>
      <td>${esc(g.date)}</td>
      <td>${g.count}</td>
      <td>${g.overLimit ? '<span class="badge-conflict">超限</span>' : '否'}</td>
      <td>${esc(labels)}</td>
    </tr>`;
  }
  html += '</tbody></table>';

  if (missing.length) {
    const labels = missing.map(quotaItemLabel).filter(Boolean).join('、');
    html += `<div class="summary-box" style="margin-top:12px;background:#fff3cd;border-color:#ffe69c;">
      未能提取巡查人員或巡檢日期的 Form 2（<strong>${missing.length}</strong> 份）會另外列出，不計入任何每日份數組別，亦不會標為超限。
      ${labels ? `<br>${esc(labels)}` : ''}
    </div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Rows for an Excel "每日份數" sheet: officer, date, count, over-limit flag, tree IDs, filenames.
 */
export function dailyQuotaExportRows(summary) {
  const headers = ['巡查人員', '巡檢日期', '份數', '是否超限', 'Tree ID', '檔名'];
  const rows = (summary?.groups || []).map((g) => [
    g.officer,
    g.date,
    g.count,
    g.overLimit ? '超限' : '否',
    g.items.map((it) => it.treeId || it.tree_id || '').filter(Boolean).join(', '),
    g.items.map((it) => it.filename || '').filter(Boolean).join(', '),
  ]);
  const missing = summary?.missing || [];
  if (missing.length) {
    rows.push([]);
    rows.push(['未能提取', '', missing.length, '否（不計入配額）',
      missing.map((it) => it.treeId || it.tree_id || '').filter(Boolean).join(', '),
      missing.map((it) => it.filename || '').filter(Boolean).join(', '),
    ]);
  }
  return [headers, ...rows];
}
