/**
 * Phase 1.1 테스트: documentTransformers.ts
 *
 * 테스트 대상:
 * - normalizeDestPath
 * - resolveFileUrl
 * - toSmartSearchDocumentResponse
 * - buildSelectedDocument
 */

import {
  normalizeDestPath,
  resolveFileUrl,
  toSmartSearchDocumentResponse,
  buildSelectedDocument,
  type SmartSearchDocumentResponse
} from '../documentTransformers'

describe('documentTransformers', () => {
  describe('normalizeDestPath', () => {
    test('정상 경로는 그대로 반환', () => {
      expect(normalizeDestPath('/data/files/doc.pdf')).toBe('/data/files/doc.pdf')
    })

    test('앞뒤 공백 제거', () => {
      expect(normalizeDestPath('  /path/to/file  ')).toBe('/path/to/file')
    })

    test('빈 문자열은 undefined 반환', () => {
      expect(normalizeDestPath('')).toBeUndefined()
      expect(normalizeDestPath('   ')).toBeUndefined()
    })

    test('undefined 입력은 undefined 반환', () => {
      expect(normalizeDestPath(undefined)).toBeUndefined()
    })
  })

  describe('resolveFileUrl', () => {
    test('/data로 시작하는 경로는 /data 제거 후 URL 생성', () => {
      expect(resolveFileUrl('/data/files/doc.pdf')).toBe('https://tars.giize.com/files/doc.pdf')
    })

    test('/data로 시작하지 않는 경로는 그대로 URL 생성', () => {
      expect(resolveFileUrl('/files/doc.pdf')).toBe('https://tars.giize.com/files/doc.pdf')
    })

    test('빈 경로는 undefined 반환', () => {
      expect(resolveFileUrl('')).toBeUndefined()
      expect(resolveFileUrl(undefined)).toBeUndefined()
    })
  })

  describe('toSmartSearchDocumentResponse', () => {
    test('plain object는 SmartSearchDocumentResponse로 변환', () => {
      const input = {
        upload: { originalName: 'test.pdf' },
        payload: { dest_path: '/path' },
        meta: { mime: 'application/pdf' }
      }
      const result = toSmartSearchDocumentResponse(input)

      expect(result).not.toBeNull()
      expect(result?.upload).toEqual({ originalName: 'test.pdf' })
      expect(result?.payload).toEqual({ dest_path: '/path' })
      expect(result?.meta).toEqual({ mime: 'application/pdf' })
    })

    test('빈 object는 빈 필드로 변환', () => {
      const result = toSmartSearchDocumentResponse({})

      expect(result).not.toBeNull()
      expect(result?.upload).toEqual({})
      expect(result?.payload).toEqual({})
      expect(result?.meta).toEqual({})
    })

    test('null 입력은 null 반환', () => {
      expect(toSmartSearchDocumentResponse(null)).toBeNull()
    })

    test('non-object 입력은 null 반환', () => {
      expect(toSmartSearchDocumentResponse('string')).toBeNull()
      expect(toSmartSearchDocumentResponse(123)).toBeNull()
      expect(toSmartSearchDocumentResponse(undefined)).toBeNull()
    })

    test('ocr 필드가 있으면 포함', () => {
      const input = {
        upload: {},
        ocr: { text: 'extracted text' }
      }
      const result = toSmartSearchDocumentResponse(input)

      expect(result?.ocr).toEqual({ text: 'extracted text' })
    })
  })

  describe('buildSelectedDocument', () => {
    test('기본 문서 변환', () => {
      const raw: SmartSearchDocumentResponse = {
        upload: {
          originalName: 'document.pdf',
          destPath: '/data/files/document.pdf',
          uploaded_at: '2024-01-01T00:00:00Z'
        },
        meta: {
          mime: 'application/pdf',
          size_bytes: 1024
        }
      }

      const result = buildSelectedDocument('doc-123', raw)

      expect(result._id).toBe('doc-123')
      expect(result.upload.originalName).toBe('document.pdf')
      expect(result.upload.destPath).toBe('/data/files/document.pdf')
      expect(result.upload.uploadedAt).toBe('2024-01-01T00:00:00Z')
      expect(result.meta.mime).toBe('application/pdf')
      expect(result.meta.sizeBytes).toBe(1024)
      expect(result.fileUrl).toBe('https://tars.giize.com/files/document.pdf')
    })

    test('originalName이 없으면 기본값 "문서" 사용', () => {
      const raw: SmartSearchDocumentResponse = {
        upload: {},
        meta: {}
      }

      const result = buildSelectedDocument('doc-456', raw)

      expect(result.upload.originalName).toBe('문서')
    })

    test('payload에서 정보 추출', () => {
      const raw: SmartSearchDocumentResponse = {
        upload: {},
        payload: {
          originalName: 'from-payload.pdf',
          dest_path: '/data/payload/path.pdf',
          mime: 'application/pdf',
          size_bytes: 2048
        },
        meta: {}
      }

      const result = buildSelectedDocument('doc-789', raw)

      expect(result.upload.originalName).toBe('from-payload.pdf')
      expect(result.payload?.originalName).toBe('from-payload.pdf')
      expect(result.payload?.destPath).toBe('/data/payload/path.pdf')
      expect(result.payload?.mime).toBe('application/pdf')
      expect(result.payload?.sizeBytes).toBe(2048)
    })

    test('upload과 payload 모두 있으면 upload 우선', () => {
      const raw: SmartSearchDocumentResponse = {
        upload: {
          originalName: 'upload-name.pdf',
          destPath: '/upload/path.pdf'
        },
        payload: {
          originalName: 'payload-name.pdf',
          dest_path: '/payload/path.pdf'
        },
        meta: {}
      }

      const result = buildSelectedDocument('doc-mixed', raw)

      expect(result.upload.originalName).toBe('upload-name.pdf')
      expect(result.upload.destPath).toBe('/upload/path.pdf')
    })

    test('OCR 데이터 포함', () => {
      const raw: SmartSearchDocumentResponse = {
        upload: { originalName: 'test.pdf' },
        meta: {},
        ocr: { text: 'OCR extracted text', confidence: 0.95 }
      }

      const result = buildSelectedDocument('doc-ocr', raw)

      expect(result.ocr).toEqual({ text: 'OCR extracted text', confidence: 0.95 })
    })

    test('fileUrl이 없는 경우 (destPath 없음)', () => {
      const raw: SmartSearchDocumentResponse = {
        upload: { originalName: 'no-path.pdf' },
        meta: {}
      }

      const result = buildSelectedDocument('doc-no-path', raw)

      expect(result.fileUrl).toBeUndefined()
    })
  })
})
