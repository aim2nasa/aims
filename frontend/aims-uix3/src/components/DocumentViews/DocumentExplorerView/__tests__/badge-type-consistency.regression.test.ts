/**
 * badgeType 계산 통일 — Regression 테스트
 *
 * @description 고객별 문서함(explorer)과 전체 문서 보기(library)에서
 *   동일 문서의 badge가 다르게 표시되는 버그를 방지합니다.
 *
 * @regression
 *   - 이미지(JPG) + OCR 완료 + meta.full_text 존재 → 백엔드가 TXT로 계산 (정상: OCR)
 *   - 백엔드의 _hasMetaText 우선 로직이 ocr.status='done'보다 먼저 적용되어 오판
 *   - 해결: 백엔드에서 badgeType 계산 제거, 프론트엔드 DocumentUtils.getDocumentType()으로 통일
 */

import { describe, it, expect } from 'vitest'

// DocumentUtils.getDocumentType()을 직접 import하여 실제 로직 검증
import { DocumentUtils } from '@/entities/document'

describe('badgeType 계산 통일 — regression', () => {

  describe('이미지 파일 + OCR 완료 시 OCR 판정', () => {
    it('JPG + ocr.status=done + meta.full_text 있음 → OCR (이전 버그: TXT)', () => {
      // 이전 백엔드 로직: _hasMetaText=true → TXT (잘못됨)
      // 정상: ocr.status='done' → OCR
      const doc = {
        mimeType: 'image/jpeg',
        ocr: { status: 'done', confidence: 0.95 },
        meta: { full_text: 'OCR로 추출된 텍스트' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })

    it('PNG + ocr.status=done → OCR', () => {
      const doc = {
        mimeType: 'image/png',
        ocr: { status: 'done' },
        meta: { full_text: '이미지에서 추출한 텍스트' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })

    it('TIFF + ocr.status=done → OCR', () => {
      const doc = {
        mimeType: 'image/tiff',
        ocr: { status: 'done' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })
  })

  describe('PDF 파일 badge 판정', () => {
    it('PDF + ocr.status=done → OCR', () => {
      const doc = {
        mimeType: 'application/pdf',
        ocr: { status: 'done', confidence: 0.88 },
        meta: { full_text: 'PDF에서 추출된 텍스트' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })

    it('PDF + ocr 없음 + meta.full_text 있음 → TXT', () => {
      const doc = {
        mimeType: 'application/pdf',
        meta: { full_text: '텍스트 기반 PDF' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('txt')
    })

    it('PDF + ocr 없음 + docembed.text_source=meta → TXT', () => {
      const doc = {
        mimeType: 'application/pdf',
        docembed: { text_source: 'meta' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('txt')
    })

    it('PDF + ocr 없음 + docembed.text_source=ocr → OCR', () => {
      const doc = {
        mimeType: 'application/pdf',
        docembed: { text_source: 'ocr' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })

    it('PDF + 텍스트 없음 → BIN', () => {
      const doc = {
        mimeType: 'application/pdf',
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('bin')
    })
  })

  describe('바이너리 파일 판정', () => {
    it('ZIP → BIN', () => {
      const doc = { mimeType: 'application/zip' }
      expect(DocumentUtils.getDocumentType(doc)).toBe('bin')
    })

    it('RAR → BIN', () => {
      const doc = { mimeType: 'application/x-rar' }
      expect(DocumentUtils.getDocumentType(doc)).toBe('bin')
    })

    it('오디오 → BIN', () => {
      const doc = { mimeType: 'audio/mp3' }
      expect(DocumentUtils.getDocumentType(doc)).toBe('bin')
    })

    it('비디오 → BIN', () => {
      const doc = { mimeType: 'video/mp4' }
      expect(DocumentUtils.getDocumentType(doc)).toBe('bin')
    })
  })

  describe('백엔드 badgeType 필드 무시 검증', () => {
    it('badgeType 필드가 있어도 무시하고 ocr.status 기반 판정', () => {
      // 백엔드에서 잘못 계산한 badgeType='TXT'가 있더라도
      // getDocumentType()은 ocr.status='done'을 우선해야 함
      const doc = {
        badgeType: 'TXT',
        mimeType: 'image/jpeg',
        ocr: { status: 'done' },
        meta: { full_text: '텍스트' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })

    it('badgeType=BIN이어도 ocr.status=done이면 OCR', () => {
      const doc = {
        badgeType: 'BIN',
        ocr: { status: 'done' },
      }
      expect(DocumentUtils.getDocumentType(doc)).toBe('ocr')
    })

    it('badgeType=OCR이어도 실제 OCR 없으면 다른 판정', () => {
      const doc = {
        badgeType: 'OCR',
        meta: { full_text: '텍스트만 있는 문서' },
      }
      // badgeType 무시, meta.full_text 기반으로 TXT
      expect(DocumentUtils.getDocumentType(doc)).toBe('txt')
    })
  })

  describe('null/undefined 안전성', () => {
    it('null → bin', () => {
      expect(DocumentUtils.getDocumentType(null)).toBe('bin')
    })

    it('undefined → bin', () => {
      expect(DocumentUtils.getDocumentType(undefined)).toBe('bin')
    })

    it('빈 객체 → bin', () => {
      expect(DocumentUtils.getDocumentType({})).toBe('bin')
    })
  })

  describe('getDocumentTypeLabel 일관성', () => {
    it('OCR 문서 → "OCR"', () => {
      const doc = { ocr: { status: 'done' } }
      expect(DocumentUtils.getDocumentTypeLabel(doc)).toBe('OCR')
    })

    it('TXT 문서 → "TXT"', () => {
      const doc = { meta: { full_text: '텍스트' } }
      expect(DocumentUtils.getDocumentTypeLabel(doc)).toBe('TXT')
    })

    it('BIN 문서 → "BIN"', () => {
      expect(DocumentUtils.getDocumentTypeLabel({})).toBe('BIN')
    })
  })
})
