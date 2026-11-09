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
  return { treeId, height, spread, dbh };
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
  if (!height || !spread || !dbh) {
    const fb = extractMetricsFromFlatText(flat, filename);
    if (!height) height = fb.height;
    if (!spread) spread = fb.spread;
    if (!dbh) dbh = fb.dbh;
  }

  const treeId = extractTreeId(items, flat, filename);
  return { treeId, height, spread, dbh, flat };
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
