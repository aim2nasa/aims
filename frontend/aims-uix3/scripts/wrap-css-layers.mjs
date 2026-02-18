/**
 * CSS @layer 래핑 자동화 스크립트
 *
 * 모든 CSS 파일을 적절한 @layer 블록으로 래핑합니다.
 * - @import 문은 @layer 블록 밖에 유지
 * - 이미 @layer가 있는 파일은 스킵
 * - index.css는 별도 처리 (layer order 선언 + reset 래핑)
 *
 * 사용법: node scripts/wrap-css-layers.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Layer 할당 규칙 ───

function getLayerForFile(relPath) {
  const p = relPath.replace(/\\/g, '/');

  // 특수 파일 (별도 처리)
  if (p === 'index.css') return '__INDEX__'; // 별도 처리

  // tokens
  if (p === 'shared/design/tokens.css') return 'tokens';

  // theme
  if (p === 'shared/design/theme.css') return 'theme';
  if (p === 'shared/design/modal-variables.css') return 'theme';

  // base
  if (p === 'shared/design/system.css') return 'base';
  if (p === 'shared/styles/typography.css') return 'base';

  // utilities
  if (p === 'shared/styles/utilities.css') return 'utilities';
  if (p === 'shared/styles/layout.css') return 'utilities';
  if (p === 'shared/styles/components.css') return 'utilities';
  if (p === 'shared/styles/document-badges.css') return 'utilities';
  if (p === 'shared/styles/column-resize.css') return 'utilities';
  if (p === 'styles/viewer-common.css') return 'utilities';

  // responsive
  if (p === 'shared/styles/responsive.css') return 'responsive';
  if (p === 'shared/styles/phone-landscape.css') return 'responsive';

  // views (부모 뷰 - 자식 컴포넌트 오버라이드)
  if (p.includes('CustomerFullDetailView/CustomerFullDetailView.css')) return 'views';

  // 나머지 전부 components
  return 'components';
}

// ─── CSS 파일 수집 ───

function collectCssFiles(dir, base) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectCssFiles(full, base));
    } else if (entry.endsWith('.css')) {
      files.push(relative(base, full));
    }
  }
  return files;
}

// ─── @layer 래핑 로직 ───

function wrapFileInLayer(filePath, layer) {
  const fullPath = join(SRC_DIR, filePath);
  const content = readFileSync(fullPath, 'utf-8');

  // 이미 @layer가 있으면 스킵
  if (content.includes('@layer ')) {
    return { status: 'skipped', reason: 'already has @layer' };
  }

  // 빈 파일 스킵
  const trimmed = content.trim();
  if (!trimmed) {
    return { status: 'skipped', reason: 'empty file' };
  }

  // @import 분리: @import 문은 @layer 밖에 유지해야 함
  const lines = content.split('\n');
  const importLines = [];
  const commentBeforeImport = [];
  const restLines = [];
  let pastImports = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();

    // 블록 코멘트 추적
    if (!inBlockComment && trimLine.startsWith('/*')) {
      inBlockComment = true;
    }
    if (inBlockComment) {
      if (trimLine.includes('*/')) {
        inBlockComment = false;
      }
      if (!pastImports) {
        commentBeforeImport.push(line);
      } else {
        restLines.push(line);
      }
      continue;
    }

    // 빈 줄 처리
    if (!trimLine) {
      if (!pastImports) {
        commentBeforeImport.push(line);
      } else {
        restLines.push(line);
      }
      continue;
    }

    // @import 라인
    if (trimLine.startsWith('@import ')) {
      importLines.push(line);
      continue;
    }

    // @import가 아닌 첫 번째 실제 코드 라인
    if (!pastImports) {
      pastImports = true;
    }
    restLines.push(line);
  }

  // 실제 내용이 없으면 스킵
  const restContent = restLines.join('\n').trim();
  if (!restContent) {
    return { status: 'skipped', reason: 'no style content' };
  }

  // 새 파일 내용 조합
  const parts = [];

  // 1. @import 전 주석 (파일 설명 등)
  if (importLines.length > 0) {
    // @import가 있는 경우: 주석 + @import + 빈 줄 + @layer
    parts.push(commentBeforeImport.join('\n'));
    parts.push(importLines.join('\n'));
    parts.push('');
    parts.push(`@layer ${layer} {`);
    parts.push('');
    // restLines의 각 줄에 2칸 들여쓰기 추가
    parts.push(indentContent(restContent));
    parts.push('');
    parts.push(`} /* end @layer ${layer} */`);
    parts.push('');
  } else {
    // @import가 없는 경우: 주석 포함 전체를 @layer로 래핑
    // 단, 파일 상단 주석은 @layer 밖에 유지
    const { headerComment, bodyContent } = extractHeaderComment(content);

    if (headerComment) {
      parts.push(headerComment);
      parts.push('');
    }
    parts.push(`@layer ${layer} {`);
    parts.push('');
    parts.push(indentContent(bodyContent));
    parts.push('');
    parts.push(`} /* end @layer ${layer} */`);
    parts.push('');
  }

  const newContent = parts.join('\n');

  if (DRY_RUN) {
    return { status: 'dry-run', layer };
  }

  writeFileSync(fullPath, newContent, 'utf-8');
  return { status: 'wrapped', layer };
}

// ─── 헤더 주석 추출 ───

function extractHeaderComment(content) {
  const lines = content.split('\n');
  const headerLines = [];
  const bodyLines = [];
  let headerDone = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();

    if (!headerDone) {
      // 파일 시작의 주석 블록 또는 빈 줄은 헤더로 간주
      if (trimLine === '' || trimLine.startsWith('/*') || trimLine.startsWith('*') || trimLine.startsWith('//')) {
        headerLines.push(line);
        if (trimLine.startsWith('/*')) inBlockComment = true;
        if (trimLine.includes('*/')) {
          inBlockComment = false;
          // 블록 코멘트 종료 후 바로 다음 빈줄까지 헤더
        }
        continue;
      }
      if (inBlockComment) {
        headerLines.push(line);
        if (trimLine.includes('*/')) inBlockComment = false;
        continue;
      }
      // 실제 CSS 코드 시작
      headerDone = true;
      bodyLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  // 헤더가 파일 전체인 경우 (주석만 있는 파일)
  if (!headerDone) {
    return { headerComment: '', bodyContent: headerLines.join('\n').trim() };
  }

  return {
    headerComment: headerLines.join('\n').trimEnd(),
    bodyContent: bodyLines.join('\n').trim()
  };
}

// ─── 들여쓰기 (2칸) ───

function indentContent(content) {
  return content
    .split('\n')
    .map(line => line.trim() === '' ? '' : '  ' + line)
    .join('\n');
}

// ─── index.css 특별 처리 ───

function handleIndexCss() {
  const fullPath = join(SRC_DIR, 'index.css');
  const content = readFileSync(fullPath, 'utf-8');

  // 이미 @layer가 있으면 스킵
  if (content.includes('@layer ')) {
    return { status: 'skipped', reason: 'already has @layer' };
  }

  // 파일 구조 분석:
  // 1. 상단 주석
  // 2. @import 문들
  // 3. CSS reset + base styles
  const lines = content.split('\n');
  const headerCommentLines = [];
  const importLines = [];
  const importCommentLines = []; // @import 사이 주석
  const restLines = [];
  let phase = 'header'; // header -> imports -> rest

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();

    if (phase === 'header') {
      if (trimLine.startsWith('/*') || trimLine.startsWith('*') || trimLine.startsWith('*/') || trimLine === '') {
        headerCommentLines.push(line);
        continue;
      }
      if (trimLine.startsWith('@import')) {
        phase = 'imports';
        importLines.push(line);
        continue;
      }
      phase = 'rest';
      restLines.push(line);
      continue;
    }

    if (phase === 'imports') {
      if (trimLine.startsWith('@import')) {
        importLines.push(line);
        continue;
      }
      if (trimLine === '' || trimLine.startsWith('/*') || trimLine.startsWith('//')) {
        // @import 사이 주석/빈줄
        importCommentLines.push(line);
        continue;
      }
      // @import 끝
      phase = 'rest';
      restLines.push(line);
      continue;
    }

    restLines.push(line);
  }

  const restContent = restLines.join('\n').trim();

  // 새 파일 조합
  const parts = [];

  // 1. 파일 헤더 주석
  parts.push(headerCommentLines.join('\n').trimEnd());
  parts.push('');

  // 2. @layer order 선언 (핵심!)
  parts.push('/* === CASCADE LAYERS ORDER === */');
  parts.push('/* 낮은 순서 → 높은 우선순위: responsive가 모든 layer를 이긴다 */');
  parts.push('@layer reset, tokens, theme, base, utilities, components, views, responsive;');
  parts.push('');

  // 3. @import 문들 (그 사이 주석 포함)
  parts.push('/* === DESIGN SYSTEM IMPORTS === */');
  for (const imp of importLines) {
    parts.push(imp);
    // 해당 import 다음에 있던 주석 추가
  }
  parts.push('');

  // 4. Reset/base 스타일을 @layer reset으로 래핑
  parts.push('@layer reset {');
  parts.push('');
  parts.push(indentContent(restContent));
  parts.push('');
  parts.push('} /* end @layer reset */');
  parts.push('');

  if (DRY_RUN) {
    return { status: 'dry-run', layer: 'reset (with layer order)' };
  }

  writeFileSync(fullPath, parts.join('\n'), 'utf-8');
  return { status: 'wrapped', layer: 'reset (with layer order)' };
}

// ─── 메인 실행 ───

console.log(`\n🎨 CSS @layer 래핑 스크립트`);
console.log(`  SRC: ${SRC_DIR}`);
console.log(`  모드: ${DRY_RUN ? '🔍 DRY RUN (변경 없음)' : '✏️  WRITE'}\n`);

const cssFiles = collectCssFiles(SRC_DIR, SRC_DIR);
console.log(`📂 CSS 파일 ${cssFiles.length}개 발견\n`);

const stats = { wrapped: 0, skipped: 0, errors: 0 };
const results = [];

// index.css 특별 처리
const indexResult = handleIndexCss();
results.push({ file: 'index.css', ...indexResult });
if (indexResult.status === 'wrapped' || indexResult.status === 'dry-run') stats.wrapped++;
else stats.skipped++;

// 나머지 파일 처리
for (const file of cssFiles) {
  if (file.replace(/\\/g, '/') === 'index.css') continue; // 이미 처리

  const layer = getLayerForFile(file);

  try {
    const result = wrapFileInLayer(file, layer);
    results.push({ file, ...result });
    if (result.status === 'wrapped' || result.status === 'dry-run') stats.wrapped++;
    else stats.skipped++;
  } catch (err) {
    results.push({ file, status: 'error', reason: err.message });
    stats.errors++;
  }
}

// ─── 결과 출력 ───

console.log('─── 결과 ───\n');

// Layer별 그룹핑
const byLayer = {};
for (const r of results) {
  const layer = r.layer || r.reason || 'unknown';
  if (!byLayer[layer]) byLayer[layer] = [];
  byLayer[layer].push(r);
}

for (const [layer, files] of Object.entries(byLayer)) {
  console.log(`[${layer}] ${files.length}개`);
  for (const f of files) {
    const icon = f.status === 'wrapped' || f.status === 'dry-run' ? '✅' : '⏭️';
    console.log(`  ${icon} ${f.file}`);
  }
  console.log('');
}

console.log(`\n📊 요약: 래핑 ${stats.wrapped}개 | 스킵 ${stats.skipped}개 | 에러 ${stats.errors}개\n`);
