/**
 * Regression Test — 2026-03-28 SSoT 정렬 관련 버그 수정
 *
 * 수정 내용:
 * B1. badgeType 집계 파이프라인에서 MIME 경로를 $metadata.mimetype → $meta.mime로 수정
 * B2. badgeType 후처리에서 MIME 경로를 doc.metadata?.mimetype → doc.meta?.mime로 수정
 *
 * 검증 항목 (4건):
 * S1. docType 정렬 — null 문서가 맨 뒤에 위치
 * S2. docType 정렬 — AR/CRS 정규화 참여
 * S3. SSoT 단일 소스 — meta.document_type 무시, top-level만 참조
 * S4. badgeType BIN MIME 분류 — meta.mime 경로 사용
 *
 * @since 2026-03-28
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// 헬퍼: 소스 코드 읽기
// =============================================================================
function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf-8'
  );
}

const documentsSource = readSource('routes/documents-routes.js');

// =============================================================================
// S1: docType 정렬 — null 문서 맨 뒤
// =============================================================================
describe('S1: docType 정렬 — null/unspecified 문서가 맨 뒤에 위치', () => {
  // docType 정렬 블록 추출 (docType_asc ~ 다음 else if)
  const docTypeBlockStart = documentsSource.indexOf("sort === 'docType_asc'");
  const docTypeBlockEnd = documentsSource.indexOf("} else if (sort === 'uploadDate_asc'");
  const docTypeBlock = documentsSource.substring(docTypeBlockStart, docTypeBlockEnd);

  test('_isUnspecified 필드에서 null을 감지해야 함', () => {
    expect(docTypeBlock).toContain("{ $eq: [{ $ifNull: ['$_normalized_docType', null] }, null] }");
  });

  test('_isUnspecified 필드에서 빈 문자열을 감지해야 함', () => {
    expect(docTypeBlock).toContain("{ $eq: ['$_normalized_docType', ''] }");
  });

  test('_isUnspecified 필드에서 unspecified를 감지해야 함', () => {
    expect(docTypeBlock).toContain("{ $eq: ['$_normalized_docType', 'unspecified'] }");
  });

  test('docType_sortWeight가 _isUnspecified일 때 1이어야 함 (맨 뒤 정렬)', () => {
    expect(docTypeBlock).toContain("docType_sortWeight: { $cond: { if: '$_isUnspecified', then: 1, else: 0 } }");
  });

  test('정렬 시 docType_sortWeight가 최우선이어야 함 (항상 오름차순)', () => {
    expect(docTypeBlock).toMatch(/\$sort:\s*\{\s*docType_sortWeight:\s*1/);
  });
});

// =============================================================================
// S2: docType 정렬 — AR/CRS 정규화 참여
// =============================================================================
describe('S2: docType 정렬 — AR/CRS 문서가 정규화된 라벨로 정렬에 참여', () => {
  const docTypeBlockStart = documentsSource.indexOf("sort === 'docType_asc'");
  const docTypeBlockEnd = documentsSource.indexOf("} else if (sort === 'uploadDate_asc'");
  const docTypeBlock = documentsSource.substring(docTypeBlockStart, docTypeBlockEnd);

  test('is_annual_report=true → annual_report로 정규화', () => {
    expect(docTypeBlock).toContain("{ case: { $eq: ['$is_annual_report', true] }, then: 'annual_report' }");
  });

  test('is_customer_review=true → customer_review로 정규화', () => {
    expect(docTypeBlock).toContain("{ case: { $eq: ['$is_customer_review', true] }, then: 'customer_review' }");
  });

  test('정규화 결과가 _normalized_docType 필드에 저장됨', () => {
    expect(docTypeBlock).toContain('_normalized_docType');
  });

  test('document_types 컬렉션과 lookup하여 한글 라벨을 가져옴', () => {
    expect(docTypeBlock).toContain("from: 'document_types'");
    expect(docTypeBlock).toContain("localField: '_normalized_docType'");
  });
});

// =============================================================================
// S3: SSoT 단일 소스 — meta.document_type 무시
// =============================================================================
describe('S3: SSoT 단일 소스 — top-level document_type만 참조', () => {
  const docTypeBlockStart = documentsSource.indexOf("sort === 'docType_asc'");
  const docTypeBlockEnd = documentsSource.indexOf("} else if (sort === 'uploadDate_asc'");
  const docTypeBlock = documentsSource.substring(docTypeBlockStart, docTypeBlockEnd);

  test('$switch default가 top-level $document_type만 참조해야 함', () => {
    // SSoT: top-level만 참조 — meta.document_type이 아닌 $document_type
    expect(docTypeBlock).toContain("default: '$document_type'");
  });

  test('meta.document_type을 정렬에 참조하지 않아야 함', () => {
    // meta.document_type이 정렬 블록에 등장하면 안 됨
    expect(docTypeBlock).not.toContain('$meta.document_type');
    expect(docTypeBlock).not.toContain('meta.document_type');
  });

  test('SSoT 주석이 코드에 명시되어 있어야 함', () => {
    expect(docTypeBlock).toContain('SSoT');
  });
});

// =============================================================================
// S4: badgeType BIN MIME 분류 — meta.mime 경로 사용
// =============================================================================
describe('S4: badgeType BIN MIME 분류 — meta.mime 경로 사용', () => {
  // badgeType 집계 파이프라인 블록 (B1)
  const badgeTypeAggStart = documentsSource.indexOf("sort === 'badgeType_asc'");
  const badgeTypeAggEnd = documentsSource.indexOf("} else if (sort === 'docType_asc'");
  const badgeTypeAggBlock = documentsSource.substring(badgeTypeAggStart, badgeTypeAggEnd);

  test('집계 파이프라인에서 $meta.mime 경로를 사용해야 함 (B1 수정)', () => {
    expect(badgeTypeAggBlock).toContain('$meta.mime');
  });

  test('집계 파이프라인에서 $metadata.mimetype을 사용하면 안 됨 (B1 수정)', () => {
    expect(badgeTypeAggBlock).not.toContain('$metadata.mimetype');
  });

  test('집계 파이프라인에서 application/zip이 BIN MIME 목록에 포함되어야 함', () => {
    expect(badgeTypeAggBlock).toContain('"application/zip"');
  });

  // badgeType 후처리 블록 (B2)
  // isBinaryMimeType 호출 근처 코드 확인
  test('후처리에서 doc.meta?.mime 경로를 사용해야 함 (B2 수정)', () => {
    expect(documentsSource).toContain('isBinaryMimeType(doc.meta?.mime)');
  });

  test('후처리에서 doc.metadata?.mimetype을 사용하면 안 됨 (B2 수정)', () => {
    expect(documentsSource).not.toContain('isBinaryMimeType(doc.metadata?.mimetype)');
  });

  // BIN이 아닌 MIME은 BIN으로 분류되지 않는지 (양방향 검증)
  // isBinaryMimeType 함수가 helpers에 정의되어 있으므로 해당 함수를 검증
  const helpersSource = readSource('lib/helpers.js');

  test('isBinaryMimeType에서 application/pdf는 BIN으로 분류하지 않아야 함', () => {
    const fnStart = helpersSource.indexOf('function isBinaryMimeType');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = helpersSource.indexOf('\n}', fnStart) + 2;
    const fnBody = helpersSource.substring(fnStart, fnEnd);

    // application/pdf가 바이너리 목록에 없어야 함
    expect(fnBody).not.toContain("'application/pdf'");
    expect(fnBody).not.toContain('"application/pdf"');
  });

  test('isBinaryMimeType에서 image/ MIME은 BIN으로 분류하지 않아야 함', () => {
    const fnStart = helpersSource.indexOf('function isBinaryMimeType');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = helpersSource.indexOf('\n}', fnStart) + 2;
    const fnBody = helpersSource.substring(fnStart, fnEnd);

    // image/jpeg, image/png 등은 바이너리 목록에 없어야 함
    expect(fnBody).not.toContain("'image/jpeg'");
    expect(fnBody).not.toContain("'image/png'");
  });

  test('isBinaryMimeType에서 application/zip은 BIN으로 분류해야 함', () => {
    const fnStart = helpersSource.indexOf('function isBinaryMimeType');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = helpersSource.indexOf('\n}', fnStart) + 2;
    const fnBody = helpersSource.substring(fnStart, fnEnd);

    expect(fnBody).toMatch(/application\/zip/);
  });
});
