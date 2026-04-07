/**
 * Regression Test — 고객별 문서함 삭제 후 선택 카운트 미초기화 버그
 *
 * 커밋: e56bdd7e — handleBatchDelete 완료 후 setSelectedDocumentIds(new Set()) 추가
 * 버그: 일괄 삭제 완료 후 selectedDocumentIds가 초기화되지 않아
 *       삭제된 문서 수가 UI에 남아있던 문제
 *
 * @since 2026-04-07
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readComponentSource(): string {
  return fs.readFileSync(
    path.join(__dirname, '..', 'DocumentExplorerView.tsx'),
    'utf-8'
  );
}

describe('DocumentExplorerView 삭제 후 선택 초기화 (e56bdd7e)', () => {
  const source = readComponentSource();

  // ─────────────────────────────────────────────────────────────
  // 1. handleBatchDelete 함수가 존재해야 함
  // ─────────────────────────────────────────────────────────────
  it('handleBatchDelete 함수가 정의되어야 함', () => {
    expect(source).toContain('handleBatchDelete');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. handleBatchDelete 내에서 deleteDocuments 호출 후 선택 초기화
  // ─────────────────────────────────────────────────────────────
  it('handleBatchDelete에서 삭제 후 setSelectedDocumentIds(new Set())로 초기화해야 함', () => {
    // handleBatchDelete 블록 추출
    const batchDeleteStart = source.indexOf('handleBatchDelete');
    expect(batchDeleteStart).toBeGreaterThan(-1);

    // handleBatchDelete 함수 범위 내에서 확인 (다음 useCallback 또는 const까지)
    const batchDeleteSection = source.substring(batchDeleteStart, batchDeleteStart + 500);

    // deleteDocuments 호출이 있어야 함
    expect(batchDeleteSection).toContain('deleteDocuments');

    // 삭제 후 selectedDocumentIds 초기화가 있어야 함
    expect(batchDeleteSection).toMatch(/setSelectedDocumentIds\(\s*new\s+Set\(\)\s*\)/);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 초기화가 deleteDocuments 호출 이후에 위치해야 함
  // ─────────────────────────────────────────────────────────────
  it('setSelectedDocumentIds 초기화가 deleteDocuments 호출 이후에 위치해야 함', () => {
    const batchDeleteStart = source.indexOf('handleBatchDelete');
    const batchDeleteSection = source.substring(batchDeleteStart, batchDeleteStart + 500);

    const deleteIdx = batchDeleteSection.indexOf('deleteDocuments');
    const resetIdx = batchDeleteSection.indexOf('setSelectedDocumentIds(new Set())');

    expect(deleteIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(-1);
    // 초기화가 삭제 호출 이후여야 함
    expect(resetIdx).toBeGreaterThan(deleteIdx);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. selectedDocumentIds 상태가 Set<string>으로 정의되어야 함
  // ─────────────────────────────────────────────────────────────
  it('selectedDocumentIds 상태가 Set<string>으로 관리되어야 함', () => {
    expect(source).toMatch(/useState<Set<string>>\(\s*new\s+Set\(\)\s*\)/);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. onDocumentDeleted 콜백 호출이 삭제 후 있어야 함
  // ─────────────────────────────────────────────────────────────
  it('handleBatchDelete에서 onDocumentDeleted 콜백을 호출해야 함', () => {
    const batchDeleteStart = source.indexOf('handleBatchDelete');
    const batchDeleteSection = source.substring(batchDeleteStart, batchDeleteStart + 500);
    expect(batchDeleteSection).toContain('onDocumentDeleted');
  });
});
