#!/usr/bin/env node
/**
 * Verify Form 2 extraction against fixtures/sample-FTA-T0012.pdf
 * Expects: Tree ID FTA-T0012, Height 18, Crown Spread 6, Aggregated DBH 230,
 * Tree Species Michelia x alba, Triage Colour Orange,
 * Date 27/12/2025, Time 09:30, Last Inspection Date 22/10/2024
 */
import { readFileSync, existsSync } from 'fs';
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
  pathToFileURL('/tmp/pdfjs-manual/package/legacy/build/pdf.mjs').href,
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
  extractTriageColourFromFlatText,
  extractTriageColourFromItems,
  normalizeTriageColour,
  extractTreeSpeciesFromFlatText,
  extractTreeSpeciesFromItems,
  normalizeSpeciesForCompare,
  scientificNameForCompare,
  speciesScientificNamesMatch,
  isExcelSpeciesHeader,
  DAILY_FORM2_LIMIT,
  summarizeDailyOfficerCounts,
  isOverLimitRecord,
  renderDailyQuotaSummaryHtml,
  dailyQuotaExportRows,
} = await import(pathToFileURL(join(__dirname, 'form2_extract.mjs')).href);
const {
  buildTargetAssessmentDocx,
  listZipFiles,
  extractZipFile,
  TARGET_ASSESSMENT_DOCX_FILENAME,
} = await import(pathToFileURL(join(__dirname, 'form2_docx.mjs')).href);

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
  triage: 'Orange',
  species: 'Michelia x alba',
};

assertEqual('treeId', result.treeId, expected.treeId, failures);
assertEqual('height', Number(result.height), expected.height, failures);
assertEqual('spread', Number(result.spread), expected.spread, failures);
assertEqual('dbh', Number(result.dbh), expected.dbh, failures);
assertEqual('date', result.date, expected.date, failures);
assertEqual('time', result.time, expected.time, failures);
assertEqual('last_insp_date', result.last_insp_date, expected.last_insp_date, failures);
assertEqual('triage', result.triage, expected.triage, failures);
assertEqual('species', result.species, expected.species, failures);

// Officer / file ref are best-effort but should pass on the sample
assertEqual('officer', result.officer, 'Wong Kwok Leung', failures);
assertEqual('file_ref', result.file_ref, 'FTA-20260123-F2-21026', failures);

function assertRow(prefix, got, expected, failures) {
  for (const [k, v] of Object.entries(expected)) {
    assertEqual(`${prefix}.${k}`, got?.[k], v, failures);
  }
}

// FTA-T0012 Target Assessment summary (2 rows, wrapped Tree Part, next-inspection != completion)
assertEqual('FTA targets count', result.targets?.length, 2, failures);
assertRow('FTA target 1', result.targets?.[0], {
  no: '1',
  description: 'People (pedestrians, facility users, activity participants, etc.)',
  zone: 'Within dripline',
  occupancy: 'Frequent',
  remove: 'N',
  restrict: 'N',
}, failures);
assertRow('FTA target 2', result.targets?.[1], {
  no: '2',
  description: 'Buildings (residential, commercial, school, utility, covered carparks, etc)',
  zone: 'Within 1.5 X Ht.',
  occupancy: 'Constant',
  remove: 'N',
  restrict: 'N',
}, failures);
assertEqual('FTA risks count', result.risks?.length, 2, failures);
assertRow('FTA risk 1', result.risks?.[0], {
  no: '1',
  treePart: 'Main trunk/codominant trunk',
  condition: 'Poor taper with wound on trunk',
  partSize: '230',
  fallDistance: '18',
  failure: 'Possible',
  impact: 'Medium',
  failureAndImpact: 'Unlikely',
  consequences: 'Severe',
  riskRating: 'Low',
}, failures);
assertRow('FTA risk 2', result.risks?.[1], {
  no: '2',
  treePart: 'Main trunk/codominant trunk',
  condition: 'Poor taper with wound on trunk',
  partSize: '230',
  fallDistance: '18',
  failure: 'Possible',
  impact: 'High',
  failureAndImpact: 'Somewhat likely',
  consequences: 'Minor',
  riskRating: 'Low',
}, failures);
assertEqual('FTA mitigations count', result.mitigations?.length, 2, failures);
assertRow('FTA mitigation 1', result.mitigations?.[0], {
  no: '1',
  treePart: 'Main trunk/codominant trunk',
  measures: 'Others 其他 : Defect was insignificant. No mitigation is required.',
  completionDate: '27/12/2025',
  residualRisk: 'Low',
}, failures);
assertRow('FTA mitigation 2', result.mitigations?.[1], {
  no: '2',
  treePart: 'Main trunk/codominant trunk',
  measures: 'Others 其他 : Defect was insignificant. No mitigation is required.',
  completionDate: '27/12/2025',
  residualRisk: 'Low',
}, failures);
assertEqual(
  'FTA notes',
  result.notes,
  'Tree is generally fair in health and structure condition. No observable defect found that pose high potential risk to public. No remedial action is required at the time of inspection. Tree maintenance works will be deployed when necessary upon monthly tree inspection.',
  failures
);
assertEqual('FTA overall tree risk', result.overallTreeRisk, 'Low', failures);
assertEqual('FTA overall residual risk', result.overallResidualRisk, 'Low', failures);
assertEqual('FTA next inspection', result.nextInspectionDate, '27/12/2026', failures);
assertEqual('FTA next inspection is not completion date', result.nextInspectionDate === '27/12/2025', false, failures);

const otPath = process.env.OT_SAMPLE || '/workspace/form2-sample-OT-T0015.pdf';
let otResult = null;
if (!existsSync(otPath)) {
  failures.push(`OT sample missing: ${otPath}`);
} else {
  const otData = new Uint8Array(readFileSync(otPath));
  otResult = await extractForm2Metrics(pdfjsLib, otData, 'form2-sample-OT-T0015.pdf');
  assertEqual('OT treeId', otResult.treeId, 'OT-T0015', failures);
  assertEqual('OT species', otResult.species, 'Aleurites moluccana', failures);
  assertEqual('OT officer', otResult.officer, 'CHENG Long Hei', failures);
  assertEqual('OT date', otResult.date, '05/10/2026', failures);
  assertEqual('OT time', otResult.time, '12:00', failures);
  assertEqual('OT file_ref', otResult.file_ref, 'OT-20261026-F2-24774', failures);
  assertEqual('OT targets count', otResult.targets?.length, 3, failures);
  assertRow('OT target 1', otResult.targets?.[0], {
    no: '1',
    description: 'People (pedestrians, facility users, activity participants, etc.)',
    zone: 'Within dripline',
    occupancy: 'Frequent',
    remove: 'N',
    restrict: 'N',
  }, failures);
  assertRow('OT target 2', otResult.targets?.[1], {
    no: '2',
    description: 'Buildings (residential, commercial, school, utility, covered carparks, etc)',
    zone: 'Within 1.5 X Ht.',
    occupancy: 'Constant',
    remove: 'N',
    restrict: 'N',
  }, failures);
  assertRow('OT target 3', otResult.targets?.[2], {
    no: '3',
    description: 'Minor public road/village road (1 lane)',
    zone: 'Within dripline',
    occupancy: 'Constant',
    remove: 'N',
    restrict: 'N',
  }, failures);
  assertEqual('OT risks count', otResult.risks?.length, 3, failures);
  assertRow('OT risk 1', otResult.risks?.[0], {
    no: '1',
    treePart: 'Whole Tree',
    condition: 'Restricted root',
    partSize: '280',
    fallDistance: '10',
    failure: 'Possible',
    impact: 'Medium',
    failureAndImpact: 'Unlikely',
    consequences: 'Significant',
    riskRating: 'Low',
  }, failures);
  assertRow('OT risk 2', otResult.risks?.[1], {
    no: '2',
    treePart: 'Whole Tree',
    condition: 'Restricted root',
    partSize: '280',
    fallDistance: '10',
    failure: 'Possible',
    impact: 'High',
    failureAndImpact: 'Somewhat likely',
    consequences: 'Minor',
    riskRating: 'Low',
  }, failures);
  assertRow('OT risk 3', otResult.risks?.[2], {
    no: '3',
    treePart: 'Whole Tree',
    condition: 'Restricted root',
    partSize: '280',
    fallDistance: '10',
    failure: 'Possible',
    impact: 'High',
    failureAndImpact: 'Somewhat likely',
    consequences: 'Minor',
    riskRating: 'Low',
  }, failures);
  assertEqual('OT mitigations count', otResult.mitigations?.length, 3, failures);
  for (const i of [0, 1, 2]) {
    assertRow(`OT mitigation ${i + 1}`, otResult.mitigations?.[i], {
      no: String(i + 1),
      treePart: 'Whole Tree',
      measures: 'Others 其他 : Reinspection within 12 months',
      completionDate: '04/10/2027',
      residualRisk: 'Low',
    }, failures);
  }
  assertEqual(
    'OT notes',
    otResult.notes,
    'The foliage colour, density and size were normal at the time of inspection. No obvious root plate movement or split at main union was identified. No observable defect found that poses high potential risk to public, no mitigation is required. Reinspection within 12 months.',
    failures
  );
  assertEqual('OT overall tree risk', otResult.overallTreeRisk, 'Low', failures);
  assertEqual('OT overall residual risk', otResult.overallResidualRisk, 'Low', failures);
  assertEqual('OT next inspection', otResult.nextInspectionDate, '04/10/2027', failures);
  assertEqual('OT-T0015 triage still Orange', otResult.triage, 'Orange', failures);
}

const ot0007Path = process.env.OT0007_SAMPLE || '/workspace/form2-sample-OT-T0007.pdf';
let ot0007Result = null;
if (!existsSync(ot0007Path)) {
  failures.push(`OT-T0007 sample missing: ${ot0007Path}`);
} else {
  const ot0007Data = new Uint8Array(readFileSync(ot0007Path));
  ot0007Result = await extractForm2Metrics(pdfjsLib, ot0007Data, 'form2-sample-OT-T0007.pdf');
  assertEqual('OT-T0007 treeId', ot0007Result.treeId, 'OT-T0007', failures);
  assertEqual('OT-T0007 species', ot0007Result.species, 'Aleurites moluccana', failures);
  assertEqual('OT-T0007 officer', ot0007Result.officer, 'YIP Chun Yan', failures);
  assertEqual('OT-T0007 date', ot0007Result.date, '28/10/2026', failures);
  assertEqual('OT-T0007 time', ot0007Result.time, '09:05', failures);
  assertEqual('OT-T0007 last_insp_date', ot0007Result.last_insp_date, '19/11/2025', failures);
  assertEqual('OT-T0007 date is not last inspection', ot0007Result.date === '19/11/2025', false, failures);
  assertEqual('OT-T0007 file_ref', ot0007Result.file_ref, 'OT-20261026-F2-24766', failures);
  assertEqual('OT-T0007 height', Number(ot0007Result.height), 7, failures);
  assertEqual('OT-T0007 spread', Number(ot0007Result.spread), 4, failures);
  assertEqual('OT-T0007 dbh', Number(ot0007Result.dbh), 290, failures);
  assertEqual('OT-T0007 triage', ot0007Result.triage, 'No Triage colour', failures);
  assertEqual('OT-T0007 targets count', ot0007Result.targets?.length, 3, failures);
  assertRow('OT-T0007 target 1', ot0007Result.targets?.[0], {
    no: '1',
    description: 'People (pedestrians, facility users, activity participants, etc.)',
    zone: 'Within dripline',
    occupancy: 'Frequent',
    remove: 'N',
    restrict: 'N',
  }, failures);
  assertRow('OT-T0007 target 2', ot0007Result.targets?.[1], {
    no: '2',
    description: 'Urban paths, pedestrian walkways, etc',
    zone: 'Within dripline',
    occupancy: 'Constant',
    remove: 'N',
    restrict: 'N',
  }, failures);
  assertRow('OT-T0007 target 3', ot0007Result.targets?.[2], {
    no: '3',
    description: 'Minor public road/village road (1 lane)',
    zone: 'Within dripline',
    occupancy: 'Constant',
    remove: 'N',
    restrict: 'N',
  }, failures);
  assertEqual('OT-T0007 risks count', ot0007Result.risks?.length, 3, failures);
  assertRow('OT-T0007 risk 1', ot0007Result.risks?.[0], {
    no: '1',
    treePart: 'Whole Tree',
    condition: 'Root restriction',
    partSize: '290',
    fallDistance: '7',
    failure: 'Possible',
    impact: 'Medium',
    failureAndImpact: 'Unlikely',
    consequences: 'Severe',
    riskRating: 'Low',
  }, failures);
  assertRow('OT-T0007 risk 2', ot0007Result.risks?.[1], {
    no: '2',
    treePart: 'Whole Tree',
    condition: 'Root restriction',
    partSize: '290',
    fallDistance: '7',
    failure: 'Possible',
    impact: 'High',
    failureAndImpact: 'Somewhat likely',
    consequences: 'Minor',
    riskRating: 'Low',
  }, failures);
  assertRow('OT-T0007 risk 3', ot0007Result.risks?.[2], {
    no: '3',
    treePart: 'Whole Tree',
    condition: 'Root restriction',
    partSize: '290',
    fallDistance: '7',
    failure: 'Possible',
    impact: 'High',
    failureAndImpact: 'Somewhat likely',
    consequences: 'Minor',
    riskRating: 'Low',
  }, failures);
  assertEqual('OT-T0007 mitigations count', ot0007Result.mitigations?.length, 3, failures);
  for (const i of [0, 1, 2]) {
    assertRow(`OT-T0007 mitigation ${i + 1}`, ot0007Result.mitigations?.[i], {
      no: String(i + 1),
      treePart: 'Whole Tree',
      measures: 'Others 其他 : Reinspection within 12 months',
      completionDate: '27/10/2027',
      residualRisk: 'Low',
    }, failures);
  }
  assertEqual(
    'OT-T0007 notes',
    ot0007Result.notes,
    'Restricted root was observed. The foliage colour, density and size were normal at the time of inspection. No obvious root plate movement or split at main union was identified. No observable defect found that poses high potential risk to public, no mitigation is required. Reinspection within 12 months.',
    failures
  );
  assertEqual('OT-T0007 overall tree risk', ot0007Result.overallTreeRisk, 'Low', failures);
  assertEqual('OT-T0007 overall residual risk', ot0007Result.overallResidualRisk, 'Low', failures);
  assertEqual('OT-T0007 next inspection', ot0007Result.nextInspectionDate, '27/10/2027', failures);
  assertEqual('OT-T0007 next is not last inspection', ot0007Result.nextInspectionDate === '19/11/2025', false, failures);
  assertEqual('OT-T0007 next is not 19/11/2026', ot0007Result.nextInspectionDate === '19/11/2026', false, failures);
}

const docxRecords = [result, otResult, ot0007Result].filter(Boolean).map((r) => ({ ...r, filename: r.treeId + '.pdf' }));
const docxBuf = buildTargetAssessmentDocx(docxRecords);
assertEqual('docx filename', TARGET_ASSESSMENT_DOCX_FILENAME, 'Form2_Target_Assessment_Summary.docx', failures);
assertEqual('docx magic PK', String.fromCharCode(docxBuf[0], docxBuf[1]), 'PK', failures);
const zipNames = listZipFiles(docxBuf);
assertEqual('docx has document.xml', zipNames.includes('word/document.xml'), true, failures);
const docXml = new TextDecoder().decode(extractZipFile(docxBuf, 'word/document.xml'));
assertEqual('docx xml has FTA-T0012', docXml.includes('FTA-T0012'), true, failures);
if (otResult) assertEqual('docx xml has OT-T0015', docXml.includes('OT-T0015'), true, failures);
if (ot0007Result) {
  assertEqual('docx xml has OT-T0007', docXml.includes('OT-T0007'), true, failures);
  assertEqual('docx xml has No Triage colour', docXml.includes('No Triage colour'), true, failures);
}
assertEqual('docx xml has notes table content or notes heading', docXml.includes('Notes'), true, failures);
assertEqual('docx xml has triage field', docXml.includes('Triage Colour'), true, failures);
assertEqual('docx xml has height field', docXml.includes('Tree Height (m)'), true, failures);

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

assertEqual('normalize orange', normalizeTriageColour('orange'), 'Orange', failures);
assertEqual('normalize NIL', normalizeTriageColour('nil'), 'NIL', failures);
assertEqual('normalize reject nearby', normalizeTriageColour('Aggregated'), '', failures);
assertEqual('normalize No Triage colour', normalizeTriageColour('No Triage colour'), 'No Triage colour', failures);
assertEqual('normalize no triage colour spacing/case', normalizeTriageColour('  NO   TRIAGE  COLOR '), 'No Triage colour', failures);
assertEqual('normalize 沒有分流顏色', normalizeTriageColour('沒有分流顏色'), 'No Triage colour', failures);
assertEqual('normalize reject lone No', normalizeTriageColour('No'), '', failures);
assertEqual('normalize reject Triage', normalizeTriageColour('Triage'), '', failures);

const triageFlatCases = [
  {
    name: 'label then colour',
    text: 'Triage Colour Orange Tree Height',
  },
  {
    name: 'pdf.js order with fields between label and colour',
    text: '230 Triage Colour 分流顏色 202002800062143 1 Aggregated DBH (mm) 總胸徑(毫米) Dept. Tree ID 部門樹木編號 FTA-T0012 Orange 18 Tree Height(m)',
  },
  {
    name: 'colour then label',
    text: 'Orange Triage Colour 分流顏色',
  },
  {
    name: 'chinese label then colour',
    text: '分流顏色 Orange Tree Species',
  },
];
for (const c of triageFlatCases) {
  assertEqual(`${c.name} triage`, extractTriageColourFromFlatText(c.text), 'Orange', failures);
}

assertEqual(
  'flat no triage after label',
  extractTriageColourFromFlatText('Triage Colour 分流顏色 No Triage colour Tree Height'),
  'No Triage colour',
  failures
);
assertEqual(
  'flat no triage before label',
  extractTriageColourFromFlatText('No Triage colour Triage Colour 分流顏色'),
  'No Triage colour',
  failures
);
assertEqual(
  'items no triage single token',
  extractTriageColourFromItems([
    { str: 'Triage Colour', x: 472, y: 652.76 },
    { str: '分流顏色', x: 472, y: 647.49 },
    { str: 'No Triage colour', x: 542, y: 650.13, w: 40 },
  ]),
  'No Triage colour',
  failures
);
assertEqual(
  'items no triage split tokens',
  extractTriageColourFromItems([
    { str: 'Triage Colour', x: 472, y: 652.76 },
    { str: '分流顏色', x: 472, y: 647.49 },
    { str: 'No', x: 542, y: 650.13 },
    { str: 'Triage', x: 555, y: 650.13 },
    { str: 'colour', x: 580, y: 650.13 },
  ]),
  'No Triage colour',
  failures
);

assertEqual('normalize species whitespace', normalizeSpeciesForCompare('  Michelia   x  alba '), 'Michelia x alba', failures);
assertEqual('normalize keeps capitalization', normalizeSpeciesForCompare('Delonix regia/鳳凰木'), 'Delonix regia/鳳凰木', failures);

const speciesMatchCases = [
  ['Delonix regia', 'Delonix regia/鳳凰木'],
  ['Ficus microcarpa', 'Ficus microcarpa/榕樹(細葉榕)'],
  ['Terminalia catappa', 'Terminalia catappa/欖仁樹'],
  ['Acacia confusa', 'Acacia confusa/台灣相思'],
  ['Senna siamea (syn. Cassia siamea)', 'Senna siamea (syn. Cassia siamea)/鐵刀木'],
];
for (const [pdf, excel] of speciesMatchCases) {
  assertEqual(`scientific match ${pdf}`, speciesScientificNamesMatch(pdf, excel), true, failures);
}
assertEqual('different scientific names', speciesScientificNamesMatch('Delonix regia', 'Ficus microcarpa'), false, failures);
assertEqual(
  'different scientific with vernacular',
  speciesScientificNamesMatch('Delonix regia/鳳凰木', 'Ficus microcarpa/榕樹'),
  false,
  failures
);
assertEqual(
  'whitespace variant',
  speciesScientificNamesMatch('Michelia   x  alba', 'Michelia x alba'),
  true,
  failures
);
assertEqual(
  'punctuation and case variant',
  speciesScientificNamesMatch('Senna siamea (syn. Cassia siamea)', 'senna siamea (syn.cassia siamea)'),
  true,
  failures
);
assertEqual(
  'hybrid multiply vs x',
  speciesScientificNamesMatch('Michelia × alba', 'Michelia x alba'),
  true,
  failures
);
assertEqual(
  'fullwidth slash',
  speciesScientificNamesMatch('Delonix regia', 'Delonix regia／鳳凰木'),
  true,
  failures
);
assertEqual(
  'spaces around slash',
  speciesScientificNamesMatch('Delonix regia', 'Delonix regia / 鳳凰木'),
  true,
  failures
);
assertEqual(
  'compare key strips vernacular only',
  scientificNameForCompare('Delonix regia/鳳凰木'),
  scientificNameForCompare('Delonix regia'),
  failures
);

assertEqual('header Tree Species', isExcelSpeciesHeader('Tree Species'), true, failures);
assertEqual('header Species', isExcelSpeciesHeader('Species'), true, failures);
assertEqual('header 樹種', isExcelSpeciesHeader('樹種'), true, failures);
assertEqual('header Tree No is not species', isExcelSpeciesHeader('Tree No'), false, failures);

const speciesFlatCases = [
  {
    name: 'species label then value',
    text: '230 Tree Species 樹種 Michelia x alba Large Tree (DBH ≥ 500mm',
  },
  {
    name: 'species value then label',
    text: 'Michelia x alba Tree Species 樹種 FTA-T0012 Orange',
  },
  {
    name: 'species chinese label then value',
    text: '樹種 Michelia x alba Triage Colour Orange',
  },
];
for (const c of speciesFlatCases) {
  assertEqual(`${c.name}`, extractTreeSpeciesFromFlatText(c.text), 'Michelia x alba', failures);
}
assertEqual(
  'species footnote ignored',
  extractTreeSpeciesFromFlatText('* 20 Common Tree Species requiring special attention should be duly considered'),
  '',
  failures
);
assertEqual(
  'species does not grab tree id',
  extractTreeSpeciesFromFlatText('Tree Species 樹種 FTA-T0012 Crown Spread'),
  '',
  failures
);

const splitSpeciesItems = [
  { str: 'Dept. Tree ID', x: 142, y: 652.76 },
  { str: 'FTA-T0012', x: 202, y: 650.13 },
  { str: 'Tree', x: 267, y: 652.76 },
  { str: 'Species', x: 279.5, y: 652.76 },
  { str: '樹種', x: 267, y: 647.49 },
  { str: 'Michelia', x: 312, y: 650.13 },
  { str: 'x', x: 334.5, y: 650.13 },
  { str: 'alba', x: 339.5, y: 650.13 },
  { str: 'Triage Colour', x: 472, y: 652.76 },
  { str: '分流顏色', x: 472, y: 647.49 },
  { str: 'Orange', x: 542, y: 650.13 },
  { str: 'Wong Kwok Leung', x: 400, y: 737 },
];
assertEqual(
  'species split tokens',
  extractTreeSpeciesFromItems(splitSpeciesItems),
  'Michelia x alba',
  failures
);

// Interval-panel record mapping must keep date/time and the three metrics
const intervalRecord = {
  tree_id: result.treeId || 'Unknown',
  date: result.date || 'Unknown',
  time: result.time || 'Unknown',
  last_insp_date: result.last_insp_date || 'Unknown',
  height: result.height || 0,
  spread: result.spread || 0,
  dbh: result.dbh || 0,
  triage: result.triage || '',
};
assertEqual('interval tree_id', intervalRecord.tree_id, 'FTA-T0012', failures);
assertEqual('interval date', intervalRecord.date, '27/12/2025', failures);
assertEqual('interval time', intervalRecord.time, '09:30', failures);
assertEqual('interval last', intervalRecord.last_insp_date, '22/10/2024', failures);
assertEqual('interval height', Number(intervalRecord.height), 18, failures);
assertEqual('interval spread', Number(intervalRecord.spread), 6, failures);
assertEqual('interval dbh', Number(intervalRecord.dbh), 230, failures);
assertEqual('interval triage', intervalRecord.triage, 'Orange', failures);

assertEqual('daily limit constant', DAILY_FORM2_LIMIT, 15, failures);

function makeForms(n, officer, date, start = 0) {
  return Array.from({ length: n }, (_, i) => ({
    officer,
    date,
    treeId: `FTA-T${String(start + i + 1).padStart(4, '0')}`,
    filename: `f${start + i}.pdf`,
  }));
}

const s15 = summarizeDailyOfficerCounts(makeForms(15, 'Wong Kwok Leung', '27/12/2025'));
assertEqual('15 same officer+date groups', s15.groups.length, 1, failures);
assertEqual('15 count', s15.groups[0].count, 15, failures);
assertEqual('15 not over', s15.groups[0].overLimit, false, failures);
assertEqual('15 over groups', s15.overLimitGroups.length, 0, failures);
assertEqual('15 missing', s15.missing.length, 0, failures);

const s16 = summarizeDailyOfficerCounts(makeForms(16, 'Wong Kwok Leung', '27/12/2025'));
assertEqual('16 count', s16.groups[0].count, 16, failures);
assertEqual('16 over', s16.groups[0].overLimit, true, failures);
assertEqual('16 over groups', s16.overLimitGroups.length, 1, failures);
assertEqual('16 isOverLimitRecord', isOverLimitRecord(s16, 'Wong Kwok Leung', '27/12/2025'), true, failures);

const mixedDates = [
  ...makeForms(10, 'Wong Kwok Leung', '27/12/2025'),
  ...makeForms(10, 'Wong Kwok Leung', '28/12/2025', 10),
];
const sDates = summarizeDailyOfficerCounts(mixedDates);
assertEqual('different dates groups', sDates.groups.length, 2, failures);
assertEqual('different dates not over', sDates.groups.every((g) => !g.overLimit), true, failures);
assertEqual('different dates counts', sDates.groups.every((g) => g.count === 10), true, failures);

const mixedOfficers = [
  ...makeForms(10, 'Wong Kwok Leung', '27/12/2025'),
  ...makeForms(10, 'Chan Tai Man', '27/12/2025', 10),
];
const sOfficers = summarizeDailyOfficerCounts(mixedOfficers);
assertEqual('different officers groups', sOfficers.groups.length, 2, failures);
assertEqual('different officers not over', sOfficers.groups.every((g) => !g.overLimit), true, failures);

const whitespaceNames = [
  { officer: 'Wong Kwok Leung', date: '27/12/2025', treeId: 'A', filename: 'a.pdf' },
  { officer: '  Wong   Kwok  Leung ', date: '27/12/2025', treeId: 'B', filename: 'b.pdf' },
];
const sWs = summarizeDailyOfficerCounts(whitespaceNames);
assertEqual('whitespace same person groups', sWs.groups.length, 1, failures);
assertEqual('whitespace count', sWs.groups[0].count, 2, failures);
assertEqual('whitespace display first spelling', sWs.groups[0].officer, 'Wong Kwok Leung', failures);

const withMissing = [
  { officer: 'Wong Kwok Leung', date: '27/12/2025', treeId: 'OK', filename: 'ok.pdf' },
  { officer: '', date: '27/12/2025', treeId: 'M1', filename: 'm1.pdf' },
  { officer: 'Wong Kwok Leung', date: '', treeId: 'M2', filename: 'm2.pdf' },
  { officer: 'Unknown', date: '27/12/2025', treeId: 'M3', filename: 'm3.pdf' },
  { officer: 'Someone', date: 'Unknown', treeId: 'M4', filename: 'm4.pdf' },
];
const sMiss = summarizeDailyOfficerCounts(withMissing);
assertEqual('missing excluded group count', sMiss.groups.length, 1, failures);
assertEqual('missing excluded quota count', sMiss.groups[0].count, 1, failures);
assertEqual('missing excluded not over', sMiss.groups[0].overLimit, false, failures);
assertEqual('missing list length', sMiss.missing.length, 4, failures);
assertEqual('missing not over-limit flagged', isOverLimitRecord(sMiss, '', '27/12/2025'), false, failures);
assertEqual('unknown officer not a quota key', isOverLimitRecord(sMiss, 'Unknown', '27/12/2025'), false, failures);

function assertIncludes(label, haystack, needle, failures) {
  if (!haystack.includes(needle)) {
    failures.push(`${label}: missing ${JSON.stringify(needle)}`);
  }
}

const indexHtml = readFileSync(join(__dirname, 'index.html'), 'utf8');
assertIncludes(
  'interval table headers',
  indexHtml,
  '<th>樹高 (m)</th><th>樹冠闊度 (m)</th><th>Aggregated DBH (mm)</th><th>分流顏色</th>',
  failures
);
assertIncludes(
  'interval Excel headers',
  indexHtml,
  "'Tree Height (m)', 'Crown Spread (m)', 'Aggregated DBH (mm)', 'Triage Colour'",
  failures
);
assertIncludes('interval table cells', indexHtml, 'ivFmtMetric(r.height)', failures);
assertIncludes('interval Excel cells', indexHtml, 'ivExportMetric(r.height)', failures);
assertIncludes('interval triage cell', indexHtml, 'ivFmt(r.triage)', failures);
assertIncludes('interval Excel triage', indexHtml, 'r.triage ||', failures);
assertIncludes('full-compare overview height', indexHtml, '${escapeHtml(r.height || \'-\')}', failures);
assertIncludes('full-compare overview spread', indexHtml, '${escapeHtml(r.spread || \'-\')}', failures);
assertIncludes('full-compare overview triage', indexHtml, '${escapeHtml(r.triage || \'-\')}', failures);
assertIncludes('excel-compare triage header', indexHtml, '<th>分流顏色<br>PDF / Excel</th>', failures);
assertIncludes('excel-compare species header', indexHtml, '<th>樹種<br>PDF / Excel</th>', failures);
assertIncludes('excel-compare species display', indexHtml, 'excelSpeciesDisp', failures);
assertIncludes('excel-compare species flag', indexHtml, 'exExcelHasSpecies', failures);
assertIncludes('excel-compare uses scientific matcher', indexHtml, 'speciesScientificNamesMatch(p.species, excel.species)', failures);
assertIncludes('excel-compare displays raw excel species', indexHtml, "String(excel.species || '').trim()", failures);
assertIncludes('full-compare uses scientific matcher', indexHtml, "key === 'species' ? !speciesScientificNamesMatch(va, vb)", failures);
assertIncludes('full-compare overview species', indexHtml, '${escapeHtml(r.species || '-')}', failures);
assertIncludes('index imports daily quota helper', indexHtml, 'summarizeDailyOfficerCounts', failures);
assertIncludes('index excel keeps officer', indexHtml, "officer: m.officer || ''", failures);
assertIncludes('index excel keeps date', indexHtml, "date: m.date || ''", failures);
assertIncludes('index interval subtitle 15/day', indexHtml, '同一人每日最多 15 份 Form 2', failures);
assertIncludes('index interval excel quota sheet', indexHtml, "'每日份數'", failures);
assertIncludes('index excel compare shows quota', indexHtml, 'renderDailyQuotaSummaryHtml(quota, escapeHtml)', failures);
assertIncludes('index full compare shows quota', indexHtml, 'renderDailyQuotaSummaryHtml(quota, escapeHtml)', failures);
assertIncludes('index interval shows quota first', indexHtml, 'let html = renderDailyQuotaSummaryHtml(quota, escapeHtml);', failures);
assertIncludes('assessment tab label', indexHtml, '目標物／風險摘要', failures);
assertIncludes('assessment panel id', indexHtml, 'id="panel-assessment"', failures);
assertIncludes('assessment word export import', indexHtml, 'buildTargetAssessmentDocx', failures);
assertIncludes('assessment word filename', indexHtml, 'TARGET_ASSESSMENT_DOCX_FILENAME', failures);
assertIncludes('assessment card title uses file ref and date', indexHtml, 'taCardTitle', failures);
assertIncludes('assessment duplicate tree id banner', indexHtml, '同一 Tree ID 出現喺多份 PDF，已按檔案分開顯示，沒有合併或覆蓋。', failures);
assertIncludes('assessment ident triage', indexHtml, "taIdent('Triage Colour 分流顏色', r.triage)", failures);
assertIncludes('assessment ident height', indexHtml, "taIdent('Tree Height (m) 樹高', r.height)", failures);
assertIncludes('assessment ident spread', indexHtml, "taIdent('Crown Spread (m) 樹冠闊度', r.spread)", failures);
assertIncludes('assessment ident dbh', indexHtml, "taIdent('Aggregated DBH (mm)', r.dbh)", failures);
assertIncludes('assessment notes always visible', indexHtml, '沒有摘錄到備註', failures);

const quotaHtml = renderDailyQuotaSummaryHtml(s16);
assertIncludes('quota html officer col', quotaHtml, '<th>巡查人員</th>', failures);
assertIncludes('quota html date col', quotaHtml, '<th>巡檢日期</th>', failures);
assertIncludes('quota html count col', quotaHtml, '<th>份數</th>', failures);
assertIncludes('quota html over col', quotaHtml, '<th>是否超限</th>', failures);
assertIncludes('quota html over badge', quotaHtml, '超限', failures);
assertIncludes('quota html uses inspection date not completion', quotaHtml, '不以「完成表格2日期」計算', failures);

const exportRows = dailyQuotaExportRows(s16);
assertEqual('export header officer', exportRows[0][0], '巡查人員', failures);
assertEqual('export over flag', exportRows[1][3], '超限', failures);

const fullHtml = readFileSync(join(__dirname, 'Form2_Full_Compare.html'), 'utf8');
assertIncludes(
  'standalone full-compare overview headers',
  fullHtml,
  '<th>樹高 (m)</th><th>樹冠闊度 (m)</th><th>Aggregated DBH (mm)</th><th>分流顏色</th>',
  failures
);

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
    triage: result.triage,
    species: result.species,
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
