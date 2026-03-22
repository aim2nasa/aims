/**
 * DocumentStatusService Unit Tests
 * @since 2025-10-14
 * @description DocumentStatusService의 복잡한 데이터 추출 및 처리 경로 분석 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentStatusService } from '../DocumentStatusService'
import type { Document } from '../../types/documentStatus'

// Fetch API 모킹
global.fetch = vi.fn()

describe('DocumentStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================================
  // 1. API 호출 메서드
  // ============================================================================
  describe('API Methods', () => {
    describe('checkHealth', () => {
      it('헬스체크 API를 호출해야 함', async () => {
        const mockResponse = {
          status: 'ok',
          timestamp: '2025-10-14T10:00:00Z',
        }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        } as Response)

        const result = await DocumentStatusService.checkHealth()

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/health'),
          expect.objectContaining({
            method: 'GET',
            mode: 'cors',
          })
        )
        expect(result).toEqual(mockResponse)
      })

      it('HTTP 에러 시 에러를 던져야 함', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response)

        await expect(DocumentStatusService.checkHealth()).rejects.toThrow(
          'HTTP 500: Internal Server Error'
        )
      })

      it('네트워크 에러를 처리해야 함', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network Error'))

        await expect(DocumentStatusService.checkHealth()).rejects.toThrow('Network Error')
      })
    })

    describe('getRecentDocuments', () => {
      it('최근 문서 목록을 조회해야 함', async () => {
        const mockData = {
          documents: [{ _id: 'doc1', filename: 'test.pdf' }],
          total: 1,
        }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockData }),
        } as Response)

        const result = await DocumentStatusService.getRecentDocuments(1, 10)

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/documents/status?page=1&limit=10'),
          expect.any(Object)
        )
        expect(result).toEqual(mockData)
      })

      it('page와 limit 파라미터를 전달해야 함', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: { documents: [] } }),
        } as Response)

        await DocumentStatusService.getRecentDocuments(2, 50)

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('page=2'),
          expect.any(Object)
        )
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('limit=50'),
          expect.any(Object)
        )
      })

      it('success=false인 경우 data를 그대로 반환해야 함', async () => {
        const mockData = { documents: [], total: 0 }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false, ...mockData }),
        } as Response)

        const result = await DocumentStatusService.getRecentDocuments()

        expect(result).toMatchObject({ documents: [], total: 0 })
      })
    })

    describe('getDocumentStatus', () => {
      it('특정 문서의 상태를 조회해야 함', async () => {
        const mockDetail = {
          _id: 'doc1',
          status: 'completed',
          progress: 100,
        }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockDetail,
        } as Response)

        const result = await DocumentStatusService.getDocumentStatus('doc1')

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/documents/doc1/status'),
          expect.any(Object)
        )
        expect(result).toEqual(mockDetail)
      })
    })

    describe('getDocumentDetailViaWebhook', () => {
      it('백엔드 API를 통해 문서 상세를 조회해야 함', async () => {
        const mockDetail = { _id: 'doc1', filename: 'test.pdf' }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockDetail,
        } as Response)

        const result = await DocumentStatusService.getDocumentDetailViaWebhook('doc1')

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/documents/doc1/status'),
          expect.objectContaining({
            method: 'GET',
          })
        )
        expect(result).toEqual(mockDetail)
      })

      it('객체 응답을 그대로 반환해야 함', async () => {
        const mockDetail = { _id: 'doc1' }

        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => mockDetail,
        } as Response)

        const result = await DocumentStatusService.getDocumentDetailViaWebhook('doc1')

        expect(result).toEqual(mockDetail)
      })

      it('유효하지 않은 응답은 null을 반환해야 함', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => null,
        } as Response)

        const result = await DocumentStatusService.getDocumentDetailViaWebhook('doc1')

        expect(result).toBeNull()
      })

      it('403 응답 시 throw 없이 null 반환 (삭제된 문서/고아 참조)', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: '',
        } as Response)

        const result = await DocumentStatusService.getDocumentDetailViaWebhook('deleted-doc')

        expect(result).toBeNull()
      })

      it('404 응답 시 throw 없이 null 반환', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)

        const result = await DocumentStatusService.getDocumentDetailViaWebhook('missing-doc')

        expect(result).toBeNull()
      })
    })
  })

  // ============================================================================
  // 2. NEW: extractFilenameFromRaw() - raw 필드에서 파일명 추출
  // ============================================================================
  describe('extractFilenameFromRaw', () => {
    it('raw가 없으면 null을 반환해야 함', () => {
      expect(DocumentStatusService.extractFilenameFromRaw(undefined)).toBeNull()
    })

    it('raw.upload.originalName을 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { originalName: 'test.pdf' },
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFilenameFromRaw(raw)).toBe('test.pdf')
    })

    it('raw.meta.filename을 fallback으로 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: null,
        meta: { filename: 'meta-file.pdf' },
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFilenameFromRaw(raw)).toBe('meta-file.pdf')
    })

    it('upload.originalName이 우선순위가 높아야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { originalName: 'upload.pdf' },
        meta: { filename: 'meta.pdf' },
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFilenameFromRaw(raw)).toBe('upload.pdf')
    })

    it('파일명이 없으면 null을 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: null,
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFilenameFromRaw(raw)).toBeNull()
    })
  })

  // ============================================================================
  // 3. extractFilename() - 복잡한 fallback 체인
  // ============================================================================
  describe('extractFilename', () => {
    it('upload.originalName을 최우선으로 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'from-upload.pdf' }),
        filename: 'fallback.pdf',
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('from-upload.pdf')
    })

    it('stages.upload.originalName을 두 번째 우선순위로 반환해야 함', () => {
      const doc: Document = {
        stages: {
          upload: JSON.stringify({ originalName: 'from-stages-upload.pdf' }),
        },
        filename: 'fallback.pdf',
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('from-stages-upload.pdf')
    })

    it('기본 필드에서 찾아야 함 (originalName)', () => {
      const doc: Document = {
        originalName: 'original.pdf',
        filename: 'filename.pdf',
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('original.pdf')
    })

    it('기본 필드에서 찾아야 함 (filename)', () => {
      const doc: Document = {
        filename: 'filename.pdf',
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('filename.pdf')
    })

    it('meta.filename을 대체값으로 사용해야 함', () => {
      const doc: Document = {
        meta: JSON.stringify({ filename: 'from-meta.pdf' }),
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('from-meta.pdf')
    })

    it('stages.meta.filename을 대체값으로 사용해야 함', () => {
      const doc: Document = {
        stages: {
          meta: JSON.stringify({ filename: 'from-stages-meta.pdf' }),
        },
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('from-stages-meta.pdf')
    })

    it('stages의 모든 단계에서 originalName을 검색해야 함', () => {
      const doc: Document = {
        stages: {
          ocr: JSON.stringify({ originalName: 'from-ocr.pdf' }),
        },
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('from-ocr.pdf')
    })

    it('stages의 모든 단계에서 filename을 검색해야 함', () => {
      const doc: Document = {
        stages: {
          docembed: JSON.stringify({ filename: 'from-docembed.pdf' }),
        },
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('from-docembed.pdf')
    })

    it('모든 필드가 없으면 "Unknown File"을 반환해야 함', () => {
      const doc: Document = {}

      expect(DocumentStatusService.extractFilename(doc)).toBe('Unknown File')
    })

    it('JSON 파싱 실패 시 다음 fallback으로 넘어가야 함', () => {
      const doc: Document = {
        upload: 'invalid-json',
        filename: 'fallback.pdf',
      }

      expect(DocumentStatusService.extractFilename(doc)).toBe('fallback.pdf')
    })
  })

  // ============================================================================
  // 3-1. NEW: extractOriginalFilename() - 원본 파일명 추출 (displayName 무시)
  // ============================================================================
  describe('extractOriginalFilename', () => {
    it('upload.originalName을 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'original.pdf' }),
        displayName: '홍길동_AR_2026.01.21.pdf',  // displayName은 무시
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('original.pdf')
    })

    it('stages.upload.originalName을 반환해야 함', () => {
      const doc: Document = {
        stages: {
          upload: JSON.stringify({ originalName: 'stages-original.pdf' }),
        },
        displayName: '홍길동_CRS_보험상품_2026.01.21.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('stages-original.pdf')
    })

    it('기본 필드에서 originalName을 찾아야 함', () => {
      const doc: Document = {
        originalName: 'doc-original.pdf',
        displayName: '김철수_AR_2026.01.21.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('doc-original.pdf')
    })

    it('기본 필드에서 filename을 fallback으로 사용해야 함', () => {
      const doc: Document = {
        filename: 'filename.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('filename.pdf')
    })

    it('기본 필드에서 file_name을 fallback으로 사용해야 함', () => {
      const doc: Document = {
        file_name: 'file_name.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('file_name.pdf')
    })

    it('기본 필드에서 name을 fallback으로 사용해야 함', () => {
      const doc: Document = {
        name: 'name.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('name.pdf')
    })

    it('기본 필드에서 title을 fallback으로 사용해야 함', () => {
      const doc: Document = {
        title: 'title.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('title.pdf')
    })

    it('모든 필드가 없으면 "Unknown File"을 반환해야 함', () => {
      const doc: Document = {
        displayName: '홍길동_AR_2026.01.21.pdf',  // displayName만 있으면 무시
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('Unknown File')
    })

    it('displayName이 있어도 무시하고 originalName을 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'AR20260121_00038235_original.pdf' }),
        displayName: '홍길동_AR_2026.01.21.pdf',
        filename: 'fallback.pdf',
      }

      // displayName이 아닌 originalName 반환
      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('AR20260121_00038235_original.pdf')
    })

    it('AR 파일의 원본 파일명을 올바르게 추출해야 함', () => {
      // 실제 AR 파일 구조 시뮬레이션
      const doc: Document = {
        upload: JSON.stringify({
          originalName: 'AR20260121_00038235_홍길동_삼성생명.pdf',
          saveName: 'abc123.pdf',
        }),
        meta: JSON.stringify({
          displayName: '홍길동_AR_2026.01.21.pdf',  // 백엔드에서 생성된 displayName
          meta_status: 'ok',
        }),
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('AR20260121_00038235_홍길동_삼성생명.pdf')
    })

    it('CRS 파일의 원본 파일명을 올바르게 추출해야 함', () => {
      // 실제 CRS 파일 구조 시뮬레이션
      const doc: Document = {
        upload: JSON.stringify({
          originalName: 'CRS_변액종합리포트_2026.01.pdf',
        }),
        displayName: '김철수_CRS_변액유니버셜_2026.01.15.pdf',
      }

      expect(DocumentStatusService.extractOriginalFilename(doc)).toBe('CRS_변액종합리포트_2026.01.pdf')
    })
  })

  // ============================================================================
  // 3. extractSaveName()
  // ============================================================================
  describe('extractSaveName', () => {
    it('upload.saveName을 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ saveName: 'saved-file.pdf' }),
      }

      expect(DocumentStatusService.extractSaveName(doc)).toBe('saved-file.pdf')
    })

    it('stages.upload.saveName을 반환해야 함', () => {
      const doc: Document = {
        stages: {
          upload: JSON.stringify({ saveName: 'stages-saved.pdf' }),
        },
      }

      expect(DocumentStatusService.extractSaveName(doc)).toBe('stages-saved.pdf')
    })

    it('saveName이 없으면 null을 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
      }

      expect(DocumentStatusService.extractSaveName(doc)).toBeNull()
    })
  })

  // ============================================================================
  // 4. NEW: extractFileSizeFromRaw() - raw 필드에서 파일 크기 추출
  // ============================================================================
  describe('extractFileSizeFromRaw', () => {
    it('raw가 없으면 null을 반환해야 함', () => {
      expect(DocumentStatusService.extractFileSizeFromRaw(undefined)).toBeNull()
    })

    it('raw.meta.size_bytes를 우선 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { fileSize: 1024 },
        meta: { size_bytes: 2048 },
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFileSizeFromRaw(raw)).toBe(2048)
    })

    it('raw.upload.fileSize를 fallback으로 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { fileSize: 4096 },
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFileSizeFromRaw(raw)).toBe(4096)
    })

    it('파일 크기가 없으면 null을 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: null,
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFileSizeFromRaw(raw)).toBeNull()
    })

    it('size_bytes가 0이면 0을 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: null,
        meta: { size_bytes: 0 },
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractFileSizeFromRaw(raw)).toBe(0)
    })
  })

  // ============================================================================
  // 5. extractFileSize()
  // ============================================================================
  describe('extractFileSize', () => {
    it('upload.fileSize를 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ fileSize: 1024 }),
      }

      expect(DocumentStatusService.extractFileSize(doc)).toBe(1024)
    })

    it('stages.upload.fileSize를 반환해야 함', () => {
      const doc: Document = {
        stages: {
          upload: JSON.stringify({ fileSize: 2048 }),
        },
      }

      expect(DocumentStatusService.extractFileSize(doc)).toBe(2048)
    })

    it('기본 size 필드를 반환해야 함', () => {
      const doc: Document = {
        size: 4096,
      }

      expect(DocumentStatusService.extractFileSize(doc)).toBe(4096)
    })

    it('fileSize 필드를 반환해야 함', () => {
      const doc: Document = {
        fileSize: 8192,
      }

      expect(DocumentStatusService.extractFileSize(doc)).toBe(8192)
    })

    it('meta.size를 반환해야 함', () => {
      const doc: Document = {
        meta: JSON.stringify({ size: 16384 }),
      }

      expect(DocumentStatusService.extractFileSize(doc)).toBe(16384)
    })

    it('크기 정보가 없으면 0을 반환해야 함', () => {
      const doc: Document = {}

      expect(DocumentStatusService.extractFileSize(doc)).toBe(0)
    })
  })

  // ============================================================================
  // 5. extractProgress() - 복잡한 진행률 계산
  // ============================================================================
  describe('extractProgress', () => {
    it('document.progress를 우선 반환해야 함', () => {
      const doc: Document = {
        progress: 75,
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(75)
    })

    it('embed completed면 100을 반환해야 함', () => {
      const doc: Document = {
        progress: 50,
        stages: {
          embed: JSON.stringify({ status: 'completed' }),
        },
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(100)
    })

    it('docembed done이면 100을 반환해야 함', () => {
      const doc: Document = {
        progress: 50,
        stages: {
          docembed: JSON.stringify({ status: 'done' }),
        },
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(100)
    })

    it('meta full_text + completed면 100을 반환해야 함', () => {
      const doc: Document = {
        progress: 50,
        stages: {
          meta: JSON.stringify({ full_text: 'text content', status: 'completed' }),
        },
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(100)
    })

    it('overallStatus completed면 100을 반환해야 함', () => {
      const doc: Document = {
        overallStatus: 'completed',
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(100)
    })

    it('docembed.status=completed면 100을 반환해야 함', () => {
      const doc: Document = {
        docembed: JSON.stringify({ status: 'completed' }),
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(100)
    })

    it('meta ok + full_text면 75를 반환해야 함', () => {
      const doc: Document = {
        meta: JSON.stringify({ meta_status: 'ok', full_text: 'content' }),
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(75)
    })

    it('meta ok만 있으면 50을 반환해야 함', () => {
      const doc: Document = {
        meta: JSON.stringify({ meta_status: 'ok' }),
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(50)
    })

    it('upload만 있으면 25를 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
      }

      expect(DocumentStatusService.extractProgress(doc)).toBe(25)
    })

    it('아무 정보도 없으면 0을 반환해야 함', () => {
      const doc: Document = {}

      expect(DocumentStatusService.extractProgress(doc)).toBe(0)
    })
  })

  // ============================================================================
  // 6. NEW: extractUploadedDateFromRaw() - raw 필드에서 업로드 날짜 추출
  // ============================================================================
  describe('extractUploadedDateFromRaw', () => {
    it('raw가 없으면 null을 반환해야 함', () => {
      expect(DocumentStatusService.extractUploadedDateFromRaw(undefined)).toBeNull()
    })

    it('raw.upload.uploaded_at을 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { uploaded_at: '2025-10-14T10:00:00Z' },
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBe('2025-10-14T10:00:00Z')
    })

    it('raw.upload.timestamp를 fallback으로 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { timestamp: '2025-10-14T11:00:00Z' },
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBe('2025-10-14T11:00:00Z')
    })

    it('raw.meta.created_at을 두 번째 fallback으로 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: null,
        meta: { created_at: '2025-10-14T12:00:00Z' },
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBe('2025-10-14T12:00:00Z')
    })

    it('xxx 접미사를 제거해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { uploaded_at: '2025-10-14T10:00:00.123xxx' },
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBe('2025-10-14T10:00:00.123')
    })

    it('밀리초 + xxx 접미사를 제거해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: { uploaded_at: '2025-10-14T10:00:00.999xxx' },
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBe('2025-10-14T10:00:00.999')
    })

    it('날짜 정보가 없으면 null을 반환해야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: null,
        meta: null,
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBeNull()
    })

    it('uploaded_at이 우선순위가 가장 높아야 함', () => {
      const raw = {
        _id: 'doc1',
        upload: {
          uploaded_at: '2025-10-14T10:00:00Z',
          timestamp: '2025-10-14T11:00:00Z'
        },
        meta: { created_at: '2025-10-14T12:00:00Z' },
        ocr: null,
        text: null,
        docembed: null,
      }

      expect(DocumentStatusService.extractUploadedDateFromRaw(raw)).toBe('2025-10-14T10:00:00Z')
    })
  })

  // ============================================================================
  // 7. extractUploadedDate()
  // ============================================================================
  describe('extractUploadedDate', () => {
    it('upload.timestamp를 반환해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ timestamp: '2025-10-14T10:00:00Z' }),
      }

      expect(DocumentStatusService.extractUploadedDate(doc)).toBe('2025-10-14T10:00:00Z')
    })

    it('xxx 접미사를 제거해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ timestamp: '2025-10-14T10:00:00.123xxx' }),
      }

      expect(DocumentStatusService.extractUploadedDate(doc)).toBe('2025-10-14T10:00:00.123')
    })

    it('밀리초 + xxx 접미사를 제거해야 함', () => {
      const doc: Document = {
        uploaded_at: '2025-10-14T10:00:00.999xxx',
      }

      const result = DocumentStatusService.extractUploadedDate(doc)
      // .xxx$ 패턴이 매치되지 않으므로 xxx만 제거됨
      expect(result).toBe('2025-10-14T10:00:00.999')
    })

    it('날짜 정보가 없으면 null을 반환해야 함', () => {
      const doc: Document = {}

      expect(DocumentStatusService.extractUploadedDate(doc)).toBeNull()
    })
  })

  // ============================================================================
  // 7. analyzeProcessingPath() - 처리 경로 분석
  // ============================================================================
  describe('analyzeProcessingPath', () => {
    it('Upload 단계 badge를 생성해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'U',
        name: 'Upload',
        status: 'completed',
        icon: 'Upload',
      })
    })

    it('Meta 완료 시 badge를 생성해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
        meta: JSON.stringify({ meta_status: 'ok' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'M',
        name: 'Meta',
        status: 'completed',
        icon: 'Database',
      })
    })

    it('unsupported MIME은 pathType을 unsupported로 설정해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.ps' }),
        meta: JSON.stringify({
          meta_status: 'ok',
          mime: 'application/postscript',
        }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.pathType).toBe('unsupported')
      expect(result.expectedStages).toEqual(['U', 'M'])
    })

    it('페이지 수 초과는 page_limit_exceeded로 설정해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'big.pdf' }),
        meta: JSON.stringify({
          meta_status: 'ok',
          pdf_pages: 35,
        }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.pathType).toBe('page_limit_exceeded')
      expect(result.expectedStages).toEqual(['U', 'M'])
    })

    it('meta full_text가 있으면 meta_fulltext 경로여야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
        meta: JSON.stringify({
          meta_status: 'ok',
          full_text: 'extracted text',
        }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.pathType).toBe('meta_fulltext')
      expect(result.expectedStages).toEqual(['U', 'M', 'E'])
    })

    it('OCR 완료 시 badge를 생성해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
        meta: JSON.stringify({ meta_status: 'ok' }),
        ocr: JSON.stringify({ status: 'done' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'O',
        name: 'OCR',
        status: 'completed',
        icon: 'Eye',
      })
      expect(result.pathType).toBe('ocr_normal')
    })

    it('OCR 스킵 시 skipped badge를 생성해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
        meta: JSON.stringify({ meta_status: 'ok' }),
        ocr: JSON.stringify({ warn: 'skipped' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'O',
        name: 'OCR',
        status: 'skipped',
        icon: 'Eye',
      })
      expect(result.pathType).toBe('ocr_skipped')
    })

    it('DocEmbed 완료 시 badge를 생성해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
        meta: JSON.stringify({ meta_status: 'ok' }),
        docembed: JSON.stringify({ status: 'done' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'E',
        name: 'Embed',
        status: 'completed',
        icon: 'Package',
      })
    })

    it('Meta 에러 시 error badge를 생성해야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.pdf' }),
        meta: JSON.stringify({ meta_status: 'error' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'M',
        name: 'Meta',
        status: 'error',
        icon: 'Database',
      })
      expect(result.pathType).toBe('processing')
    })

    it('Text 단계가 있으면 text_plain 경로여야 함', () => {
      const doc: Document = {
        upload: JSON.stringify({ originalName: 'test.txt' }),
        meta: JSON.stringify({ meta_status: 'ok' }),
        text: JSON.stringify({ full_text: 'plain text content' }),
      }

      const result = DocumentStatusService.analyzeProcessingPath(doc)

      expect(result.badges).toContainEqual({
        type: 'T',
        name: 'Text',
        status: 'completed',
        icon: 'FileText',
      })
      expect(result.pathType).toBe('text_plain')
      expect(result.expectedStages).toEqual(['U', 'M', 'T', 'E'])
    })
  })

  // ============================================================================
  // 8. formatUploadDate()
  // ============================================================================
  describe('formatUploadDate', () => {
    it('날짜를 "YYYY.MM.DD HH:MM:SS" 형식으로 포맷해야 함', () => {
      const result = DocumentStatusService.formatUploadDate('2025-10-14T15:30:45Z')

      // UTC 시간대 차이를 고려하여 년월일만 검증
      expect(result).toMatch(/2025\.10\.(14|15) \d{2}:\d{2}:\d{2}/)
    })

    it('한 자리 수 월/일은 0으로 패딩해야 함', () => {
      const result = DocumentStatusService.formatUploadDate('2025-01-05T08:09:07Z')

      // 0 패딩이 제대로 되었는지 검증
      expect(result).toMatch(/2025\.01\.05 \d{2}:\d{2}:\d{2}/)
      const parts = result.split('.')
      expect(parts[1]).toBe('01') // 월 확인
      expect(parts[2]?.split(' ')[0]).toBe('05') // 일 확인
    })

    it('null 입력 시 "-"를 반환해야 함', () => {
      expect(DocumentStatusService.formatUploadDate(null)).toBe('-')
    })

    it('빈 문자열 시 "-"를 반환해야 함', () => {
      expect(DocumentStatusService.formatUploadDate('')).toBe('-')
    })

    it('유효하지 않은 날짜 시 "-"를 반환해야 함', () => {
      expect(DocumentStatusService.formatUploadDate('invalid-date')).toBe('-')
    })

    it('날짜 파싱 에러 시 "-"를 반환해야 함', () => {
      expect(DocumentStatusService.formatUploadDate('not-a-date')).toBe('-')
    })
  })
})
