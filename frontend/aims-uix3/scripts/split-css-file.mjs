/**
 * Phase 3: 대형 CSS 파일 분할 자동화 스크립트
 *
 * CSS 파일을 논리적 섹션 단위로 분할하고, @layer 래퍼를 보존합니다.
 * TSX import도 자동 업데이트합니다.
 *
 * Usage:
 *   node scripts/split-css-file.mjs --analyze <file>     # 파일 분석 (섹션/분할 제안)
 *   node scripts/split-css-file.mjs --dry-run [tier]      # 분할 미리보기
 *   node scripts/split-css-file.mjs --execute [tier]      # 실제 분할 수행
 *
 * [tier] = 1, 2, 3, or 'all' (default: 'all')
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const MAX_LINES = 500;

// ========================================
// Analyze mode: inspect a CSS file
// ========================================

function analyzeFile(filePath) {
  const absPath = path.resolve(filePath);
  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  console.log(`\n📄 ${path.relative(ROOT, absPath)} (${lines.length} lines)\n`);

  // Find @layer blocks
  const layers = findLayerBlocks(lines);
  for (const layer of layers) {
    console.log(`  @layer ${layer.name}: lines ${layer.openLine}-${layer.closeLine} (${layer.closeLine - layer.openLine + 1} lines)`);
  }

  // Find section markers
  const sectionPattern = /^\s*\/\*\s*={2,}/;
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    if (sectionPattern.test(lines[i])) {
      // Extract section name from this line or next line
      let name = lines[i].replace(/^\s*\/\*\s*=+\s*/, '').replace(/\s*=+\s*\*\/\s*$/, '').trim();
      if (!name && i + 1 < lines.length) {
        name = lines[i + 1].replace(/^\s*/, '').replace(/\s*$/, '').trim();
      }
      // Determine which @layer this section belongs to
      let layerName = null;
      for (const layer of layers) {
        if (i + 1 >= layer.openLine && i + 1 <= layer.closeLine) {
          layerName = layer.name;
          break;
        }
      }
      sections.push({ line: i + 1, name: name || '(unnamed)', layer: layerName });
    }
  }

  console.log(`\n  Sections (${sections.length}):`);
  for (let i = 0; i < sections.length; i++) {
    const nextLine = i + 1 < sections.length ? sections[i + 1].line : lines.length;
    const size = nextLine - sections[i].line;
    const warn = size > MAX_LINES ? ' ⚠️ OVER 500' : '';
    console.log(`    L${String(sections[i].line).padStart(5)}: (${String(size).padStart(4)} lines) [${sections[i].layer}] ${sections[i].name}${warn}`);
  }

  // Suggest splits
  console.log(`\n  Suggested splits (≤${MAX_LINES} lines each):`);
  const OVERHEAD = 7; // @layer wrapper + comments
  const budget = MAX_LINES - OVERHEAD;

  for (const layer of layers) {
    const layerSections = sections.filter(s => s.layer === layer.name);
    if (layerSections.length === 0) continue;

    let groups = [];
    let currentGroup = { startLine: null, sections: [], totalLines: 0 };

    for (let i = 0; i < layerSections.length; i++) {
      const sec = layerSections[i];
      const nextLine = i + 1 < layerSections.length
        ? layerSections[i + 1].line
        : layer.closeLine;
      const secLines = nextLine - sec.line;

      if (currentGroup.startLine === null) {
        currentGroup.startLine = sec.line;
      }

      if (currentGroup.totalLines + secLines > budget && currentGroup.sections.length > 0) {
        // Finalize current group
        groups.push({ ...currentGroup, endLine: sec.line - 1 });
        currentGroup = { startLine: sec.line, sections: [sec.name], totalLines: secLines };
      } else {
        currentGroup.sections.push(sec.name);
        currentGroup.totalLines += secLines;
      }
    }

    if (currentGroup.sections.length > 0) {
      groups.push({ ...currentGroup, endLine: layer.closeLine - 1 });
    }

    // Also handle content before first section marker
    if (layerSections.length > 0 && layerSections[0].line > layer.openLine + 1) {
      const preContent = layerSections[0].line - layer.openLine - 1;
      if (preContent > 0) {
        // Prepend to first group
        groups[0].startLine = layer.openLine + 1;
        groups[0].totalLines += preContent;
        groups[0].sections.unshift('(root)');
      }
    }

    console.log(`\n    @layer ${layer.name} → ${groups.length} files:`);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const total = g.totalLines + OVERHEAD;
      const warn = total > MAX_LINES ? ' ⚠️ OVER' : '';
      console.log(`      ${i + 1}. lines ${g.startLine}-${g.endLine} (${g.totalLines} content + ${OVERHEAD} overhead = ${total} total)${warn}`);
      console.log(`         Sections: ${g.sections.join(', ')}`);
    }
  }

  console.log('');
}

// ========================================
// Find @layer blocks in CSS lines
// ========================================

function findLayerBlocks(lines) {
  const blocks = [];
  const layerOpenRegex = /^@layer\s+(\w+)\s*\{/;
  const layerCloseRegex = /^\}\s*\/\*\s*end\s+@layer/;

  for (let i = 0; i < lines.length; i++) {
    const openMatch = lines[i].match(layerOpenRegex);
    if (openMatch) {
      const name = openMatch[1];
      // Find matching close
      for (let j = i + 1; j < lines.length; j++) {
        if (layerCloseRegex.test(lines[j])) {
          blocks.push({ name, openLine: i + 1, closeLine: j + 1 });
          break;
        }
      }
    }
  }

  return blocks;
}

// ========================================
// Split configurations
// ========================================

function getConfigs(tier) {
  const all = [...TIER1_CONFIGS, ...TIER2_CONFIGS, ...TIER3_CONFIGS];
  if (tier === 'all') return all;
  if (tier === 1) return TIER1_CONFIGS;
  if (tier === 2) return TIER2_CONFIGS;
  if (tier === 3) return TIER3_CONFIGS;
  return all;
}

// Each config: { source, splits: [{ name, fromLine, toLine, layer? }] }
// fromLine/toLine are 1-indexed, inclusive (original file line numbers)
// layer is optional (defaults to first @layer block found)

// ========================================
// TIER 1: Ultra-large files (2000+ lines)
// ========================================

const TIER1_CONFIGS = [
  {
    source: 'components/ContractViews/components/ExcelRefiner.css',
    splits: [
      // root + main + dropzone + format guide + content + header-bar + badge + tabs
      { name: 'layout', fromLine: 7, toLine: 479 },
      // wizard steps + action bar + action log
      { name: 'wizard', fromLine: 480, toLine: 939 },
      // sheet tabs (small but distinct section)
      { name: 'sheets', fromLine: 940, toLine: 1054 },
      // table core
      { name: 'table', fromLine: 1055, toLine: 1517 },
      // cell states + cell editing + delete mode + checkbox + footer + doc viewer + import progress + confirm modal
      { name: 'editing', fromLine: 1518, toLine: 1897 },
      // duplicate modal + action log clickable + 일괄등록 상세 결과 모달
      { name: 'modals', fromLine: 1898, toLine: 2364 },
      // 일괄등록 결과 탭/테이블 + responsive
      { name: 'results', fromLine: 2365, toLine: 2767 },
    ],
  },
  {
    source: 'components/DocumentViews/DocumentSearchView/DocumentSearchView.css',
    splits: [
      // container + search bar + dropdown + error + results section + empty state
      { name: 'search', fromLine: 11, toLine: 426 },
      // AI answer + results header + column header + results table view
      { name: 'results', fromLine: 427, toLine: 843 },
      // selected state + scrollbar
      { name: 'table', fromLine: 844, toLine: 1328 },
      // animations + accessibility + memo + customer button + selected customer display
      { name: 'controls', fromLine: 1329, toLine: 1553 },
      // search guide + recent search dropdown + customer icon
      { name: 'guide', fromLine: 1554, toLine: 2042 },
      // location actions + location modal + responsive
      { name: 'responsive', fromLine: 2043, toLine: 2500 },
    ],
  },
  {
    source: 'features/customer/views/CustomerDetailView/tabs/ContractsTab.css',
    splits: [
      // root + state + list container + column header + sortable + list item + cells + badges
      { name: 'layout', fromLine: 7, toLine: 479 },
      // AR accordion section
      { name: 'ar-accordion', fromLine: 480, toLine: 785 },
      // AR contract history (11-column)
      { name: 'ar-history', fromLine: 786, toLine: 1256 },
      // CRS contract history (10-column) + badges
      { name: 'cr-history', fromLine: 1257, toLine: 1681 },
      // responsive (768px + 480px)
      { name: 'responsive', fromLine: 1682, toLine: 1783 },
      // @layer views: CFD context overrides
      { name: 'cfd-overrides', fromLine: 1794, toLine: 2098, layer: 'views' },
    ],
  },
  {
    source: 'components/ChatPanel/ChatPanel.css',
    splits: [
      // root + resize handle + header + help panel
      { name: 'layout', fromLine: 8, toLine: 282 },
      // session list + data stats overlay + messages
      { name: 'sessions', fromLine: 283, toLine: 568 },
      // welcome screen + question tabs + saved questions
      { name: 'welcome', fromLine: 569, toLine: 903 },
      // input save button + input area + dark theme + detached mode
      { name: 'input', fromLine: 904, toLine: 1391 },
      // context menu + highlights + markdown + links + example modal + file attachment + minimized
      { name: 'extras', fromLine: 1392, toLine: 1865 },
      // responsive + touch targets
      { name: 'responsive', fromLine: 1866, toLine: 2049 },
    ],
  },
];

// ========================================
// TIER 2: Large files (1500-2000 lines) — to be filled after Tier 1 commit
// ========================================

const TIER2_CONFIGS = [
  {
    source: 'features/AccountSettings/AccountSettingsView.css',
    splits: [
      // tabs + content + profile header + header actions + edit button + grid layout + section + profile legacy + field
      { name: 'profile', fromLine: 15, toLine: 483 },
      // toggle + actions + link + responsive + reduced motion + delete modal
      { name: 'settings', fromLine: 484, toLine: 798 },
      // storage card + data management grid + danger action card
      { name: 'storage', fromLine: 799, toLine: 1158 },
      // settings action card + settings toggle card + settings toggle + AI usage
      { name: 'cards', fromLine: 1159, toLine: 1511 },
      // data tab unified styles + 모바일 반응형
      { name: 'data', fromLine: 1512, toLine: 1948 },
    ],
  },
  {
    source: 'components/DocumentViews/DocumentExplorerView/DocumentExplorerView.css',
    splits: [
      // variables + toolbar (split before date-filter-clear:hover → fits under 500)
      { name: 'toolbar', fromLine: 11, toLine: 497 },
      // date-filter-clear:hover + tree container + tree + group node + document node + file type icon colors
      { name: 'tree', fromLine: 498, toLine: 980 },
      // recent documents + dark mode + keyboard nav + search highlight + hover preview
      { name: 'features', fromLine: 981, toLine: 1316 },
      // date jump + 태블릿 반응형 + 폰 가로 모드
      { name: 'datejump', fromLine: 1317, toLine: 1645 },
      // 모바일 반응형 (480px 이하)
      { name: 'mobile', fromLine: 1646, toLine: 1882 },
    ],
  },
  {
    source: 'components/DocumentViews/DocumentStatusView/components/DocumentStatusList.css',
    splits: [
      // column header + alignment + sortable + sort indicator + scrollbar + states + status item + selected
      { name: 'header', fromLine: 7, toLine: 439 },
      // 상태 셀 + 아이콘 + 텍스트 + 파일명 + 크기 + 타입 + 날짜 + 고객 + customer icon + 액션 버튼
      { name: 'cells', fromLine: 440, toLine: 863 },
      // responsive (768px, 480px) + 삭제모드 + 파일타입 아이콘 + icon colors + delete mode + memo + badge type + PDF 변환
      { name: 'responsive', fromLine: 864, toLine: 1352 },
      // 고객리뷰 displayName + 레거시 배지 + 내파일 + accessibility + document type + 바이러스
      { name: 'badges', fromLine: 1353, toLine: 1786 },
    ],
  },
  {
    source: 'components/InquiryView/InquiryView.css',
    splits: [
      // root + search bar + result header + list header + sortable + sort indicator + inquiry list + row + empty + loading
      { name: 'list', fromLine: 10, toLine: 495 },
      // create form + detail view
      { name: 'form', fromLine: 496, toLine: 867 },
      // 카카오톡 스타일 메시지
      { name: 'messages', fromLine: 868, toLine: 1358 },
      // system message + title icon + back button + unread indicator + 이미지 미리보기 모달
      { name: 'extras', fromLine: 1359, toLine: 1646 },
    ],
  },
  {
    source: 'features/customer/views/CustomerDetailView/tabs/DocumentsTab.css',
    splits: [
      // root + 상태 + 리스트 컨테이너 + column header + alignment + sortable + sort indicator + scrollbar + list item + 파일타입 + 파일명 + PDF 변환 배지 + 크기 + 연결일 + 페이지네이션
      { name: 'layout', fromLine: 16, toLine: 498 },
      // 간편 문서검색 + PDF 변환 상태 배지 + memo button + delete mode
      { name: 'features', fromLine: 499, toLine: 953 },
      // document type column + 고객리뷰 displayName + column resize + 반응형 (1252 is @layer close, exclude)
      { name: 'extras', fromLine: 954, toLine: 1251 },
      // @layer views: CFD context overrides
      { name: 'cfd-overrides', fromLine: 1261, toLine: 1616, layer: 'views' },
    ],
  },
  {
    source: 'features/customer/views/CustomerFullDetailView/CustomerFullDetailView.css',
    splits: [
      // root + 폰트 + 상태 + 액션 + 콘텐츠 2행 + 리사이즈 핸들 + 섹션 공통 + 섹션 헤더 + 검색 입력 + 섹션 컨텐츠
      { name: 'layout', fromLine: 12, toLine: 432, layer: 'views' },
      // 고객 정보 테이블 + 반응형 그리드 + 고객 정보 탭
      { name: 'customer-info', fromLine: 433, toLine: 839, layer: 'views' },
      // 보고서 탭 + 보험계약 + 문서 + 보고서 섹션 + 아이콘 + typography + 반응형 (tablet, mobile, small)
      { name: 'tabs', fromLine: 840, toLine: 1326, layer: 'views' },
      // 모바일 탭 레이아웃
      { name: 'mobile', fromLine: 1327, toLine: 1595, layer: 'views' },
    ],
  },
  {
    source: 'features/customer/views/CustomerDetailView/tabs/AnnualReportTab.css',
    splits: [
      // container + parsing notice + actions + states + header + table container + table header + table body + table row + 상태별 + checkbox
      { name: 'layout', fromLine: 13, toLine: 456 },
      // row cells + pagination + summary + stats + actions + contract preview + responsive + 정렬 헤더
      { name: 'table', fromLine: 457, toLine: 922 },
      // 파싱 실패/진행중 상태 + column resize
      { name: 'states', fromLine: 923, toLine: 1078 },
      // @layer views: CFD context overrides (공통 테이블 + 연간보고서 + 고객리뷰)
      { name: 'cfd-overrides', fromLine: 1089, toLine: 1570, layer: 'views' },
    ],
  },
  {
    source: 'components/DocumentViews/PersonalFilesView/PersonalFilesView.css',
    splits: [
      // root + 리사이저 핸들 + 좌측 사이드바 + 우측 메인 영역 (split before active button)
      { name: 'layout', fromLine: 12, toLine: 494 },
      // active button + 파일 목록 컨텐츠 + 리스트 뷰 + 그리드 뷰 + 컨텍스트 메뉴 + 모바일
      { name: 'list', fromLine: 495, toLine: 947 },
      // 정렬 가능한 컬럼 헤더 + 파일 타입 아이콘 + icon colors + 액션 버튼 + 상태 칼럼
      { name: 'icons', fromLine: 948, toLine: 1400 },
      // 폴링 및 새로고침 컨트롤 + delete mode
      { name: 'controls', fromLine: 1401, toLine: 1544 },
    ],
  },
];

// ========================================
// TIER 3: Medium files (1000-1500 lines) — to be filled after Tier 2 commit
// ========================================

const TIER3_CONFIGS = [
  {
    source: 'components/DocumentViews/DocumentRegistrationView/FileList/FileList.css',
    splits: [
      // root + file list + file item + drag + status + progress + complete + type column + memo
      { name: 'layout', fromLine: 9, toLine: 412 },
      // file type icon colors + dark theme icon colors
      { name: 'icons', fromLine: 413, toLine: 857 },
      // apple compact layout + compact icon colors (first half)
      { name: 'compact', fromLine: 858, toLine: 1109 },
      // compact icon colors (second half: progressive disclosure + hover states)
      { name: 'compact-icons', fromLine: 1110, toLine: 1378 },
    ],
  },
  {
    source: 'components/DocumentViews/DocumentLibraryView/DocumentLibraryView.css',
    splits: [
      // root + unified header + error + result header + result controls + sort + content + document list
      { name: 'header', fromLine: 10, toLine: 334 },
      // document list header + loading + empty + document item + selected + document icon
      { name: 'list', fromLine: 335, toLine: 705 },
      // file type icon colors + document info + status icon + badge + responsive + 폰 가로
      { name: 'icons', fromLine: 706, toLine: 1072 },
      // 모바일 카드형 + accessibility + 액션 버튼
      { name: 'mobile', fromLine: 1073, toLine: 1376 },
    ],
  },
  {
    source: 'components/DocumentViews/DocumentRegistrationView/components/BatchArMappingModal/BatchArMappingModal.css',
    splits: [
      // root + guide + summary + groups container + analyzing state + warning + footer
      { name: 'layout', fromLine: 9, toLine: 470 },
      // group card + file row + customer dropdown + draggable modal override + file summary
      { name: 'content', fromLine: 471, toLine: 935 },
      // registration result summary + dark mode
      { name: 'results', fromLine: 936, toLine: 1205 },
    ],
  },
  {
    source: 'components/ContractViews/ContractAllView.css',
    splits: [
      // root + search bar + 결과 헤더 + 미매칭 필터 + 계약 목록 + 스크롤바 + column header + resize
      { name: 'header', fromLine: 7, toLine: 457 },
      // sort indicator + 계약 행 + 고객유형 + 상품명 + 고객명 + 모달 + 납입상태 + 로딩/빈/에러 + 반응형
      { name: 'rows', fromLine: 458, toLine: 920 },
      // delete mode + 모바일 반응형 + 접근성
      { name: 'modes', fromLine: 921, toLine: 1197 },
    ],
  },
  {
    source: 'features/customer/views/AllCustomersView/AllCustomersView.css',
    splits: [
      // root + search bar + error + result header + customer list + column header + loading
      { name: 'header', fromLine: 12, toLine: 484 },
      // empty + customer item + selected + icon + customer info + responsive + 모바일 카드형 + accessibility
      { name: 'items', fromLine: 485, toLine: 951 },
      // 삭제 모드 + delete mode styles
      { name: 'delete', fromLine: 952, toLine: 1183 },
    ],
  },
  {
    source: 'components/CustomMenu/CustomMenu.css',
    splits: [
      // root + menu item + sub-menu + collapsed + vector icons + menu text + collapsed state
      { name: 'menu', fromLine: 15, toLine: 467 },
      // hover + selection + tooltips + theme icons + SF Symbol + accessibility + responsive + animation
      { name: 'states', fromLine: 468, toLine: 846 },
      // icon colors + scrolling + icon size + badge + usage + footer + responsive iPad
      { name: 'colors', fromLine: 847, toLine: 1156 },
    ],
  },
  {
    // NOTE: Header.css has @import on line 14 (outside @layer) — must add manually after split
    source: 'components/Header/Header.css',
    splits: [
      // keyframes + progressive disclosure + controls + branding + badge + buttons + search + AI + theme + pulse + accessibility
      { name: 'layout', fromLine: 17, toLine: 433 },
      // responsive + 모바일 햄버거 메뉴 버튼
      { name: 'mobile', fromLine: 434, toLine: 815 },
      // 테마별 + SF Symbols + 프로필 + 터치 기기 + 사용자 선택기
      { name: 'extras', fromLine: 816, toLine: 1072 },
    ],
  },
  {
    source: 'features/customer/components/CustomerReviewModal/CustomerReviewModal.css',
    splits: [
      // root + two columns + product + summary + persons + value + card + stats + list + table + empty + compact variants
      { name: 'layout', fromLine: 12, toLine: 468 },
      // compact table + dual value table + 모바일 반응형
      { name: 'compact', fromLine: 469, toLine: 894 },
      // mobile vertical layout
      { name: 'mobile', fromLine: 895, toLine: 1069 },
    ],
  },
];

// ========================================
// Execute split for a single file config
// ========================================

function splitFile(config, dryRun = false) {
  const sourcePath = path.join(SRC, config.source);
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ File not found: ${sourcePath}`);
    return false;
  }

  const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');
  const layers = findLayerBlocks(lines);
  const sourceDir = path.dirname(sourcePath);
  const baseName = path.basename(config.source, '.css');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📂 ${config.source} (${lines.length} lines → ${config.splits.length} files)`);
  console.log(`${'='.repeat(60)}`);

  // Extract file header comment (lines before first @layer)
  const firstLayerLine = layers.length > 0 ? layers[0].openLine : 1;
  const headerLines = [];
  for (let i = 0; i < firstLayerLine - 1; i++) {
    const line = lines[i];
    // Include comment lines and blanks that form the header
    if (line.trim().startsWith('/**') || line.trim().startsWith('*') || line.trim().startsWith('*/') || line.trim() === '') {
      headerLines.push(line);
    }
  }

  // Validate coverage: check that splits cover all content without gaps
  const sortedSplits = [...config.splits].sort((a, b) => a.fromLine - b.fromLine);
  for (let i = 0; i < sortedSplits.length - 1; i++) {
    const current = sortedSplits[i];
    const next = sortedSplits[i + 1];
    // Allow gap between different @layer blocks (e.g., components → views)
    if (current.layer !== next.layer) continue;
    if (current.toLine + 1 !== next.fromLine && current.toLine !== next.fromLine) {
      const gap = next.fromLine - current.toLine - 1;
      if (gap > 2) { // Allow small gaps (blank lines between sections)
        console.log(`  ⚠️  Gap between ${current.name} (→${current.toLine}) and ${next.name} (${next.fromLine}→): ${gap} lines`);
      }
    }
  }

  let allOk = true;

  for (let idx = 0; idx < config.splits.length; idx++) {
    const split = config.splits[idx];
    const layerName = split.layer || (layers.length > 0 ? layers[0].name : 'components');
    const outputName = `${baseName}.${split.name}.css`;
    const outputPath = path.join(sourceDir, outputName);

    // Extract content lines (1-indexed inclusive)
    const contentLines = lines.slice(split.fromLine - 1, split.toLine);

    // Trim trailing blank lines from content
    while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
      contentLines.pop();
    }

    // Build output
    const output = [];

    // Include file header only in the first split
    if (idx === 0 && headerLines.length > 0) {
      output.push(...headerLines);
      // Ensure blank line after header
      if (headerLines[headerLines.length - 1].trim() !== '') {
        output.push('');
      }
    }

    output.push(`@layer ${layerName} {`);
    output.push('');
    output.push(...contentLines);
    output.push('');
    output.push(`} /* end @layer ${layerName} */`);

    const totalLines = output.length;
    const status = totalLines > MAX_LINES ? '⚠️  OVER' : '✅';

    console.log(`  ${status} ${outputName}: ${totalLines} lines (content: ${contentLines.length}, layer: ${layerName})`);

    if (totalLines > MAX_LINES) {
      console.log(`     ❌ Exceeds ${MAX_LINES} line limit by ${totalLines - MAX_LINES} lines!`);
      allOk = false;
    }

    if (!dryRun) {
      fs.writeFileSync(outputPath, output.join('\n') + '\n', 'utf8');
      console.log(`     → Written: ${path.relative(ROOT, outputPath)}`);
    }
  }

  // Update TSX imports
  const tsxFiles = findAllTsxImporters(sourcePath);
  if (tsxFiles.length > 0) {
    const originalCssName = path.basename(config.source);
    const newImports = config.splits.map(s => `./${baseName}.${s.name}.css`);

    for (const tsxFile of tsxFiles) {
      console.log(`\n  📝 TSX: ${path.relative(ROOT, tsxFile)}`);
      console.log(`     - import '.../${originalCssName}'`);
      for (const imp of newImports) {
        console.log(`     + import '${imp}'`);
      }

      if (!dryRun) {
        updateTsxImports(tsxFile, originalCssName, newImports);
      }
    }
  } else {
    console.log(`\n  ⚠️  No TSX file found importing ${path.basename(config.source)}`);
  }

  // Delete original
  if (!dryRun && allOk) {
    fs.unlinkSync(sourcePath);
    console.log(`\n  🗑️  Deleted: ${config.source}`);
  }

  return allOk;
}

// ========================================
// Find TSX file that imports a CSS file
// ========================================

function findAllTsxImporters(cssPath) {
  const cssFileName = path.basename(cssPath);
  const cssDir = path.dirname(cssPath);
  const found = [];

  // Search in same directory and parent directories (up to 3 levels)
  const searchDirs = [cssDir, path.dirname(cssDir), path.dirname(path.dirname(cssDir))];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
        if (file.endsWith('.d.ts')) continue;
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(cssFileName)) {
          found.push(filePath);
        }
      }
    } catch { /* ignore */ }
  }

  return found;
}

// ========================================
// Update TSX imports
// ========================================

function updateTsxImports(tsxPath, originalCssName, newImports) {
  let content = fs.readFileSync(tsxPath, 'utf8');

  // Find the import line for the original CSS (handles various relative paths)
  const importRegex = new RegExp(`import\\s+['"][^'"]*${escapeRegex(originalCssName)}['"];?`);
  const match = content.match(importRegex);

  if (!match) {
    console.log(`     ⚠️  Could not find import for '${originalCssName}' in TSX`);
    return;
  }

  // Extract the relative path prefix from the original import
  const originalImportStr = match[0];
  const pathMatch = originalImportStr.match(/['"]([^'"]*)/);
  const originalPath = pathMatch ? pathMatch[1] : '';
  const dirPrefix = originalPath.substring(0, originalPath.lastIndexOf('/') + 1);

  const newImportLines = newImports.map(imp => {
    // Replace ./ prefix with the original path prefix
    const adjustedPath = imp.startsWith('./') ? dirPrefix + imp.substring(2) : dirPrefix + imp;
    return `import '${adjustedPath}';`;
  }).join('\n');

  content = content.replace(match[0], newImportLines);
  fs.writeFileSync(tsxPath, content, 'utf8');
  console.log(`     ✅ TSX imports updated`);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================================
// Main
// ========================================

const args = process.argv.slice(2);

if (args[0] === '--analyze' && args[1]) {
  analyzeFile(args[1]);
} else if (args[0] === '--dry-run' || args[0] === '--execute') {
  const dryRun = args[0] === '--dry-run';
  const tier = args[1] === 'all' || !args[1] ? 'all' : parseInt(args[1]);
  const configs = getConfigs(tier);

  if (configs.length === 0) {
    console.log('⚠️  No configs defined for the selected tier. Run --analyze first to determine split points.');
    process.exit(1);
  }

  console.log(`\n🔧 Phase 3: CSS File Split (${dryRun ? 'DRY RUN' : 'EXECUTE'})`);
  console.log(`   Tier: ${tier}, Files: ${configs.length}\n`);

  let allOk = true;
  for (const config of configs) {
    if (!splitFile(config, dryRun)) {
      allOk = false;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  if (allOk) {
    console.log('✅ All splits within 500-line limit');
  } else {
    console.log('❌ Some splits exceed 500-line limit - adjust config!');
  }

  if (dryRun) {
    console.log('\n💡 Run with --execute to perform actual split');
  }
} else {
  console.log(`
Usage:
  node scripts/split-css-file.mjs --analyze <file>     # 파일 분석
  node scripts/split-css-file.mjs --dry-run [tier]      # 분할 미리보기
  node scripts/split-css-file.mjs --execute [tier]      # 실제 분할 수행

  [tier] = 1, 2, 3, or 'all' (default: 'all')
`);
}
