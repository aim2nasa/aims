/**
 * Phase 2: God Object 해체 - CFD.css 크로스 컴포넌트 오버라이드 이전 스크립트
 *
 * CustomerFullDetailView.css에서 자식 컴포넌트를 오버라이드하는 CSS를
 * 각 자식 컴포넌트 CSS 파일로 이전합니다.
 *
 * 이전된 코드는 @layer views { } 블록에 배치되어 layer 우선순위를 유지합니다.
 *
 * Usage: node scripts/migrate-cfd-overrides.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ========================================
// Configuration: source and targets
// ========================================

const CFD_PATH = path.join(ROOT, 'src/features/customer/views/CustomerFullDetailView/CustomerFullDetailView.css');
const TABS_DIR = path.join(ROOT, 'src/features/customer/views/CustomerDetailView/tabs');

const TARGET_FILES = {
  contracts: path.join(TABS_DIR, 'ContractsTab.css'),
  documents: path.join(TABS_DIR, 'DocumentsTab.css'),
  annualReport: path.join(TABS_DIR, 'AnnualReportTab.css'),
  customerReview: path.join(TABS_DIR, 'CustomerReviewTab.css'),
  relationships: path.join(TABS_DIR, 'RelationshipsTab.css'),
  memos: path.join(TABS_DIR, 'MemosTab.css'),
};

// ========================================
// Read CFD.css
// ========================================

const cfdContent = fs.readFileSync(CFD_PATH, 'utf8');
const cfdLines = cfdContent.split('\n');
console.log(`[READ] CFD.css: ${cfdLines.length} lines`);

// ========================================
// Helper: extract lines (1-indexed, inclusive)
// ========================================

function extractLines(start, end) {
  // Convert to 0-indexed
  return cfdLines.slice(start - 1, end).join('\n');
}

// ========================================
// Helper: remove leading indentation from CFD (2 spaces inside @layer views)
// The overrides in CFD.css have 2-space indentation (inside @layer views { })
// When moving to child files, we re-indent them inside new @layer views { }
// ========================================

function dedentCfdBlock(text) {
  // CFD content has 2-space base indent (inside @layer views)
  // We keep the same indentation for the new @layer views block
  return text;
}

// ========================================
// Define extraction ranges for each target
// Format: { lines: [start, end], comment: string }
// ========================================

const EXTRACTIONS = {
  // Group 1: Relationships overrides (lines 769-843)
  relationships: [
    { lines: [769, 843], comment: 'RelationshipsTable compact overrides' },
  ],

  // Group 2: MemoField overrides (lines 912-924)
  memos: [
    { lines: [912, 924], comment: 'MemoField full-height overrides' },
  ],

  // Group 3: Contracts overrides (lines 1131-1354, 1395-1399)
  // Note: lines 1126-1130 (.section-content--contracts { padding: 0; }) stays in CFD
  // Note: lines 1355-1393 (shared pagination) - we split to each section
  contracts: [
    { lines: [1131, 1354], comment: 'Contracts section compact layout' },
    { lines: [1395, 1399], comment: 'Contracts pagination info' },
  ],

  // Group 5: Documents overrides (lines 1409-1632)
  // Note: line 1405-1407 (.section-content--documents { padding: 0; }) stays in CFD
  documents: [
    { lines: [1409, 1632], comment: 'Documents section compact layout' },
  ],

  // Group 6: Report overrides - shared (both AR + CRS)
  // This gets split: common styles go to AnnualReportTab (primary), CRS-specific to CustomerReviewTab
  annualReport: [
    { lines: [1645, 1669], comment: 'Report section layout + tab container' },
    { lines: [1671, 1808], comment: 'Shared AR+CRS table header/body/row/pagination styles' },
    { lines: [1810, 1906], comment: 'Annual Report specific (grid-cols, cells, empty, pagination)' },
    { lines: [1908, 1961], comment: 'Report section IosDropdown + pagination controls' },
  ],

  // CRS-specific overrides (subset of Group 6 that's CRS-only)
  // The grid-cols for customer-review are already defined in the shared block above
  // CustomerReviewTab.css doesn't need separate extraction since AR+CRS share most styles
  // The shared styles will go to AnnualReportTab.css which both AR and CRS are rendered inside

  // Group 7: Typography normalization (lines 1996-2099)
  // Group 8: Header cell overrides (lines 2461-2496)
  // Group 9: Duplicate (lines 2498-2535) - DELETE, don't move
};

// Shared pagination overrides (Group 4, lines 1355-1393)
// These apply to all 3 sections - split into each target
const SHARED_PAGINATION = extractLines(1355, 1393);

// Typography per-section (Group 7, lines 1996-2099)
const TYPOGRAPHY_ALL = extractLines(1996, 2099);

// Header cell overrides (Group 8, lines 2461-2496)
const HEADER_CELL_OVERRIDES = extractLines(2461, 2496);

// Responsive overrides - 768px (cross-component parts only)
const RESPONSIVE_768_DOCS = extractLines(2258, 2294);
const RESPONSIVE_768_AR = extractLines(2296, 2311);
const RESPONSIVE_768_CRS = extractLines(2313, 2329);
const RESPONSIVE_768_CONTRACTS = extractLines(2331, 2335);

// Responsive overrides - 480px (cross-component parts only)
const RESPONSIVE_480_DOCS = extractLines(2412, 2428);
const RESPONSIVE_480_AR = extractLines(2435, 2451);
const RESPONSIVE_480_CRS = extractLines(2453, 2458);

// ========================================
// Build @layer views blocks for each target
// ========================================

function buildLayerBlock(sections, componentName) {
  let content = '';
  content += '\n\n/* ============================================\n';
  content += `   🍎 CustomerFullDetailView context overrides\n`;
  content += `   ${componentName}가 고객 상세뷰(CFD) 내부에서 렌더될 때의 컴팩트 스타일.\n`;
  content += `   Phase 2에서 CFD.css God Object 해체로 이전됨.\n`;
  content += '   ============================================ */\n\n';
  content += '@layer views {\n';

  for (const section of sections) {
    content += `\n  /* --- ${section.comment} --- */\n`;
    content += section.content + '\n';
  }

  content += '\n} /* end @layer views (CFD context) */\n';
  return content;
}

// ========================================
// Prepare content for each target file
// ========================================

// --- ContractsTab.css ---
const contractsSections = [];
for (const ext of EXTRACTIONS.contracts) {
  contractsSections.push({
    comment: ext.comment,
    content: extractLines(...ext.lines),
  });
}
// Add contracts-specific shared pagination
contractsSections.push({
  comment: 'Shared pagination buttons (contracts portion)',
  content: `  /* 🍎 페이지네이션 버튼 스타일 */
  .customer-full-detail__section-content--contracts .pagination-button {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-neutral-700);
    font-weight: 600;
  }

  .customer-full-detail__section-content--contracts .pagination-button:hover {
    opacity: 0.6;
  }

  .customer-full-detail__section-content--contracts .pagination-button:active,
  .customer-full-detail__section-content--contracts .pagination-button:focus {
    background: transparent;
    outline: none;
    box-shadow: none;
  }

  .customer-full-detail__section-content--contracts .pagination-arrow {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-neutral-700);
  }`,
});
// Add contracts-specific typography (from Group 7)
contractsSections.push({
  comment: 'Typography normalization (contracts)',
  content: `  /* 🍎 보험계약 데이터 셀 - 12px, weight 400 */
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-product,
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-date,
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-policy,
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-premium,
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-payment-day,
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-cycle {
    font-size: var(--font-body);
    font-weight: var(--weight-normal);
    color: var(--text-color);
  }

  /* 🍎 테이블 헤더 행 - 11px, semibold */
  .customer-full-detail .customer-full-detail__section-content--contracts .customer-contracts-list-header,
  .customer-full-detail .customer-full-detail__section-content--contracts .customer-contracts-list-header span {
    font-size: var(--font-header);
    font-weight: var(--weight-semibold);
  }

  /* 🍎 상태 배지 - 10px */
  .customer-full-detail .customer-full-detail__section-content--contracts .contract-status {
    font-size: var(--font-micro);
    font-weight: var(--weight-normal);
  }

  /* 🍎 페이지네이션 - 10px */
  .customer-full-detail .contract-pagination,
  .customer-full-detail .contract-pagination .pagination-info,
  .customer-full-detail .contract-pagination .pagination-limit {
    font-size: var(--font-micro);
  }`,
});
// Add contracts responsive
contractsSections.push({
  comment: 'Responsive 768px (contracts)',
  content: `  @media (max-width: 768px) {
    /* 🍎 계약 테이블: 가로 스크롤 허용 */
    .customer-full-detail .customer-full-detail__section-content--contracts {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }`,
});

// --- DocumentsTab.css ---
const documentsSections = [];
for (const ext of EXTRACTIONS.documents) {
  documentsSections.push({
    comment: ext.comment,
    content: extractLines(...ext.lines),
  });
}
documentsSections.push({
  comment: 'Shared pagination buttons (documents portion)',
  content: `  /* 🍎 페이지네이션 버튼 스타일 */
  .customer-full-detail__section-content--documents .pagination-button {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-neutral-700);
    font-weight: 600;
  }

  .customer-full-detail__section-content--documents .pagination-button:hover {
    opacity: 0.6;
  }

  .customer-full-detail__section-content--documents .pagination-button:active,
  .customer-full-detail__section-content--documents .pagination-button:focus {
    background: transparent;
    outline: none;
    box-shadow: none;
  }

  .customer-full-detail__section-content--documents .pagination-arrow {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-neutral-700);
  }`,
});
documentsSections.push({
  comment: 'Typography normalization (documents)',
  content: `  /* 🍎 문서 텍스트 셀 - 12px, weight 400 */
  .customer-full-detail .customer-full-detail__section-content--documents .status-filename,
  .customer-full-detail .customer-full-detail__section-content--documents .document-size,
  .customer-full-detail .customer-full-detail__section-content--documents .document-type,
  .customer-full-detail .customer-full-detail__section-content--documents .status-date {
    font-size: var(--font-body);
    font-weight: var(--weight-normal);
    color: var(--text-color);
  }

  /* 🍎 타입 컬럼 스타일 */
  .customer-full-detail__section-content--documents .document-type {
    text-align: center;
    text-transform: uppercase;
    font-size: 10px;
  }

  /* 🍎 연결일 컬럼 스타일 */
  .customer-full-detail__section-content--documents .status-date {
    text-align: center;
    font-size: 10px;
  }

  /* 🍎 테이블 헤더 행 - 11px, semibold */
  .customer-full-detail .customer-full-detail__section-content--documents .customer-documents-list-header,
  .customer-full-detail .customer-full-detail__section-content--documents .customer-documents-list-header span {
    font-size: var(--font-header);
    font-weight: var(--weight-semibold);
  }

  /* 🍎 페이지네이션 - 10px */
  .customer-full-detail .document-pagination,
  .customer-full-detail .document-pagination .pagination-info,
  .customer-full-detail .document-pagination .pagination-limit {
    font-size: var(--font-micro);
  }`,
});
documentsSections.push({
  comment: 'Responsive 768px (documents)',
  content: RESPONSIVE_768_DOCS,
});
documentsSections.push({
  comment: 'Responsive 480px (documents)',
  content: `  @media (max-width: 480px) {
${RESPONSIVE_480_DOCS}
  }`,
});

// --- AnnualReportTab.css ---
const annualReportSections = [];
for (const ext of EXTRACTIONS.annualReport) {
  annualReportSections.push({
    comment: ext.comment,
    content: extractLines(...ext.lines),
  });
}
annualReportSections.push({
  comment: 'Shared pagination buttons (report portion)',
  content: `  /* 🍎 페이지네이션 버튼 스타일 */
  .customer-full-detail__section-content--report .pagination-button {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-neutral-700);
    font-weight: 600;
  }

  .customer-full-detail__section-content--report .pagination-button:hover {
    opacity: 0.6;
  }

  .customer-full-detail__section-content--report .pagination-button:active,
  .customer-full-detail__section-content--report .pagination-button:focus {
    background: transparent;
    outline: none;
    box-shadow: none;
  }

  .customer-full-detail__section-content--report .pagination-arrow {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-neutral-700);
  }`,
});
annualReportSections.push({
  comment: 'Typography normalization (report)',
  content: `  /* 🍎 Annual Report 데이터 셀 - 12px, weight 400 */
  .customer-full-detail .customer-full-detail__section-content--report .row-owner,
  .customer-full-detail .customer-full-detail__section-content--report .row-issue-date,
  .customer-full-detail .customer-full-detail__section-content--report .row-parsed-at,
  .customer-full-detail .customer-full-detail__section-content--report .row-premium,
  .customer-full-detail .customer-full-detail__section-content--report .row-count {
    font-size: var(--font-body);
    font-weight: var(--weight-normal);
    color: var(--text-color);
  }

  /* 🍎 Customer Review 데이터 셀 */
  .customer-full-detail .customer-full-detail__section-content--report .row-contractor,
  .customer-full-detail .customer-full-detail__section-content--report .row-policy-number,
  .customer-full-detail .customer-full-detail__section-content--report .row-product {
    font-size: var(--font-body);
    font-weight: var(--weight-normal);
    color: var(--text-color);
  }

  /* 🍎 테이블 헤더 행 - 11px, semibold */
  .customer-full-detail .customer-full-detail__section-content--report .annual-report-table-header,
  .customer-full-detail .customer-full-detail__section-content--report .annual-report-table-header div,
  .customer-full-detail .customer-full-detail__section-content--report .customer-review-table-header,
  .customer-full-detail .customer-full-detail__section-content--report .customer-review-table-header div {
    font-size: var(--font-header);
    font-weight: var(--weight-semibold);
  }

  /* 🍎 상태 배지 - 10px */
  .customer-full-detail .customer-full-detail__section-content--report .status-badge {
    font-size: var(--font-micro);
    font-weight: var(--weight-normal);
  }

  /* 🍎 페이지네이션 - 10px */
  .customer-full-detail .annual-report-pagination,
  .customer-full-detail .customer-review-pagination,
  .customer-full-detail .annual-report-pagination .pagination-info,
  .customer-full-detail .annual-report-pagination .pagination-limit,
  .customer-full-detail .customer-review-pagination .pagination-info,
  .customer-full-detail .customer-review-pagination .pagination-limit {
    font-size: var(--font-micro);
  }

  /* Annual Report 헤더 셀 */
  .customer-full-detail .customer-full-detail__section-content--report .header-owner,
  .customer-full-detail .customer-full-detail__section-content--report .header-issue-date,
  .customer-full-detail .customer-full-detail__section-content--report .header-parsed-at,
  .customer-full-detail .customer-full-detail__section-content--report .header-premium,
  .customer-full-detail .customer-full-detail__section-content--report .header-count,
  .customer-full-detail .customer-full-detail__section-content--report .header-status,
  .customer-full-detail .customer-full-detail__section-content--report .annual-report-table__header-content,
  .customer-full-detail .customer-full-detail__section-content--report .annual-report-table__header-content span,
  /* Customer Review 헤더 셀 */
  .customer-full-detail .customer-full-detail__section-content--report .header-contractor,
  .customer-full-detail .customer-full-detail__section-content--report .header-policy-number,
  .customer-full-detail .customer-full-detail__section-content--report .header-product,
  .customer-full-detail .customer-full-detail__section-content--report .customer-review-table__header-content,
  .customer-full-detail .customer-full-detail__section-content--report .customer-review-table__header-content span {
    font-size: var(--font-header);
    font-weight: 600;
    color: var(--color-text-tertiary);
  }`,
});
annualReportSections.push({
  comment: 'Responsive 768px (report)',
  content: `${RESPONSIVE_768_AR}

${RESPONSIVE_768_CRS}`,
});
annualReportSections.push({
  comment: 'Responsive 480px (report)',
  content: `  @media (max-width: 480px) {
${RESPONSIVE_480_AR}

${RESPONSIVE_480_CRS}
  }`,
});

// --- RelationshipsTab.css ---
const relationshipsSections = [];
for (const ext of EXTRACTIONS.relationships) {
  relationshipsSections.push({
    comment: ext.comment,
    content: extractLines(...ext.lines),
  });
}
relationshipsSections.push({
  comment: 'Typography normalization (relationships)',
  content: `  /* 🍎 고객정보 테이블 - 모든 셀 */
  .customer-full-detail .customer-full-detail__section-content .customer-info-table td,
  .customer-full-detail .customer-full-detail__section-content .customer-info-table__label,
  .customer-full-detail .customer-full-detail__section-content .customer-info-table__value {
    font-size: var(--font-body);
    font-weight: var(--weight-normal);
    color: var(--text-color);
  }

  /* 🍎 가족관계 테이블 - 데이터 셀 (td) */
  .customer-full-detail .customer-full-detail__section-content .relationships-table td {
    font-size: var(--font-body);
    font-weight: var(--weight-normal);
    color: var(--text-color);
  }

  /* 🍎 가족관계 테이블 - 헤더 셀 (th) - 11px, semibold */
  .customer-full-detail .customer-full-detail__section-content .relationships-table th {
    font-size: var(--font-header);
    font-weight: var(--weight-semibold);
    color: var(--label-color);
  }

  /* 🍎 관계유형 텍스트 크기 통일 */
  .customer-full-detail .customer-full-detail__section-content .relationships-category,
  .customer-full-detail .customer-full-detail__section-content .relationships-category__reverse,
  .customer-full-detail .customer-full-detail__section-content .relationships-link {
    font-size: var(--font-body);
    font-weight: 400;
  }

  .customer-full-detail .customer-full-detail__section-content .relationships-category__label {
    font-size: var(--font-body);
    font-weight: 400;
  }`,
});

// --- MemosTab.css ---
const memosSections = [];
for (const ext of EXTRACTIONS.memos) {
  memosSections.push({
    comment: ext.comment,
    content: extractLines(...ext.lines),
  });
}

// ========================================
// Append to child CSS files
// ========================================

function appendToFile(filePath, layerContent, componentName) {
  const existing = fs.readFileSync(filePath, 'utf8');
  const block = buildLayerBlock(layerContent, componentName);
  fs.writeFileSync(filePath, existing + block, 'utf8');
  console.log(`[APPEND] ${path.basename(filePath)}: +${block.split('\n').length} lines`);
}

appendToFile(TARGET_FILES.contracts, contractsSections, 'ContractsTab');
appendToFile(TARGET_FILES.documents, documentsSections, 'DocumentsTab');
appendToFile(TARGET_FILES.annualReport, annualReportSections, 'AnnualReportTab');
appendToFile(TARGET_FILES.relationships, relationshipsSections, 'RelationshipsTab');
appendToFile(TARGET_FILES.memos, memosSections, 'MemosTab');

// ========================================
// Rebuild CFD.css - keep only own layout
// ========================================

// Lines to KEEP (1-indexed, inclusive ranges)
const KEEP_RANGES = [
  [1, 768],      // Core layout, variables, actions, resize handles, rows, sections, customer-info-grid
  [845, 911],    // customer-info-tabs, customer-info-memos container
  [926, 1130],   // report-tabs, history-tabs, report-tab-panel, report-placeholder, contracts section padding
  // Skip 1131-1399: contracts overrides (moved)
  [1401, 1407],  // Documents section heading comment + padding
  // Skip 1409-1632: documents overrides (moved)
  [1634, 1643],  // Report section heading comment + padding/flex
  // Skip 1645-1961: report overrides (moved)
  [1963, 1994],  // Customer icon + universal font-family
  // Skip 1996-2099: typography normalization (moved)
  [2065, 2069],  // Section title font override
  [2101, 2120],  // 1000px responsive (own layout)
  [2122, 2257],  // 768px responsive (own layout parts)
  // Skip 2258-2335: 768px responsive cross-component (moved)
  [2337, 2349],  // 768px responsive (own layout: reset button, section count)
  // Close the 768px media query - handled by line 2349
  [2351, 2411],  // 480px responsive heading + own layout parts
  // Skip 2412-2458: 480px responsive cross-component (moved)
  // Close the 480px media query
  [2459, 2460],  // Closing brace of 480px media query + blank line
  // Skip 2461-2535: header cell overrides + Group 9 duplicate (moved/deleted)
  [2537, 2807],  // Mobile tab layout + end
];

let newCfdLines = [];
for (const [start, end] of KEEP_RANGES) {
  for (let i = start - 1; i < end && i < cfdLines.length; i++) {
    newCfdLines.push(cfdLines[i]);
  }
}

// Write new CFD.css
const newCfdContent = newCfdLines.join('\n');
fs.writeFileSync(CFD_PATH, newCfdContent, 'utf8');
console.log(`[WRITE] CFD.css: ${cfdLines.length} → ${newCfdLines.length} lines (${cfdLines.length - newCfdLines.length} lines removed)`);

// ========================================
// Summary
// ========================================

console.log('\n=== Migration Summary ===');
console.log(`CFD.css: ${cfdLines.length} → ${newCfdLines.length} lines`);
for (const [name, filePath] of Object.entries(TARGET_FILES)) {
  const newContent = fs.readFileSync(filePath, 'utf8');
  console.log(`${path.basename(filePath)}: ${newContent.split('\n').length} lines`);
}
console.log('\nDone! Run "npm run build" to verify.');
