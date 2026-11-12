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
  return { treeId, height, spread, dbh, ...insp };
}

export function extractMetricsFromItems(items, filename = '') {
  const flat = items.map((i) => i.str).join(' ');

  const heightLabel = findLabel(items, [/^Tree Height/i, /^樹高/]);
  const spreadLabel = findLabel(items, [/^Crown Spread/i, /^樹冠闊度/]);
  const aggLabel = findLabel(items, [/^Aggregated DBH/i, /^總胸徑/]);

  let height = nearestNumber(items, heightLabel, { maxDy: 18, maxDx: 160, minVal: 0.5, maxVal: 80 });
  let spread = nearestNumber(items, spreadLabel, { maxDy: 18, maxDx: 160, minVal: 0.5, maxVal: 80 });
  let dbh = nearestNumber(items, aggLabel, { maxDy: 22, maxDx: 160, minVal: 20, maxVal: 5000 });

  // Fall back to flat-text rules if coordinates miss
  const fb = extractMetricsFromFlatText(flat, filename);
  if (!height) height = fb.height;
  if (!spread) spread = fb.spread;
  if (!dbh) dbh = fb.dbh;

  const insp = extractInspectionFieldsFromItems(items, flat);
  const treeId = extractTreeId(items, flat, filename);
  return { treeId, height, spread, dbh, ...insp, flat };
}

/**
 * Browser / Node helper: read first page items via an already-configured pdfjsLib.
 */
export async function extractForm2Metrics(pdfjsLib, data, filename = '') {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const items = itemsFromTextContent(content);
  const metrics = extractMetricsFromItems(items, filename);
  // Keep a multi-page flat string for callers that still need raw text elsewhere
  let fullText = metrics.flat + '\n';
  for (let i = 2; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const c = await p.getTextContent();
    fullText += c.items.map((it) => it.str).join(' ') + '\n';
  }
  return { ...metrics, text: fullText, pageCount: pdf.numPages };
}
