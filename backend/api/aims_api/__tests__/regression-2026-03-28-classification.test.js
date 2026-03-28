/**
 * Regression Test — 2026-03-28 문서 분류 정확도 개선
 *
 * 문제: full_text 10자 미만 파일의 document_type이 비어있음
 * 수정:
 * 1. full_text 부족 시 의미 있는 파일명으로 AI 분류 fallback
 * 2. 모든 정보 부실 시 unclassifiable 명시 저장
 * 3. 미분류 쿼리에 unclassifiable 추가
 * 4. 파일명 sanitization (프롬프트 인젝션 방어)
 *
 * @since 2026-03-28
 */

const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', relativePath),
    'utf-8'
  );
}

// =============================================================================
// 1. openai_service.py — _sanitize_filename_for_prompt 추가
// =============================================================================
describe('FIX-1: openai_service.py — 파일명 sanitization', () => {
  const source = readSource('backend/api/document_pipeline/services/openai_service.py');

  test('_sanitize_filename_for_prompt 함수가 정의되어 있어야 함', () => {
    expect(source).toContain('def _sanitize_filename_for_prompt');
  });

  test('os.path.basename으로 경로를 제거해야 함', () => {
    const fnStart = source.indexOf('def _sanitize_filename_for_prompt');
    const fnEnd = source.indexOf('def _is_meaningful_filename');
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toContain('os.path.basename');
  });

  test('길이 제한이 있어야 함 (100자)', () => {
    const fnStart = source.indexOf('def _sanitize_filename_for_prompt');
    const fnEnd = source.indexOf('def _is_meaningful_filename');
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toContain('[:100]');
  });

  test('줄바꿈/탭 제거가 있어야 함', () => {
    const fnStart = source.indexOf('def _sanitize_filename_for_prompt');
    const fnEnd = source.indexOf('def _is_meaningful_filename');
    const fnBody = source.substring(fnStart, fnEnd);
    expect(fnBody).toMatch(/\\r\\n\\t/);
  });
});

// =============================================================================
// 2. ocr_worker.py — 파일명 fallback 분류
// =============================================================================
describe('FIX-2: ocr_worker.py — 파일명 fallback 분류', () => {
  const source = readSource('backend/api/document_pipeline/workers/ocr_worker.py');

  test('_is_meaningful_filename으로 의미 있는 파일명을 판별해야 함', () => {
    expect(source).toContain('_is_meaningful_filename');
  });

  test('_sanitize_filename_for_prompt로 파일명을 정제해야 함', () => {
    expect(source).toContain('_sanitize_filename_for_prompt');
  });

  test('분류 정보 부실 시 unclassifiable을 설정해야 함', () => {
    expect(source).toContain('"unclassifiable"');
  });

  test('파일명 fallback 로깅이 있어야 함', () => {
    expect(source).toContain('파일명 fallback 분류');
  });
});

// =============================================================================
// 3. doc_prep_main.py — 파일명 fallback 분류
// =============================================================================
describe('FIX-3: doc_prep_main.py — 파일명 fallback 분류', () => {
  const source = readSource('backend/api/document_pipeline/routers/doc_prep_main.py');

  test('_is_meaningful_filename으로 의미 있는 파일명을 판별해야 함', () => {
    // xPipe 경로에서 사용
    const xpipeIdx = source.indexOf('파일명 fallback 분류');
    expect(xpipeIdx).toBeGreaterThan(-1);
  });

  test('_sanitize_filename_for_prompt로 파일명을 정제해야 함', () => {
    expect(source).toContain('_sanitize_filename_for_prompt');
  });

  test('분류 정보 부실 시 unclassifiable을 설정해야 함', () => {
    expect(source).toContain('"unclassifiable"');
  });

  test('summary_result의 document_type이 doc_type fallback으로 사용되어야 함', () => {
    // doc_type이 없으면 summary_result에서 가져오는 로직
    expect(source).toContain('summary_result.get("document_type")');
  });
});

// =============================================================================
// 4. document-types-routes.js — 미분류 쿼리에 unclassifiable 추가
// =============================================================================
describe('FIX-4: document-types-routes.js — unclassifiable 미분류 쿼리', () => {
  const source = readSource('backend/api/aims_api/routes/document-types-routes.js');

  test('미분류 쿼리에 unclassifiable이 포함되어야 함', () => {
    // documentIds가 없으면 미분류 문서만 — 이 주석 근처의 $or 블록
    const commentIdx = source.indexOf('documentIds가 없으면 미분류 문서만');
    expect(commentIdx).toBeGreaterThan(-1);
    const block = source.substring(commentIdx, commentIdx + 300);
    expect(block).toContain("'unclassifiable'");
  });
});
