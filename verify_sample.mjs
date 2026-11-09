#!/usr/bin/env node
/**
 * Verify Form 2 extraction against fixtures/sample-FTA-T0012.pdf
 * Expects: Tree ID FTA-T0012, Height 18, Crown Spread 6, Aggregated DBH 230
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = process.argv[2] || join(__dirname, 'fixtures', 'sample-FTA-T0012.pdf');

// Prefer local pdfjs-dist if installed; else probe cache from earlier npm pack
const require = createRequire(import.meta.url);
let pdfjsLib;
try {
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
} catch {
  try {
    pdfjsLib = await import(pathToFileURL('/tmp/pdfjs-probe/package/legacy/build/pdf.mjs').href);
  } catch (e) {
    console.error('Need pdfjs-dist. Run: npm install pdfjs-dist@4.8.69');
    process.exit(2);
  }
}

const { extractForm2Metrics } = await import(pathToFileURL(join(__dirname, 'form2_extract.mjs')).href);

const data = new Uint8Array(readFileSync(samplePath));
const result = await extractForm2Metrics(pdfjsLib, data, 'sample-FTA-T0012.pdf');

const expected = { treeId: 'FTA-T0012', height: 18, spread: 6, dbh: 230 };
const ok =
  result.treeId === expected.treeId &&
  Number(result.height) === expected.height &&
  Number(result.spread) === expected.spread &&
  Number(result.dbh) === expected.dbh;

console.log(JSON.stringify({
  sample: samplePath,
  got: { treeId: result.treeId, height: result.height, spread: result.spread, dbh: result.dbh },
  expected,
  ok,
}, null, 2));

if (!ok) {
  console.error('VERIFY FAILED');
  process.exit(1);
}
console.log('VERIFY PASSED');
