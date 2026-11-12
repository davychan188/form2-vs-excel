#!/usr/bin/env node
/**
 * Verify Form 2 extraction against fixtures/sample-FTA-T0012.pdf
 * Expects: Tree ID FTA-T0012, Height 18, Crown Spread 6, Aggregated DBH 230,
 * Date 27/12/2025, Time 09:30, Last Inspection Date 22/10/2024
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = process.argv[2] || join(__dirname, 'fixtures', 'sample-FTA-T0012.pdf');

const require = createRequire(import.meta.url);
const pdfjsCandidates = [
  'pdfjs-dist/legacy/build/pdf.mjs',
  pathToFileURL('/tmp/pdfjs-probe/node_modules/pdfjs-dist/legacy/build/pdf.mjs').href,
  pathToFileURL('/tmp/pdfjs-probe/package/legacy/build/pdf.mjs').href,
];

let pdfjsLib;
for (const cand of pdfjsCandidates) {
  try {
    pdfjsLib = await import(cand);
    break;
  } catch {
    // try next
  }
}
if (!pdfjsLib) {
  console.error('Need pdfjs-dist. Run: npm install pdfjs-dist@4.8.69');
  process.exit(2);
}

const {
  extractForm2Metrics,
  extractInspectionFieldsFromFlatText,
  extractMetricsFromFlatText,
} = await import(pathToFileURL(join(__dirname, 'form2_extract.mjs')).href);

function assertEqual(label, got, expected, failures) {
  const ok = got === expected || (typeof expected === 'number' && Number(got) === expected);
  if (!ok) failures.push(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

const failures = [];

const data = new Uint8Array(readFileSync(samplePath));
const result = await extractForm2Metrics(pdfjsLib, data, 'sample-FTA-T0012.pdf');

const expected = {
  treeId: 'FTA-T0012',
  height: 18,
  spread: 6,
  dbh: 230,
  date: '27/12/2025',
  time: '09:30',
  last_insp_date: '22/10/2024',
};

assertEqual('treeId', result.treeId, expected.treeId, failures);
assertEqual('height', Number(result.height), expected.height, failures);
assertEqual('spread', Number(result.spread), expected.spread, failures);
assertEqual('dbh', Number(result.dbh), expected.dbh, failures);
assertEqual('date', result.date, expected.date, failures);
assertEqual('time', result.time, expected.time, failures);
assertEqual('last_insp_date', result.last_insp_date, expected.last_insp_date, failures);

// Officer / file ref are best-effort but should pass on the sample
assertEqual('officer', result.officer, 'Wong Kwok Leung', failures);
assertEqual('file_ref', result.file_ref, 'FTA-20260123-F2-21026', failures);

// Flat-text fallbacks: both orders, and pdf.js order where time sits in (hr)(min) boxes
const flatCases = [
  {
    name: 'label then date time',
    text: 'Date and Time of Inspection 27/12/2025 09 30 Last Inspection Date 22/10/2024 Inspection Time Spent 0.5 hr Inspection Frequency 12 months',
  },
  {
    name: 'date time then label',
    text: '27/12/2025 09 30 Date and Time of Inspection 22/10/2024 Last Inspection Date',
  },
  {
    name: 'pdf.js order with (hr)(min) boxes',
    text: 'Date and Time of Inspection 巡查日期及時間 27/12/2025 Last Inspection Date 上次巡查日期 22/10/2024 (dd/mm/yyyy) (dd/mm/yyyy) (hr) 09 30 (min) Inspection Time Spent 是次巡查所用時間 0.5 hr Inspection Frequency 巡查週期 12 months',
  },
  {
    name: 'colon time after date',
    text: 'Date and Time of Inspection 27/12/2025 9:30 Last Inspection Date 22/10/2024',
  },
];

for (const c of flatCases) {
  const got = extractInspectionFieldsFromFlatText(c.text);
  assertEqual(`${c.name} date`, got.date, '27/12/2025', failures);
  assertEqual(`${c.name} time`, got.time, '09:30', failures);
  assertEqual(`${c.name} last_insp_date`, got.last_insp_date, '22/10/2024', failures);
}

// Metrics flat fallback must still read 18/6/230 in pdf.js order
const metricFlat = extractMetricsFromFlatText(
  '18 Tree Height(m) 6 Crown Spread(m) 1 No. of Trunk(s) 230 Aggregated DBH (mm) FTA-T0012'
);
assertEqual('flat metrics height', Number(metricFlat.height), 18, failures);
assertEqual('flat metrics spread', Number(metricFlat.spread), 6, failures);
assertEqual('flat metrics dbh', Number(metricFlat.dbh), 230, failures);

const report = {
  sample: samplePath,
  got: {
    treeId: result.treeId,
    height: result.height,
    spread: result.spread,
    dbh: result.dbh,
    date: result.date,
    time: result.time,
    last_insp_date: result.last_insp_date,
    officer: result.officer,
    file_ref: result.file_ref,
  },
  expected,
  ok: failures.length === 0,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error('VERIFY FAILED');
  process.exit(1);
}
console.log('VERIFY PASSED');
