/**
 * Target Assessment summary workbook data for SheetJS (browser) or tests (Node).
 * Returns array-of-arrays per sheet; the UI turns them into an .xlsx.
 */

import { sortForm2Records } from './form2_extract.mjs';

export const TARGET_ASSESSMENT_XLSX_FILENAME = 'Form2_Target_Assessment_Summary.xlsx';

export const TARGET_ASSESSMENT_SHEET_NAMES = {
  summary: '摘要',
  targets: 'Target Assessment',
  risks: 'Risk Categorisation',
  mitigations: 'Mitigation Measures',
};

export const TARGET_ASSESSMENT_SUMMARY_HEADERS = [
  'Dept. Tree ID 部門樹木編號',
  'Filename 檔名',
  'File Ref. 檔案編號',
  'Tree Species 樹種',
  'Triage Colour 分流顏色',
  'Tree Height (m) 樹高',
  'Crown Spread (m) 樹冠闊度',
  'Aggregated DBH (mm)',
  'Inspection Officer 巡查人員',
  'Date and Time of Inspection 巡查日期及時間',
  'Inspection Date 巡查日期',
  'Inspection Time 巡查時間',
  'Last Inspection Date 上次巡查日期',
  'Overall tree risk rating 綜合樹木風險',
  'Overall residual risk 綜合剩餘風險',
  'Next inspection date 下次檢查日期',
  'Notes 說明、註解、描述及補充資料',
];

export const TARGET_ASSESSMENT_TARGET_HEADERS = [
  'Dept. Tree ID 部門樹木編號',
  'Filename 檔名',
  'File Ref. 檔案編號',
  '目標物編號',
  '目標物的描述 Target Description',
  '目標物範圍 Target Zone',
  '佔用率 Occupancy',
  '可否移除 Remove?',
  '可否限制 Restrict?',
];

export const TARGET_ASSESSMENT_RISK_HEADERS = [
  'Dept. Tree ID 部門樹木編號',
  'Filename 檔名',
  'File Ref. 檔案編號',
  '編號',
  '樹木部分 Tree Part',
  '關注狀況 Condition',
  '部位大小 (mm)',
  '下墜距離 (m)',
  '倒塌 Failure',
  '影響 Impact',
  '倒塌並影響',
  '後果',
  '風險評級',
];

export const TARGET_ASSESSMENT_MITIGATION_HEADERS = [
  'Dept. Tree ID 部門樹木編號',
  'Filename 檔名',
  'File Ref. 檔案編號',
  '目標物編號',
  '樹木部分 Tree Part',
  '緩減措施 Mitigation Measures',
  '預算完成日期',
  '剩餘風險 Residual Risk',
];

function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return value;
}

function inspDateTime(rec) {
  if (rec?.date && rec?.time) return `${rec.date} ${rec.time}`;
  return rec?.date || rec?.time || '';
}

function recordKeys(rec) {
  return [cell(rec?.treeId || rec?.tree_id), cell(rec?.filename), cell(rec?.file_ref)];
}

/**
 * Build Target Assessment workbook data (sheet names + AOA).
 * Sorts with sortForm2Records internally. Same Tree ID stays one row/section per file.
 * Forms with no child rows are omitted from that child sheet (header remains).
 */
export function buildTargetAssessmentWorkbookData(records) {
  const list = sortForm2Records(Array.isArray(records) ? records : records ? [records] : []);

  const summary = [TARGET_ASSESSMENT_SUMMARY_HEADERS.slice()];
  const targets = [TARGET_ASSESSMENT_TARGET_HEADERS.slice()];
  const risks = [TARGET_ASSESSMENT_RISK_HEADERS.slice()];
  const mitigations = [TARGET_ASSESSMENT_MITIGATION_HEADERS.slice()];

  for (const rec of list) {
    summary.push([
      ...recordKeys(rec),
      cell(rec.species),
      cell(rec.triage),
      cell(rec.height),
      cell(rec.spread),
      cell(rec.dbh),
      cell(rec.officer),
      cell(inspDateTime(rec)),
      cell(rec.date),
      cell(rec.time),
      cell(rec.last_insp_date),
      cell(rec.overallTreeRisk),
      cell(rec.overallResidualRisk),
      cell(rec.nextInspectionDate),
      cell(rec.notes),
    ]);

    for (const t of rec.targets || []) {
      targets.push([
        ...recordKeys(rec),
        cell(t.no),
        cell(t.description),
        cell(t.zone),
        cell(t.occupancy),
        cell(t.remove),
        cell(t.restrict),
      ]);
    }

    for (const r of rec.risks || []) {
      risks.push([
        ...recordKeys(rec),
        cell(r.no),
        cell(r.treePart),
        cell(r.condition),
        cell(r.partSize),
        cell(r.fallDistance),
        cell(r.failure),
        cell(r.impact),
        cell(r.failureAndImpact),
        cell(r.consequences),
        cell(r.riskRating),
      ]);
    }

    for (const m of rec.mitigations || []) {
      mitigations.push([
        ...recordKeys(rec),
        cell(m.no),
        cell(m.treePart),
        cell(m.measures),
        cell(m.completionDate),
        cell(m.residualRisk),
      ]);
    }
  }

  return {
    filename: TARGET_ASSESSMENT_XLSX_FILENAME,
    sheets: [
      { name: TARGET_ASSESSMENT_SHEET_NAMES.summary, aoa: summary },
      { name: TARGET_ASSESSMENT_SHEET_NAMES.targets, aoa: targets },
      { name: TARGET_ASSESSMENT_SHEET_NAMES.risks, aoa: risks },
      { name: TARGET_ASSESSMENT_SHEET_NAMES.mitigations, aoa: mitigations },
    ],
  };
}
