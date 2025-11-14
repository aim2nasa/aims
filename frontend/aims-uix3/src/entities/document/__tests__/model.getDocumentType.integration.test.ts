/**
 * getDocumentType Integration Tests
 * 실제 API 응답 구조로 테스트
 */

import { describe, it, expect } from 'vitest'
import { DocumentUtils } from '../model'

describe('getDocumentType - Integration Tests with Real API Response', () => {
  describe('AI 파일 (.ai) - BIN 뱃지', () => {
    it('application/postscript MIME 타입의 .ai 파일은 BIN으로 분류되어야 함', () => {
      const aiDocument = {
        _id: '691763ac44f6eb919ecd493f',
        originalName: '캐치업포멧.ai',
        mimeType: 'application/postscript',
        meta: {
          filename: '251114171524_7wotfiu2.ai',
          extension: '.ai',
          mime: 'application/postscript',
          full_text: null
        },
        overallStatus: 'processing',
        progress: 60
      }

      const result = DocumentUtils.getDocumentType(aiDocument)
      expect(result).toBe('bin')
    })
  })

  describe('TXT 문서 (텍스트 PDF) - TXT 뱃지', () => {
    it('meta.full_text가 있는 PDF는 TXT로 분류되어야 함', () => {
      const txtDocument = {
        _id: '6917460444f6eb919ecd493a',
        originalName: '(완료)등기부등본_(주)캐치업코리아_250326.pdf',
        mimeType: 'application/pdf',
        meta: {
          filename: '251114150852_sxaj42oh.pdf',
          extension: '.pdf',
          mime: 'application/pdf',
          full_text: '\n\n열 람 용\n등기사항전부증명서(현재 유효사항)...',
          pdf_text_ratio: '{"total_pages":2,"text_pages":2,"text_ratio":100}'
        },
        docembed: {
          status: 'done',
          dims: 1536,
          chunks: 2,
          text_source: 'meta'
        },
        overallStatus: 'completed',
        progress: 100
      }

      const result = DocumentUtils.getDocumentType(txtDocument)
      expect(result).toBe('txt')
    })

    it('docembed.text_source가 "meta"인 문서는 TXT로 분류되어야 함', () => {
      const txtDocument = {
        _id: 'test-txt-doc',
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        meta: {
          full_text: null  // full_text가 null이어도
        },
        docembed: {
          text_source: 'meta'  // text_source가 meta면 TXT
        }
      }

      const result = DocumentUtils.getDocumentType(txtDocument)
      expect(result).toBe('txt')
    })
  })

  describe('OCR 문서 (스캔 PDF) - OCR 뱃지', () => {
    it('ocr.status가 done인 문서는 OCR로 분류되어야 함', () => {
      const ocrDocument = {
        _id: 'test-ocr-doc',
        originalName: '계약내용변경신청서.pdf',
        mimeType: 'application/pdf',
        meta: {
          full_text: null
        },
        ocr: {
          status: 'done',
          confidence: '0.9852'
        },
        docembed: {
          text_source: 'ocr'
        }
      }

      const result = DocumentUtils.getDocumentType(ocrDocument)
      expect(result).toBe('ocr')
    })

    it('docembed.text_source가 "ocr"인 문서는 OCR로 분류되어야 함', () => {
      const ocrDocument = {
        _id: 'test-ocr-doc-2',
        originalName: 'scanned.pdf',
        mimeType: 'application/pdf',
        meta: {
          full_text: null
        },
        docembed: {
          text_source: 'ocr'
        }
      }

      const result = DocumentUtils.getDocumentType(ocrDocument)
      expect(result).toBe('ocr')
    })
  })

  describe('ZIP 파일 - BIN 뱃지', () => {
    it('application/zip MIME 타입은 BIN으로 분류되어야 함', () => {
      const zipDocument = {
        _id: 'test-zip-doc',
        originalName: '2018컨설팅자료.zip',
        mimeType: 'application/zip',
        meta: {
          full_text: null
        },
        overallStatus: 'processing',
        progress: 60
      }

      const result = DocumentUtils.getDocumentType(zipDocument)
      expect(result).toBe('bin')
    })

    it('application/x-zip-compressed MIME 타입은 BIN으로 분류되어야 함', () => {
      const zipDocument = {
        _id: 'test-zip-doc-2',
        originalName: 'archive.zip',
        mimeType: 'application/x-zip-compressed',
        meta: {}
      }

      const result = DocumentUtils.getDocumentType(zipDocument)
      expect(result).toBe('bin')
    })

    it('application/x-rar MIME 타입은 BIN으로 분류되어야 함', () => {
      const rarDocument = {
        _id: 'test-rar-doc',
        originalName: 'archive.rar',
        mimeType: 'application/x-rar',
        meta: {}
      }

      const result = DocumentUtils.getDocumentType(rarDocument)
      expect(result).toBe('bin')
    })
  })

  describe('오디오/비디오 파일 - BIN 뱃지', () => {
    it('audio/* MIME 타입은 BIN으로 분류되어야 함', () => {
      const audioDocument = {
        _id: 'test-audio-doc',
        originalName: 'recording.mp3',
        mimeType: 'audio/mpeg',
        meta: {}
      }

      const result = DocumentUtils.getDocumentType(audioDocument)
      expect(result).toBe('bin')
    })

    it('video/* MIME 타입은 BIN으로 분류되어야 함', () => {
      const videoDocument = {
        _id: 'test-video-doc',
        originalName: 'presentation.mp4',
        mimeType: 'video/mp4',
        meta: {}
      }

      const result = DocumentUtils.getDocumentType(videoDocument)
      expect(result).toBe('bin')
    })
  })

  describe('Fallback - BIN 뱃지', () => {
    it('meta, ocr, docembed 모두 없으면 BIN으로 분류되어야 함', () => {
      const unknownDocument = {
        _id: 'test-unknown-doc',
        originalName: 'unknown.xyz',
        mimeType: 'application/octet-stream'
      }

      const result = DocumentUtils.getDocumentType(unknownDocument)
      expect(result).toBe('bin')
    })

    it('meta.full_text도 없고 ocr도 없으면 BIN으로 분류되어야 함', () => {
      const emptyDocument = {
        _id: 'test-empty-doc',
        originalName: 'empty.pdf',
        mimeType: 'application/pdf',
        meta: {
          full_text: null
        }
      }

      const result = DocumentUtils.getDocumentType(emptyDocument)
      expect(result).toBe('bin')
    })
  })
})
