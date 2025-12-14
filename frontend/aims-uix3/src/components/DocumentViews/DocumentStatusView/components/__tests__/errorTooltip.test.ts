/**
 * 에러 툴팁 유틸리티 함수 테스트
 *
 * @since 2025-12-14
 * @commit 5087f521 - 문서 상태 오류 시 에러 원인 툴팁 표시
 *
 * 이 테스트는 다음을 검증합니다:
 * 1. ERROR_CODE_LABELS 상수가 모든 에러 코드에 매핑 존재
 * 2. formatErrorMessage() 함수가 올바르게 메시지 정리
 * 3. getErrorMessage() 함수가 문서에서 에러 메시지 추출
 */

import { describe, it, expect } from 'vitest'
import {
  ERROR_CODE_LABELS,
  formatErrorMessage,
  getErrorMessage,
} from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

// ============================================
// 테스트 데이터
// ============================================

const createMockDocument = (overrides?: Partial<Document>): Document => ({
  _id: 'test-doc-1',
  originalName: 'test.pdf',
  uploaded_at: '2025-01-01T00:00:00.000Z',
  fileSize: 1024,
  mimeType: 'application/pdf',
  overallStatus: 'completed',
  progress: 100,
  ...overrides,
})

// ============================================
// 1. ERROR_CODE_LABELS 상수 테스트
// ============================================

describe('[회귀] ERROR_CODE_LABELS 상수 검증 (commit 5087f521)', () => {
  it('OPENAI_QUOTA_EXCEEDED 에러 코드가 매핑되어 있어야 함', () => {
    expect(ERROR_CODE_LABELS['OPENAI_QUOTA_EXCEEDED']).toBeDefined()
    expect(ERROR_CODE_LABELS['OPENAI_QUOTA_EXCEEDED']).toContain('OpenAI')
    expect(ERROR_CODE_LABELS['OPENAI_QUOTA_EXCEEDED']).toContain('크레딧')
  })

  it('UNKNOWN 에러 코드가 매핑되어 있어야 함', () => {
    expect(ERROR_CODE_LABELS['UNKNOWN']).toBeDefined()
    expect(ERROR_CODE_LABELS['UNKNOWN']).toBe('알 수 없는 오류')
  })

  it('TIMEOUT 에러 코드가 매핑되어 있어야 함', () => {
    expect(ERROR_CODE_LABELS['TIMEOUT']).toBeDefined()
    expect(ERROR_CODE_LABELS['TIMEOUT']).toBe('처리 시간 초과')
  })

  it('CONNECTION_ERROR 에러 코드가 매핑되어 있어야 함', () => {
    expect(ERROR_CODE_LABELS['CONNECTION_ERROR']).toBeDefined()
    expect(ERROR_CODE_LABELS['CONNECTION_ERROR']).toBe('서버 연결 오류')
  })

  it('RATE_LIMIT 에러 코드가 매핑되어 있어야 함', () => {
    expect(ERROR_CODE_LABELS['RATE_LIMIT']).toBeDefined()
    expect(ERROR_CODE_LABELS['RATE_LIMIT']).toBe('API 요청 한도 초과')
  })

  it('모든 레이블이 빈 문자열이 아니어야 함', () => {
    Object.entries(ERROR_CODE_LABELS).forEach(([code, label]) => {
      expect(label.length).toBeGreaterThan(0)
    })
  })
})

// ============================================
// 2. formatErrorMessage() 함수 테스트
// ============================================

describe('[회귀] formatErrorMessage 함수 (commit 5087f521)', () => {
  describe('URL 제거', () => {
    it('HTTP URL이 제거되어야 함', () => {
      const message = 'Error at http://example.com/api/test'
      const result = formatErrorMessage(message)
      expect(result).not.toContain('http://')
      expect(result).not.toContain('example.com')
    })

    it('HTTPS URL이 제거되어야 함', () => {
      const message = 'Error at https://api.openai.com/v1/embeddings'
      const result = formatErrorMessage(message)
      expect(result).not.toContain('https://')
      expect(result).not.toContain('openai.com')
    })
  })

  describe('Qdrant 유효성 검사 오류 처리', () => {
    it('"6 validation errors for..."를 Qdrant 저장 오류로 변환', () => {
      const message = '6 validation errors for Qdrant document'
      const result = formatErrorMessage(message)
      expect(result).toContain('Qdrant 저장 오류')
      expect(result).toContain('6개')
    })

    it('"1 validation error for..."를 Qdrant 저장 오류로 변환', () => {
      const message = '1 validation error for Qdrant document'
      const result = formatErrorMessage(message)
      expect(result).toContain('Qdrant 저장 오류')
      expect(result).toContain('1개')
    })
  })

  describe('OpenAI 크레딧 소진 감지', () => {
    it('insufficient_quota 패턴 감지', () => {
      const message = 'Error: insufficient_quota - You have exceeded your quota'
      const result = formatErrorMessage(message)
      expect(result).toContain('OpenAI 크레딧 소진')
    })

    it('exceeded your current quota 패턴 감지', () => {
      const message = 'You exceeded your current quota, please check your plan'
      const result = formatErrorMessage(message)
      expect(result).toContain('OpenAI 크레딧 소진')
    })
  })

  describe('긴 메시지 자르기', () => {
    it('60자 이상은 첫 문장만 추출', () => {
      const message = 'This is a very long error message that exceeds sixty characters. It should be truncated.'
      const result = formatErrorMessage(message)
      expect(result.length).toBeLessThanOrEqual(63) // 60 + '...'
    })

    it('60자 이하는 그대로 유지', () => {
      const message = 'Short error message.'
      const result = formatErrorMessage(message)
      expect(result).toBe('Short error message.')
    })
  })

  describe('빈 입력 처리', () => {
    it('빈 문자열은 "처리 오류" 반환', () => {
      const result = formatErrorMessage('')
      expect(result).toBe('처리 오류')
    })

    it('공백만 있는 경우도 "처리 오류" 반환', () => {
      const result = formatErrorMessage('   ')
      expect(result).toBe('처리 오류')
    })
  })
})

// ============================================
// 3. getErrorMessage() 함수 테스트
// ============================================

describe('[회귀] getErrorMessage 함수 (commit 5087f521)', () => {
  describe('정상 문서 처리', () => {
    it('에러 없는 문서는 null 반환', () => {
      const doc = createMockDocument()
      const result = getErrorMessage(doc)
      expect(result).toBeNull()
    })
  })

  describe('docembed 에러 처리', () => {
    it('error_code가 있으면 해당 라벨 반환', () => {
      const doc = createMockDocument({
        docembed: {
          error_code: 'OPENAI_QUOTA_EXCEEDED',
          error_message: 'Some error message',
        } as any,
      })
      const result = getErrorMessage(doc)
      expect(result).toContain('OpenAI 크레딧 소진')
    })

    it('error_message만 있으면 포맷된 메시지 반환', () => {
      const doc = createMockDocument({
        docembed: {
          error_message: 'Connection failed at http://example.com',
        } as any,
      })
      const result = getErrorMessage(doc)
      expect(result).not.toContain('http://')
      expect(result).toBe('Connection failed at')
    })

    it('알 수 없는 error_code는 코드 자체를 반환', () => {
      const doc = createMockDocument({
        docembed: {
          error_code: 'CUSTOM_ERROR_CODE',
        } as any,
      })
      const result = getErrorMessage(doc)
      expect(result).toBe('CUSTOM_ERROR_CODE')
    })
  })

  describe('stages.docembed 에러 처리', () => {
    it('stages.docembed의 error_code 처리', () => {
      const doc = createMockDocument({
        stages: {
          docembed: {
            error_code: 'TIMEOUT',
            status: 'error',
          } as any,
        },
      })
      const result = getErrorMessage(doc)
      expect(result).toBe('처리 시간 초과')
    })

    it('stages.docembed의 error_message 처리', () => {
      const doc = createMockDocument({
        stages: {
          docembed: {
            error_message: 'Database connection lost',
            status: 'error',
          } as any,
        },
      })
      const result = getErrorMessage(doc)
      expect(result).toBe('Database connection lost')
    })
  })

  describe('OCR 에러 처리', () => {
    it('ocr.status가 error면 ocr.message 반환', () => {
      const doc = createMockDocument({
        ocr: {
          status: 'error',
          message: 'OCR processing failed due to image quality',
        } as any,
      })
      const result = getErrorMessage(doc)
      expect(result).toContain('OCR processing failed')
    })

    it('stages.ocr 에러 처리', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            status: 'error',
            message: 'Text extraction failed',
          } as any,
        },
      })
      const result = getErrorMessage(doc)
      expect(result).toContain('Text extraction failed')
    })
  })

  describe('meta 에러 처리', () => {
    it('meta.meta_status가 error면 meta.message 반환', () => {
      const doc = createMockDocument({
        meta: {
          meta_status: 'error',
          message: 'Metadata extraction failed',
        } as any,
      })
      const result = getErrorMessage(doc)
      expect(result).toContain('Metadata extraction failed')
    })
  })

  describe('에러 우선순위', () => {
    it('docembed 에러가 stages.docembed보다 우선', () => {
      const doc = createMockDocument({
        docembed: {
          error_code: 'OPENAI_QUOTA_EXCEEDED',
        } as any,
        stages: {
          docembed: {
            error_code: 'TIMEOUT',
          } as any,
        },
      })
      const result = getErrorMessage(doc)
      expect(result).toContain('OpenAI 크레딧 소진')
      expect(result).not.toContain('처리 시간 초과')
    })
  })
})
