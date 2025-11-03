/**
 * DocumentUtils.getDocumentType - Unit Tests
 * @since 1.0.0
 *
 * 문서 타입 판별 로직 단위 테스트
 * commit a0c1a96: TXT 뱃지 시스템 추가
 *
 * 테스트 범위:
 * - OCR 기반 문서 판별
 * - TXT 기반 문서 판별
 * - stages 기반 타입 판별 (문서 라이브러리 API)
 * - null 반환 조건
 */

import { describe, it, expect } from 'vitest'
import { DocumentUtils } from '../model'

describe('DocumentUtils.getDocumentType - Unit Tests (commit a0c1a96)', () => {
  describe('OCR 기반 문서 판별', () => {
    it('ocr.status가 "done"이면 OCR 타입으로 판별되어야 함', () => {
      // Given
      const document = {
        ocr: {
          status: 'done',
          full_text: 'OCR로 추출한 텍스트'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('ocr')
    })

    it('stages.ocr.status가 "completed"이면 OCR 타입으로 판별되어야 함', () => {
      // Given: 문서 라이브러리 API 응답 구조
      const document = {
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료',
            timestamp: '2025-01-01T00:00:00Z'
          }
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('ocr')
    })

    it('docembed.text_source가 "ocr"이면 OCR 타입으로 판별되어야 함', () => {
      // Given
      const document = {
        docembed: {
          status: 'done',
          text_source: 'ocr'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('ocr')
    })

    it('ocr.status가 "done"이 아니면 OCR로 판별되지 않아야 함', () => {
      // Given
      const document = {
        ocr: {
          status: 'processing', // 처리 중
          full_text: ''
        },
        meta: {
          full_text: '텍스트'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then: OCR이 아니라 TXT로 판별되어야 함
      expect(result).toBe('txt')
    })
  })

  describe('TXT 기반 문서 판별', () => {
    it('meta.full_text가 있으면 TXT 타입으로 판별되어야 함', () => {
      // Given
      const document = {
        meta: {
          full_text: 'PDF에서 직접 추출한 텍스트',
          mime: 'application/pdf'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('txt')
    })

    it('stages.meta.full_text가 있으면 TXT 타입으로 판별되어야 함', () => {
      // Given: 문서 라이브러리 API 응답 구조
      const document = {
        stages: {
          meta: {
            name: 'Meta 처리',
            status: 'completed',
            full_text: 'PDF에서 직접 추출한 텍스트',
            timestamp: '2025-01-01T00:00:00Z'
          }
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('txt')
    })

    it('docembed.text_source가 "meta"이면 TXT 타입으로 판별되어야 함', () => {
      // Given
      const document = {
        docembed: {
          status: 'done',
          text_source: 'meta'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('txt')
    })

    it('meta.full_text가 빈 문자열이면 TXT로 판별되지 않아야 함', () => {
      // Given
      const document = {
        meta: {
          full_text: '', // 빈 문자열
          mime: 'application/pdf'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBeNull()
    })
  })

  describe('우선순위 테스트', () => {
    it('OCR과 TXT가 모두 있으면 OCR이 우선순위가 높아야 함', () => {
      // Given: OCR과 TXT 둘 다 있는 경우
      const document = {
        ocr: {
          status: 'done',
          full_text: 'OCR 텍스트'
        },
        meta: {
          full_text: 'Meta 텍스트'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then: OCR이 우선
      expect(result).toBe('ocr')
    })

    it('stages.ocr completed와 stages.meta full_text가 모두 있으면 OCR 우선', () => {
      // Given
      const document = {
        stages: {
          ocr: {
            status: 'completed',
            message: 'OCR 완료'
          },
          meta: {
            status: 'completed',
            full_text: 'Meta 텍스트'
          }
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('ocr')
    })

    it('docembed.text_source가 meta이고 stages.ocr이 미완료면 TXT', () => {
      // Given: OCR은 미완료, docembed는 meta 소스
      const document = {
        stages: {
          ocr: {
            status: 'pending' // 미완료
          }
        },
        docembed: {
          text_source: 'meta',
          status: 'done'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBe('txt')
    })
  })

  describe('null 반환 조건', () => {
    it('document가 null이면 null을 반환해야 함', () => {
      // When
      const result = DocumentUtils.getDocumentType(null)

      // Then
      expect(result).toBeNull()
    })

    it('document가 undefined이면 null을 반환해야 함', () => {
      // When
      const result = DocumentUtils.getDocumentType(undefined)

      // Then
      expect(result).toBeNull()
    })

    it('OCR도 TXT도 없으면 null을 반환해야 함', () => {
      // Given: OCR과 TXT 정보가 없는 문서
      const document = {
        _id: 'test-doc',
        filename: 'test.pdf',
        uploadedAt: '2025-01-01T00:00:00Z'
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBeNull()
    })

    it('ocr이 있지만 status가 done이 아니고 meta도 없으면 null', () => {
      // Given
      const document = {
        ocr: {
          status: 'processing', // 처리 중
          full_text: ''
        }
        // meta 없음
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBeNull()
    })
  })

  describe('엣지 케이스', () => {
    it('ocr이 객체가 아니면 무시되어야 함', () => {
      // Given
      const document = {
        ocr: 'not-an-object', // 문자열
        meta: {
          full_text: 'Meta 텍스트'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then: ocr 무시되고 meta 기반으로 판별
      expect(result).toBe('txt')
    })

    it('stages가 객체가 아니면 무시되어야 함', () => {
      // Given
      const document = {
        stages: 'not-an-object', // 문자열
        meta: {
          full_text: 'Meta 텍스트'
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then: stages 무시되고 meta 기반으로 판별
      expect(result).toBe('txt')
    })

    it('meta.full_text가 숫자 0이면 TXT로 판별되지 않아야 함', () => {
      // Given
      const document = {
        meta: {
          full_text: 0 // falsy 값
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then
      expect(result).toBeNull()
    })
  })

  describe('실제 API 응답 구조 테스트', () => {
    it('문서 검색 API 응답 구조 (ocr 필드)', () => {
      // Given: AI 검색 API 응답
      const searchResultItem = {
        _id: '12345',
        filename: 'test.pdf',
        ocr: {
          status: 'done',
          full_text: 'OCR 텍스트',
          confidence: 0.95
        },
        score: 0.85
      }

      // When
      const result = DocumentUtils.getDocumentType(searchResultItem)

      // Then
      expect(result).toBe('ocr')
    })

    it('문서 라이브러리 API 응답 구조 (stages 필드)', () => {
      // Given: 문서 라이브러리 API 응답
      const libraryDocument = {
        _id: '12345',
        originalName: 'test.pdf',
        stages: {
          upload: {
            status: 'completed',
            originalName: 'test.pdf'
          },
          meta: {
            status: 'completed',
            full_text: 'PDF 텍스트',
            mime: 'application/pdf'
          },
          ocr: {
            status: 'pending' // OCR 대기 중
          }
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(libraryDocument)

      // Then: OCR이 완료되지 않았으므로 TXT
      expect(result).toBe('txt')
    })

    it('문서 라이브러리 API - OCR 완료 + TXT 동시 존재', () => {
      // Given
      const document = {
        _id: '12345',
        originalName: 'test.pdf',
        stages: {
          meta: {
            status: 'completed',
            full_text: 'PDF 텍스트'
          },
          ocr: {
            status: 'completed', // OCR 완료
            message: 'OCR 완료 (신뢰도: 0.95)'
          }
        }
      }

      // When
      const result = DocumentUtils.getDocumentType(document)

      // Then: OCR 우선
      expect(result).toBe('ocr')
    })
  })
})
