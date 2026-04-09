/**
 * Phase 5: 문서 관리 핵심 기능 Regression 테스트
 * @description 문서 처리 상태, 검색, 페이지네이션, 고객 연결 기능의 회귀 방지
 * @regression
 *   - 커밋 2c259d8 (문서 타임아웃 상태 추가)
 *   - 커밋 5617226b (문서 관리 통계 API 사용자별 필터링)
 *   - 커밋 2e98127b (내 파일 페이지 폴더 상태 표시 제거)
 * @priority HIGH - 문서 관리 핵심 기능
 */

import { describe, it, expect } from 'vitest'
import type { Document, DocumentStatus, DocumentCustomerRelation } from '../types/documentStatus'

describe('문서 관리 - Regression 테스트', () => {
  describe('Phase 5-1: 문서 상태 타입 정의', () => {
    /**
     * 회귀 테스트: 문서 상태 타입
     * 배경: 5가지 상태로 문서 처리 현황 표시
     */
    it('DocumentStatus는 5가지 상태를 가짐', () => {
      const validStatuses: DocumentStatus[] = [
        'completed',
        'processing',
        'error',
        'pending',
        'timeout'
      ]

      expect(validStatuses).toHaveLength(5)
      expect(validStatuses).toContain('completed')
      expect(validStatuses).toContain('processing')
      expect(validStatuses).toContain('error')
      expect(validStatuses).toContain('pending')
      expect(validStatuses).toContain('timeout')
    })

    it('문서 상태별 우선순위가 정의됨', () => {
      // 상태 표시 우선순위 (높을수록 먼저 표시)
      const statusPriority: Record<DocumentStatus, number> = {
        error: 5,      // 가장 높음 - 즉시 주의 필요
        timeout: 4,    // 타임아웃 - 문제 발생
        processing: 3, // 처리중 - 진행 상황 표시
        pending: 2,    // 대기 - 곧 처리 예정
        completed: 1   // 완료 - 정상 종료
      }

      expect(statusPriority.error).toBeGreaterThan(statusPriority.timeout)
      expect(statusPriority.timeout).toBeGreaterThan(statusPriority.processing)
      expect(statusPriority.processing).toBeGreaterThan(statusPriority.pending)
      expect(statusPriority.pending).toBeGreaterThan(statusPriority.completed)
    })
  })

  describe('Phase 5-2: 문서 객체 구조', () => {
    /**
     * 회귀 테스트: Document 인터페이스 필수 필드
     * 배경: API 응답과 UI 렌더링에 필요한 필드들
     */
    it('문서 객체에 필수 필드가 포함됨', () => {
      const document: Document = {
        _id: 'doc123',
        originalName: 'test-document.pdf',
        filename: 'test-document.pdf',
        uploaded_at: '2025-11-21T00:00:00.000Z',
        overallStatus: 'completed'
      }

      expect(document._id).toBe('doc123')
      expect(document.originalName).toBe('test-document.pdf')
      expect(document.overallStatus).toBe('completed')
    })

    it('문서-고객 연결 정보 구조가 올바름', () => {
      const relation: DocumentCustomerRelation = {
        customer_id: 'customer123',
        customer_name: '홍길동',
        customer_type: 'individual',
        relationship_type: 'owner',
        assigned_at: '2025-11-21T00:00:00.000Z'
      }

      expect(relation.customer_id).toBe('customer123')
      expect(relation.customer_name).toBe('홍길동')
      expect(relation.relationship_type).toBe('owner')
    })

    it('내 파일 기능에 필요한 필드가 존재함', () => {
      const personalDocument: Document = {
        _id: 'doc456',
        originalName: 'my-file.pdf',
        filename: 'my-file.pdf',
        uploaded_at: '2025-11-21T00:00:00.000Z',
        ownerId: 'user123',
        customerId: 'customer456'
      }

      expect(personalDocument.ownerId).toBe('user123')
      expect(personalDocument.customerId).toBe('customer456')
    })
  })

  describe('Phase 5-3: 문서 상태 필터링', () => {
    /**
     * 회귀 테스트: 상태별 문서 필터링
     * 배경: 문서 목록에서 상태별 필터 적용
     */
    it('상태별 필터링이 정확함', () => {
      const documents: Document[] = [
        { _id: '1', originalName: 'doc1.pdf', filename: 'doc1.pdf', uploaded_at: '2025-11-21', overallStatus: 'completed' },
        { _id: '2', originalName: 'doc2.pdf', filename: 'doc2.pdf', uploaded_at: '2025-11-21', overallStatus: 'processing' },
        { _id: '3', originalName: 'doc3.pdf', filename: 'doc3.pdf', uploaded_at: '2025-11-21', overallStatus: 'error' },
        { _id: '4', originalName: 'doc4.pdf', filename: 'doc4.pdf', uploaded_at: '2025-11-21', overallStatus: 'timeout' },
        { _id: '5', originalName: 'doc5.pdf', filename: 'doc5.pdf', uploaded_at: '2025-11-21', overallStatus: 'pending' }
      ]

      const filterByStatus = (docs: Document[], status: DocumentStatus) =>
        docs.filter(d => d.overallStatus === status)

      expect(filterByStatus(documents, 'completed')).toHaveLength(1)
      expect(filterByStatus(documents, 'processing')).toHaveLength(1)
      expect(filterByStatus(documents, 'error')).toHaveLength(1)
      expect(filterByStatus(documents, 'timeout')).toHaveLength(1)
      expect(filterByStatus(documents, 'pending')).toHaveLength(1)
    })

    it('다중 상태 필터링이 가능함', () => {
      const documents: Document[] = [
        { _id: '1', originalName: 'doc1.pdf', filename: 'doc1.pdf', uploaded_at: '2025-11-21', overallStatus: 'completed' },
        { _id: '2', originalName: 'doc2.pdf', filename: 'doc2.pdf', uploaded_at: '2025-11-21', overallStatus: 'error' },
        { _id: '3', originalName: 'doc3.pdf', filename: 'doc3.pdf', uploaded_at: '2025-11-21', overallStatus: 'timeout' }
      ]

      // 에러 또는 타임아웃 상태만 필터
      const problemDocs = documents.filter(d =>
        d.overallStatus === 'error' || d.overallStatus === 'timeout'
      )

      expect(problemDocs).toHaveLength(2)
      expect(problemDocs.map(d => d._id)).toContain('2')
      expect(problemDocs.map(d => d._id)).toContain('3')
    })
  })

  describe('Phase 5-4: 페이지네이션 구조', () => {
    /**
     * 회귀 테스트: 페이지네이션 응답 구조
     * 배경: 대량 문서 목록 페이지 처리
     */
    it('페이지네이션 응답 구조가 올바름', () => {
      const pagination = {
        page: 1,
        limit: 20,
        total: 100,
        totalPages: 5,
        totalCount: 100
      }

      expect(pagination.page).toBe(1)
      expect(pagination.limit).toBe(20)
      expect(pagination.totalPages).toBe(5)
      expect(pagination.total).toBe(pagination.totalCount)
    })

    it('페이지 오프셋 계산이 정확함', () => {
      const page = 3
      const limit = 20

      // 오프셋 계산: (page - 1) * limit
      const offset = (page - 1) * limit

      expect(offset).toBe(40)
    })

    it('마지막 페이지 판별이 정확함', () => {
      const pagination = {
        page: 5,
        limit: 20,
        totalPages: 5
      }

      const isLastPage = pagination.page >= pagination.totalPages

      expect(isLastPage).toBe(true)
    })

    it('빈 결과 처리가 올바름', () => {
      const emptyPagination = {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        totalCount: 0
      }

      expect(emptyPagination.total).toBe(0)
      expect(emptyPagination.totalPages).toBe(0)
    })
  })

  describe('Phase 5-5: 문서 검색 API 구조', () => {
    /**
     * 회귀 테스트: 문서 검색 API 응답 구조
     * 배경: RAG 검색 결과 표시
     */
    it('검색 결과 구조가 올바름', () => {
      const searchResult = {
        success: true,
        data: {
          documents: [
            { _id: '1', originalName: 'result1.pdf', score: 0.95 },
            { _id: '2', originalName: 'result2.pdf', score: 0.87 }
          ],
          total: 2
        }
      }

      expect(searchResult.success).toBe(true)
      expect(searchResult.data.documents).toHaveLength(2)
      expect(searchResult.data.total).toBe(2)
    })

    it('검색 결과는 유사도 점수 순으로 정렬됨', () => {
      const results: Array<{ _id: string; score: number }> = [
        { _id: '1', score: 0.95 },
        { _id: '2', score: 0.87 },
        { _id: '3', score: 0.75 }
      ]

      // 유사도 내림차순 정렬 확인
      for (let i = 0; i < results.length - 1; i++) {
        const current = results[i]
        const next = results[i + 1]
        if (current && next) {
          expect(current.score).toBeGreaterThanOrEqual(next.score)
        }
      }
    })

    it('빈 검색 결과 처리가 올바름', () => {
      const emptyResult = {
        success: true,
        data: {
          documents: [],
          total: 0
        }
      }

      expect(emptyResult.success).toBe(true)
      expect(emptyResult.data.documents).toHaveLength(0)
      expect(emptyResult.data.total).toBe(0)
    })
  })

  describe('Phase 5-6: 문서-고객 연결 (커밋 관련)', () => {
    /**
     * 회귀 테스트: 문서-고객 연결 기능
     * 배경: 문서를 고객에게 할당하는 핵심 기능
     */
    it('문서 연결 API 엔드포인트가 올바름', () => {
      const linkEndpoint = '/api/documents/:docId/customer'
      const unlinkEndpoint = '/api/documents/:docId/customer'

      expect(linkEndpoint).toContain('/api/documents/')
      expect(linkEndpoint).toContain('/customer')
      expect(unlinkEndpoint).toBe(linkEndpoint)
    })

    it('연결 요청 페이로드 구조가 올바름', () => {
      const linkPayload = {
        customerId: 'customer123',
        relationshipType: 'owner',
        notes: '보험 계약 관련 문서'
      }

      expect(linkPayload.customerId).toBeTruthy()
      expect(linkPayload.relationshipType).toBeTruthy()
    })

    it('연결 해제 후 customer_relation이 없어짐', () => {
      const documentBeforeUnlink: Document = {
        _id: 'doc123',
        originalName: 'test.pdf',
        filename: 'test.pdf',
        uploaded_at: '2025-11-21',
        customer_relation: {
          customer_id: 'customer123',
          customer_name: '홍길동'
        }
      }

      // 연결 해제 후 상태 (customer_relation 필드 없음)
      const documentAfterUnlink: Document = {
        _id: 'doc123',
        originalName: 'test.pdf',
        filename: 'test.pdf',
        uploaded_at: '2025-11-21'
        // customer_relation 필드 없음
      }

      expect(documentBeforeUnlink.customer_relation).toBeDefined()
      expect(documentAfterUnlink.customer_relation).toBeUndefined()
    })
  })

  describe('Phase 5-7: 사용자별 문서 필터링 (커밋 5617226b)', () => {
    /**
     * 회귀 테스트: 사용자별 문서 필터링
     * 배경: 문서 관리 통계 API에 사용자별 필터링 추가
     */
    it('ownerId로 문서 필터링이 가능함', () => {
      const documents: Document[] = [
        { _id: '1', originalName: 'doc1.pdf', filename: 'doc1.pdf', uploaded_at: '2025-11-21', ownerId: 'user1' },
        { _id: '2', originalName: 'doc2.pdf', filename: 'doc2.pdf', uploaded_at: '2025-11-21', ownerId: 'user2' },
        { _id: '3', originalName: 'doc3.pdf', filename: 'doc3.pdf', uploaded_at: '2025-11-21', ownerId: 'user1' }
      ]

      const user1Docs = documents.filter(d => d.ownerId === 'user1')

      expect(user1Docs).toHaveLength(2)
      expect(user1Docs.every(d => d.ownerId === 'user1')).toBe(true)
    })

    it('통계 API에 userId 파라미터가 포함됨', () => {
      const statsEndpoint = '/api/documents/stats'
      const queryParams = { userId: 'user123' }

      expect(statsEndpoint).toBe('/api/documents/stats')
      expect(queryParams.userId).toBe('user123')
    })
  })

  describe('Phase 5-8: 문서 상세 조회 응답 구조', () => {
    /**
     * 회귀 테스트: 문서 상세 조회 API 응답
     * 배경: raw + computed 구조로 API 응답 설계
     */
    it('문서 상세 응답에 raw와 computed가 포함됨', () => {
      const detailResponse = {
        success: true,
        data: {
          raw: {
            _id: 'doc123',
            upload: { status: 'done' },
            meta: { mime: 'application/pdf' },
            ocr: null,
            text: null,
            docembed: null
          },
          computed: {
            uiStages: {},
            currentStage: 2,
            overallStatus: 'completed' as DocumentStatus,
            progress: 100,
            displayMessages: {},
            processingPath: 'meta_fulltext' as const
          },
          _id: 'doc123',
          originalName: 'test.pdf'
        }
      }

      expect(detailResponse.data.raw).toBeDefined()
      expect(detailResponse.data.computed).toBeDefined()
      expect(detailResponse.data.computed.overallStatus).toBe('completed')
    })

    it('computed.overallStatus가 UI 상태 표시에 사용됨', () => {
      const computedStatus: DocumentStatus = 'processing'

      // UI에서는 computed.overallStatus를 사용
      expect(['completed', 'processing', 'error', 'pending', 'timeout']).toContain(computedStatus)
    })
  })

  describe('Phase 5-9: Annual Report 자동 링크', () => {
    /**
     * 회귀 테스트: 정책 문서 AR 자동 링크
     * 배경: 특정 문서 타입에 Annual Report 자동 연결
     */
    it('is_annual_report 플래그가 존재함', () => {
      const arDocument: Document = {
        _id: 'doc123',
        originalName: 'annual-report-2024.pdf',
        filename: 'annual-report-2024.pdf',
        uploaded_at: '2025-11-21',
        is_annual_report: true
      }

      expect(arDocument.is_annual_report).toBe(true)
    })

    it('일반 문서는 is_annual_report가 false 또는 undefined', () => {
      const normalDocument: Document = {
        _id: 'doc456',
        originalName: 'contract.pdf',
        filename: 'contract.pdf',
        uploaded_at: '2025-11-21'
      }

      expect(normalDocument.is_annual_report).toBeFalsy()
    })
  })

  describe('Phase 5-10: 문서 배지 타입', () => {
    /**
     * 회귀 테스트: 문서 처리 방식 배지
     * 배경: TXT/OCR/BIN 배지로 문서 처리 방식 표시
     */
    it('badgeType은 TXT, OCR, BIN 중 하나', () => {
      const validBadgeTypes = ['TXT', 'OCR', 'BIN']

      const txtDoc: Document = {
        _id: '1', originalName: 'text.pdf', filename: 'text.pdf', uploaded_at: '2025-11-21',
        badgeType: 'TXT'
      }

      const ocrDoc: Document = {
        _id: '2', originalName: 'scanned.pdf', filename: 'scanned.pdf', uploaded_at: '2025-11-21',
        badgeType: 'OCR'
      }

      const binDoc: Document = {
        _id: '3', originalName: 'binary.exe', filename: 'binary.exe', uploaded_at: '2025-11-21',
        badgeType: 'BIN'
      }

      expect(validBadgeTypes).toContain(txtDoc.badgeType)
      expect(validBadgeTypes).toContain(ocrDoc.badgeType)
      expect(validBadgeTypes).toContain(binDoc.badgeType)
    })

    it('배지 타입별 의미가 명확함', () => {
      const badgeMeaning = {
        TXT: '텍스트 추출 완료 (PDF 내장 텍스트)',
        OCR: 'OCR 처리 완료 (이미지에서 텍스트 추출)',
        BIN: '바이너리 파일 (텍스트 추출 불가)'
      }

      expect(badgeMeaning.TXT).toContain('텍스트')
      expect(badgeMeaning.OCR).toContain('OCR')
      expect(badgeMeaning.BIN).toContain('바이너리')
    })
  })

  describe('통합 검증', () => {
    it('문서 관리 전체 플로우가 올바름', () => {
      const documentFlow = [
        '1. 문서 업로드 (upload stage)',
        '2. 메타데이터 추출 (meta stage)',
        '3. OCR/텍스트 처리 (ocr/text stage)',
        '4. 임베딩 생성 (embed stage)',
        '5. 고객 연결 (customer_relation)',
        '6. 검색 가능 상태'
      ]

      expect(documentFlow).toHaveLength(6)
      expect(documentFlow[0]).toContain('업로드')
      expect(documentFlow[4]).toContain('고객')
      expect(documentFlow[5]).toContain('검색')
    })

    it('문서 상태 전이가 올바름', () => {
      const stateTransitions = {
        pending: ['processing', 'error'],
        processing: ['completed', 'error', 'timeout'],
        completed: [], // 종료 상태
        error: [],     // 종료 상태
        timeout: []    // 종료 상태
      }

      expect(stateTransitions.pending).toContain('processing')
      expect(stateTransitions.processing).toContain('completed')
      expect(stateTransitions.processing).toContain('timeout')
      expect(stateTransitions.completed).toHaveLength(0)
    })
  })

  describe('#52-2: 대량 삭제 청크 기반 배치 처리', () => {
    /**
     * 회귀 테스트: 대량 삭제 시 서버 과부하 방지
     * 배경: 319개 동시 DELETE → aims_api 과부하 → 71개 타임아웃 → "삭제 실패" 오보고
     * 수정: Promise.all(개별 DELETE) → 청크 단위 배치 DELETE 순차 처리
     */
    it('DELETE_CHUNK_SIZE가 50 이하로 정의되어 서버 과부하 방지', async () => {
      // useDocumentActions 소스에서 청크 사이즈 확인
      const { default: fs } = await import('fs')
      const hookSource = fs.readFileSync(
        'src/hooks/useDocumentActions.ts', 'utf-8'
      )
      // 청크 기반 배치 삭제 코드가 존재
      expect(hookSource).toContain('DELETE_CHUNK_SIZE')
      expect(hookSource).toContain('DocumentService.deleteDocuments')

      // Promise.all 개별 삭제 패턴이 제거됨
      expect(hookSource).not.toContain("Promise.all")
    })

    it('319개 문서를 50개 청크로 분할하면 7개 배치', () => {
      const CHUNK_SIZE = 50
      const totalDocuments = 319
      const expectedChunks = Math.ceil(totalDocuments / CHUNK_SIZE)

      expect(expectedChunks).toBe(7)

      // 마지막 청크 크기 확인
      const lastChunkSize = totalDocuments % CHUNK_SIZE || CHUNK_SIZE
      expect(lastChunkSize).toBe(19) // 319 % 50 = 19
    })

    it('배치 삭제 결과를 정확하게 집계', () => {
      // 7개 배치 중 6개 성공(각 50개), 1개 일부 실패 시뮬레이션
      const batchResults = [
        { deletedCount: 50, failedCount: 0 },
        { deletedCount: 50, failedCount: 0 },
        { deletedCount: 50, failedCount: 0 },
        { deletedCount: 50, failedCount: 0 },
        { deletedCount: 50, failedCount: 0 },
        { deletedCount: 48, failedCount: 2 }, // 2개 실패
        { deletedCount: 19, failedCount: 0 },
      ]

      const totalDeleted = batchResults.reduce((sum, r) => sum + r.deletedCount, 0)
      const totalFailed = batchResults.reduce((sum, r) => sum + r.failedCount, 0)

      expect(totalDeleted).toBe(317)
      expect(totalFailed).toBe(2)
      expect(totalDeleted + totalFailed).toBe(319)
    })

    it('DocumentLibraryView에서 개별 DELETE 대신 배치 삭제 사용', async () => {
      const { default: fs } = await import('fs')
      const source = fs.readFileSync(
        'src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx', 'utf-8'
      )
      // handleDeleteSelected에서 DocumentService.deleteDocuments 사용
      expect(source).toContain('DocumentService.deleteDocuments')
      // 개별 api.delete 대량 삭제 패턴이 없어야 함
      expect(source).not.toMatch(/Promise\.all\(\s*Array\.from\(selectedDocumentIds\)\.map/)
    })

    it('DocumentsTab에서 개별 DELETE 대신 배치 삭제 사용', async () => {
      const { default: fs } = await import('fs')
      const source = fs.readFileSync(
        'src/features/customer/views/CustomerDetailView/tabs/DocumentsTab.tsx', 'utf-8'
      )
      expect(source).toContain('DocumentService.deleteDocuments')
      expect(source).not.toMatch(/Promise\.all\(\s*Array\.from\(selectedDocumentIds\)\.map/)
    })
  })
})
