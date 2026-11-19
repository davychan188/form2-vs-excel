/**
 * Browser / Node OOXML (.docx) builder for Form 2 Target Assessment summaries.
 * Produces a store-only ZIP so it needs no extra library or server.
 */

import { sortForm2Records } from './form2_extract.mjs';

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  return new TextEncoder().encode(String(data));
}

/** Build an uncompressed ZIP archive from {name, data} entries. */
export function zipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const payload = toBytes(data);
    const crc = crc32(payload);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(payload.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      payload,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(payload.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}

/** List file names stored in a ZIP (local headers / central directory). */
export function listZipFiles(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const names = [];
  let i = 0;
  while (i + 4 <= u8.length) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) {
      const nameLen = view.getUint16(i + 26, true);
      const extraLen = view.getUint16(i + 28, true);
      const comp = view.getUint32(i + 18, true);
      const name = new TextDecoder().decode(u8.slice(i + 30, i + 30 + nameLen));
      names.push(name);
      i += 30 + nameLen + extraLen + comp;
    } else if (sig === 0x02014b50) {
      break;
    } else {
      i += 1;
    }
  }
  return names;
}

export function extractZipFile(buf, filename) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let i = 0;
  while (i + 4 <= u8.length) {
    const sig = view.getUint32(i, true);
    if (sig !== 0x04034b50) {
      if (sig === 0x02014b50) break;
      i += 1;
      continue;
    }
    const method = view.getUint16(i + 8, true);
    const comp = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(u8.slice(i + 30, i + 30 + nameLen));
    const start = i + 30 + nameLen + extraLen;
    if (name === filename) {
      if (method !== 0) throw new Error('compressed zip entry not supported');
      return u8.slice(start, start + comp);
    }
    i = start + comp;
  }
  return null;
}

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wText(str) {
  const t = xmlEscape(str);
  if (!t) return '<w:t xml:space="preserve"> </w:t>';
  const space = /^\s|\s$/.test(String(str ?? '')) ? ' xml:space="preserve"' : '';
  return `<w:t${space}>${t}</w:t>`;
}

function p(text, { style, bold, size } = {}) {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const rPr = [
    bold ? '<w:b/>' : '',
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '',
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft JhengHei"/>',
  ].join('');
  return `<w:p>${pPr}<w:r><w:rPr>${rPr}</w:rPr>${wText(text)}</w:r></w:p>`;
}

function cell(text, { header = false, width = 2000, span = 1, gridSpan } = {}) {
  const fill = header ? '<w:shd w:val="clear" w:fill="1F4E79"/>' : '';
  const color = header ? '<w:color w:val="FFFFFF"/>' : '';
  const bold = header ? '<w:b/>' : '';
  const gs = gridSpan || span > 1 ? `<w:gridSpan w:val="${gridSpan || span}"/>` : '';
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${gs}
      ${fill}
      <w:vAlign w:val="center"/>
    </w:tcPr>
    <w:p>
      <w:r>
        <w:rPr>${bold}${color}<w:sz w:val="18"/><w:szCs w:val="18"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft JhengHei"/></w:rPr>
        ${wText(text)}
      </w:r>
    </w:p>
  </w:tc>`;
}

function table(headers, rows, colWidths) {
  const widths = colWidths || headers.map(() => Math.floor(10800 / headers.length));
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const head = `<w:tr>${headers.map((h, i) => cell(h, { header: true, width: widths[i] })).join('')}</w:tr>`;
  const body = rows
    .map(
      (r) =>
        `<w:tr>${r.map((c, i) => cell(c ?? '', { width: widths[i] })).join('')}</w:tr>`
    )
    .join('');
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="10800" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="888888"/>
      </w:tblBorders>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${head}${body || `<w:tr>${cell('（沒有記錄）', { width: widths[0], gridSpan: headers.length })}</w:tr>`}
  </w:tbl>
  <w:p/>`;
}

function dash(v) {
  const s = String(v ?? '').trim();
  return s || '—';
}

function inspDateTime(rec) {
  if (rec.date && rec.time) return `${rec.date} ${rec.time}`;
  return rec.date || rec.time || '';
}

function formSection(rec, index, total) {
  const title = [rec.treeId, rec.date, rec.file_ref, rec.filename].filter((v) => String(v || '').trim()).join(' · ')
    || `Form 2 #${index + 1}`;
  const identRows = [
    ['Dept. Tree ID 部門樹木編號', dash(rec.treeId), 'Tree Species 樹種', dash(rec.species)],
    ['Inspection Officer 巡查人員', dash(rec.officer), 'File Ref. 檔案編號', dash(rec.file_ref)],
    ['巡查日期及時間', dash(inspDateTime(rec)), 'Next inspection date 下次檢查日期', dash(rec.nextInspectionDate)],
    ['Triage Colour 分流顏色', dash(rec.triage), 'Tree Height (m) 樹高', dash(rec.height)],
    ['Crown Spread (m) 樹冠闊度', dash(rec.spread), 'Aggregated DBH (mm)', dash(rec.dbh)],
    ['Overall tree risk rating 綜合樹木風險', dash(rec.overallTreeRisk), 'Overall residual risk 綜合剩餘風險', dash(rec.overallResidualRisk)],
  ];
  const identTable = table(
    ['欄位', '內容', '欄位', '內容'],
    identRows,
    [2700, 2700, 2700, 2700]
  );

  const targetRows = (rec.targets || []).map((t) => [
    t.no, t.description, t.zone, t.occupancy, t.remove, t.restrict,
  ]);
  const riskRows = (rec.risks || []).map((r) => [
    r.no, r.treePart, r.condition, r.partSize, r.fallDistance,
    r.failure, r.impact, r.failureAndImpact, r.consequences, r.riskRating,
  ]);
  const mitRows = (rec.mitigations || []).map((m) => [
    m.no, m.treePart, m.measures, m.completionDate, m.residualRisk,
  ]);

  const notes = rec.notes ? p(rec.notes) : p('（沒有摘錄到備註）');
  const br = index < total - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';

  return [
    p(`Form 2 目標物／風險摘要 — ${title}`, { style: 'Heading1', bold: true, size: 32 }),
    rec.filename ? p(`檔名：${rec.filename}`, { size: 18 }) : '',
    identTable,
    p('Target Assessment 目標物評估', { style: 'Heading2', bold: true, size: 24 }),
    table(
      ['目標物編號', '目標物的描述 Target Description', '目標物範圍 Target Zone', '佔用率 Occupancy', '可否移除 Remove?', '可否限制 Restrict?'],
      targetRows,
      [1200, 3600, 1800, 1400, 1400, 1400]
    ),
    p('Risk Categorisation 風險類別', { style: 'Heading2', bold: true, size: 24 }),
    table(
      ['編號', '樹木部分 Tree Part', '關注狀況 Condition', '部位大小 (mm)', '下墜距離 (m)', '倒塌 Failure', '影響 Impact', '倒塌並影響', '後果', '風險評級'],
      riskRows,
      [700, 1500, 1800, 1000, 1000, 1000, 900, 1100, 900, 900]
    ),
    p('Mitigation Measures 緩減措施', { style: 'Heading2', bold: true, size: 24 }),
    table(
      ['目標物編號', '樹木部分 Tree Part', '緩減措施 Mitigation Measures', '預算完成日期', '剩餘風險 Residual Risk'],
      mitRows,
      [1400, 2200, 4400, 1400, 1400]
    ),
    p('Notes 說明、註解、描述及補充資料', { style: 'Heading2', bold: true, size: 24 }),
    notes,
    br,
  ].join('');
}

function documentXml(records) {
  const list = Array.isArray(records) ? records : [records];
  const body = list.map((r, i) => formSection(r, i, list.length)).join('') +
    `<w:sectPr>
      <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
  </w:body>
</w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="1F4E79"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="1F4E79"/></w:rPr>
  </w:style>
</w:styles>`;

/**
 * Build a .docx (Uint8Array) with one section per Form 2 record.
 */
export function buildTargetAssessmentDocx(records) {
  const xml = documentXml(sortForm2Records(records));
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: RELS },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/document.xml', data: xml },
  ]);
}

export const TARGET_ASSESSMENT_DOCX_FILENAME = 'Form2_Target_Assessment_Summary.docx';
