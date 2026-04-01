/**
 * 검색 결과 메타데이터 필드 — Regression 테스트
 *
 * @description 검색 aggregation에서 overallStatus, _hasMetaText, _hasOcrText, meta, ocr 등
 *   메타데이터 필드가 누락되면 badge(BIN), 상태(대기), 날짜(미표시), 텍스트 버튼(비활성) 문제가 발생한다.
 *   검색 결과 document 매핑에 필수 메타데이터가 포함되는지 검증.
 *
 * @regression 검색 aggregation $push에 9개 필드만 반환 → 메타데이터 누락 버그
 */

import { describe, it, expect } from 'vitest'
import { DocumentUtils } from '../../../../entities/document/model'

// === 검색 결과 document 매핑 로직 재현 ===
// ⚠️ 동기화 필요: DocumentExplorerView.tsx의 customerSummaryTree useMemo 내
// searchDocuments → document 매핑 로직과 동일 구조를 재현합니다.
// badgeType은 백엔드가 전달하지 않음 — 프론트엔드 DocumentUtils.getDocumentType()으로 판정 (SSoT)

interface SearchDocument {
  _id: string
  displayName: string | null
  originalName: string
  uploadedAt: string | null
  fileSize: number | null
  mimeType: string | null
  customerId: string
  customerName: string
  document_type: string | null
  overallStatus: string | null
  status: string | null
  progress: number
  _hasMetaText: boolean
  _hasOcrText: boolean
  upload: Record<string, unknown> | null
  meta: { mime?: string | null; size_bytes?: number | null; summary?: string | null } | null
  ocr: { status?: string | null; summary?: string | null } | null
  docembed?: { text_source?: string } | null
}

/**
 * 검색 결과 document 매핑 (DocumentExplorerView의 매핑 로직 재현)
 */
function mapSearchDocToDocument(doc: SearchDocument) {
  return {
    _id: doc._id,
    originalName: doc.originalName,
    displayName: doc.displayName,
    uploadedAt: doc.uploadedAt,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    document_type: doc.document_type,
    overallStatus: doc.overallStatus,
    status: doc.status,
    progress: doc.progress,
    _hasMetaText: doc._hasMetaText,
    _hasOcrText: doc._hasOcrText,
    upload: doc.upload,
    meta: doc.meta,
    ocr: doc.ocr,
    docembed: doc.docembed,
    customer_relation: {
      customer_id: doc.customerId || '',
      customer_name: doc.customerName || '',
    },
  }
}

// === 테스트 데이터 팩토리 ===

function createCompletedSearchDoc(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    _id: 'doc-1',
    displayName: '테스트문서.pdf',
    originalName: 'test_document.pdf',
    uploadedAt: '2026-04-01T12:00:00.000Z',
    fileSize: 102400,
    mimeType: 'application/pdf',
    customerId: 'c1',
    customerName: '홍길동',
    document_type: 'insurance',
    overallStatus: 'completed',
    status: 'completed',
    progress: 100,
    _hasMetaText: true,
    _hasOcrText: false,
    upload: { originalName: 'test_document.pdf', uploaded_at: '2026-04-01T12:00:00.000Z' },
    meta: { mime: 'application/pdf', size_bytes: 102400, summary: '테스트 요약입니다.' },
    ocr: { status: 'completed', summary: null },
    docembed: { text_source: 'meta' },
    ...overrides,
  }
}

// === 테스트 ===

describe('검색 결과 메타데이터 필드 — regression', () => {

  it('완료된 문서의 overallStatus가 "completed"로 매핑되어야 함', () => {
    const searchDoc = createCompletedSearchDoc()
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped.overallStatus).toBe('completed')
    // 이전 버그: overallStatus가 없어서 프론트엔드가 "대기" 상태로 표시
  })

  it('DocumentUtils.getDocumentType()이 TXT 문서를 올바르게 판정해야 함', () => {
    const searchDoc = createCompletedSearchDoc({ _hasMetaText: true, _hasOcrText: false, docembed: { text_source: 'meta' } })
    const mapped = mapSearchDocToDocument(searchDoc)

    // 프론트엔드 SSoT: DocumentUtils.getDocumentType()으로 badge 판정
    const badgeLabel = DocumentUtils.getDocumentTypeLabel(mapped)
    expect(badgeLabel).toBe('TXT')
    // 이전: 백엔드가 badgeType을 계산하여 전달 → 현재: 프론트엔드에서 판정
  })

  it('_hasMetaText가 true로 매핑되어야 함 (전체 텍스트 버튼 활성화)', () => {
    const searchDoc = createCompletedSearchDoc({ _hasMetaText: true, _hasOcrText: false })
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped._hasMetaText).toBe(true)
    expect(mapped._hasOcrText).toBe(false)
    // 이전 버그: _hasMetaText 미전달 → 전체 텍스트 버튼 항상 비활성화
  })

  it('_hasOcrText가 true인 OCR 문서도 텍스트 버튼 활성화 + OCR 판정', () => {
    const searchDoc = createCompletedSearchDoc({
      _hasMetaText: false,
      _hasOcrText: true,
      ocr: { status: 'done', summary: null },
      docembed: { text_source: 'ocr' },
    })
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped._hasOcrText).toBe(true)
    const badgeLabel = DocumentUtils.getDocumentTypeLabel(mapped)
    expect(badgeLabel).toBe('OCR')
  })

  it('upload 객체가 전달되어야 날짜가 표시됨', () => {
    const searchDoc = createCompletedSearchDoc()
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped.upload).not.toBeNull()
    expect((mapped.upload as Record<string, unknown>)?.uploaded_at).toBe('2026-04-01T12:00:00.000Z')
    // 이전 버그: upload 객체 미전달 → getDocumentDate()에서 날짜 추출 실패
  })

  it('meta.summary가 전달되어야 요약 버튼 활성화', () => {
    const searchDoc = createCompletedSearchDoc({
      meta: { mime: 'application/pdf', size_bytes: 102400, summary: '보험 계약서 요약' },
    })
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped.meta).not.toBeNull()
    expect(mapped.meta?.summary).toBe('보험 계약서 요약')
    // 이전 버그: meta 객체 미전달 → 요약 버튼 비활성화
  })

  it('처리 중인 문서의 progress가 전달되어야 함', () => {
    const searchDoc = createCompletedSearchDoc({
      overallStatus: 'processing',
      progress: 60,
    })
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped.overallStatus).toBe('processing')
    expect(mapped.progress).toBe(60)
  })

  it('에러 상태 문서도 올바르게 매핑', () => {
    const searchDoc = createCompletedSearchDoc({
      overallStatus: 'error',
      progress: 0,
      _hasMetaText: false,
      _hasOcrText: false,
      docembed: null,
    })
    const mapped = mapSearchDocToDocument(searchDoc)

    expect(mapped.overallStatus).toBe('error')
    const badgeLabel = DocumentUtils.getDocumentTypeLabel(mapped)
    expect(badgeLabel).toBe('BIN')
  })

  it('모든 필수 필드가 누락 없이 매핑되어야 함', () => {
    const searchDoc = createCompletedSearchDoc()
    const mapped = mapSearchDocToDocument(searchDoc)

    // 이전 9개 필드만 있던 것에서 추가된 필수 필드 검증
    const requiredMetadataFields = [
      'overallStatus',
      'status',
      'progress',
      '_hasMetaText',
      '_hasOcrText',
      'upload',
      'meta',
      'ocr',
    ] as const

    for (const field of requiredMetadataFields) {
      expect(mapped).toHaveProperty(field)
      // undefined가 아닌 실제 값이 있어야 함
      expect(mapped[field]).not.toBeUndefined()
    }
  })
})
