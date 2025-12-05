/**
 * Phase 1.1 테스트: documentAdapters.ts
 *
 * 테스트 대상:
 * - adaptToDownloadHelper
 * - convertToPreviewDocumentInfo
 */

import { adaptToDownloadHelper, convertToPreviewDocumentInfo } from '../documentAdapters'
import type { SelectedDocument } from '../documentTransformers'

describe('documentAdapters', () => {
  describe('adaptToDownloadHelper', () => {
    test('기본 변환', () => {
      const doc: SelectedDocument = {
        _id: 'doc-123',
        fileUrl: 'https://example.com/file.pdf',
        upload: {
          originalName: 'document.pdf',
          destPath: '/path/to/file.pdf'
        },
        meta: {}
      }

      const result = adaptToDownloadHelper(doc)

      expect(result._id).toBe('doc-123')
      expect(result.fileUrl).toBe('https://example.com/file.pdf')
      expect(result.upload.originalName).toBe('document.pdf')
      expect(result.upload.destPath).toBe('/path/to/file.pdf')
    })

    test('payload 정보 포함', () => {
      const doc: SelectedDocument = {
        _id: 'doc-456',
        upload: { originalName: 'test.pdf' },
        payload: {
          originalName: 'payload-name.pdf',
          destPath: '/payload/path.pdf'
        },
        meta: {}
      }

      const result = adaptToDownloadHelper(doc)

      expect(result.payload.original_name).toBe('payload-name.pdf')
      expect(result.payload.dest_path).toBe('/payload/path.pdf')
    })

    test('fileUrl이 없으면 빈 문자열', () => {
      const doc: SelectedDocument = {
        _id: 'doc-789',
        upload: { originalName: 'test.pdf' },
        meta: {}
      }

      const result = adaptToDownloadHelper(doc)

      expect(result.fileUrl).toBe('')
    })

    test('upload 정보가 없으면 빈 문자열로 대체', () => {
      const doc: SelectedDocument = {
        _id: 'doc-empty',
        upload: { originalName: 'test.pdf' },  // destPath 없음
        meta: {}
      }

      const result = adaptToDownloadHelper(doc)

      expect(result.upload.destPath).toBe('')
    })
  })

  describe('convertToPreviewDocumentInfo', () => {
    test('기본 변환', () => {
      const doc: SelectedDocument = {
        _id: 'doc-preview',
        fileUrl: 'https://example.com/preview.pdf',
        upload: {
          originalName: 'preview-doc.pdf',
          uploadedAt: '2024-01-01T00:00:00Z'
        },
        meta: {
          mime: 'application/pdf',
          sizeBytes: 4096
        }
      }

      const result = convertToPreviewDocumentInfo(doc)

      expect(result.id).toBe('doc-preview')
      expect(result.originalName).toBe('preview-doc.pdf')
      expect(result.fileUrl).toBe('https://example.com/preview.pdf')
      expect(result.mimeType).toBe('application/pdf')
      expect(result.uploadedAt).toBe('2024-01-01T00:00:00Z')
      expect(result.sizeBytes).toBe(4096)
    })

    test('fileUrl이 없으면 null', () => {
      const doc: SelectedDocument = {
        _id: 'doc-no-url',
        upload: { originalName: 'test.pdf' },
        meta: {}
      }

      const result = convertToPreviewDocumentInfo(doc)

      expect(result.fileUrl).toBeNull()
    })

    test('originalName 우선순위: upload > payload > meta > 기본값', () => {
      // upload에서 가져옴
      const doc1: SelectedDocument = {
        _id: 'doc1',
        upload: { originalName: 'from-upload.pdf' },
        payload: { originalName: 'from-payload.pdf' },
        meta: { originalName: 'from-meta.pdf' }
      }
      expect(convertToPreviewDocumentInfo(doc1).originalName).toBe('from-upload.pdf')

      // payload에서 가져옴
      const doc2: SelectedDocument = {
        _id: 'doc2',
        upload: { originalName: '' },
        payload: { originalName: 'from-payload.pdf' },
        meta: { originalName: 'from-meta.pdf' }
      }
      expect(convertToPreviewDocumentInfo(doc2).originalName).toBe('from-payload.pdf')

      // 기본값 사용
      const doc3: SelectedDocument = {
        _id: 'doc3',
        upload: { originalName: '' },
        meta: {}
      }
      expect(convertToPreviewDocumentInfo(doc3).originalName).toBe('문서')
    })

    test('mimeType 우선순위: meta > payload', () => {
      const doc1: SelectedDocument = {
        _id: 'doc1',
        upload: { originalName: 'test.pdf' },
        meta: { mime: 'application/pdf' },
        payload: { mime: 'text/plain' }
      }
      expect(convertToPreviewDocumentInfo(doc1).mimeType).toBe('application/pdf')

      const doc2: SelectedDocument = {
        _id: 'doc2',
        upload: { originalName: 'test.pdf' },
        meta: {},
        payload: { mime: 'text/plain' }
      }
      expect(convertToPreviewDocumentInfo(doc2).mimeType).toBe('text/plain')
    })

    test('sizeBytes가 없으면 결과에 포함되지 않음 (undefined)', () => {
      const doc: SelectedDocument = {
        _id: 'doc-no-size',
        upload: { originalName: 'test.pdf' },
        meta: {}
      }

      const result = convertToPreviewDocumentInfo(doc)

      // sizeBytes가 없으면 result에 포함되지 않음 (undefined)
      expect(result.sizeBytes).toBeUndefined()
    })

    test('document와 rawDetail 필드 포함', () => {
      const doc: SelectedDocument = {
        _id: 'doc-detail',
        upload: { originalName: 'test.pdf' },
        meta: {}
      }

      const result = convertToPreviewDocumentInfo(doc)

      expect(result.document).toBeDefined()
      expect(result.rawDetail).toBeDefined()
    })
  })
})
