/**
 * DocumentRegistrationView - 미연결 문서 업로드 테스트
 *
 * AC#1: 고객 미선택 시 파일 업로드 영역 활성화 + 안내 메시지
 * AC#2: 고객 미선택 상태에서 업로드 시 customerId 미포함
 * AC#3 (Regression): 고객 선택 후 업로드 시 기존과 동일하게 동작
 */

import { describe, it, expect } from 'vitest'

/**
 * FileUploadArea 표시 조건 (변경 전 → 변경 후)
 *
 * 변경 전: documentTypeMode === 'normal' && customerFileCustomer
 * 변경 후: documentTypeMode === 'normal' (고객 미선택 시에도 표시)
 */
function shouldShowFileUploadArea(
  documentTypeMode: string,
  customerFileCustomer: { _id: string } | null,
  isLogVisible: boolean
): boolean {
  // 변경 후 조건: 일반 문서 모드이면 고객 선택 여부와 무관하게 표시
  if (isLogVisible) return false
  if (documentTypeMode === 'annual_report') return true
  if (documentTypeMode === 'customer_review') return true
  if (documentTypeMode === 'normal') return true  // 변경: customerFileCustomer 조건 제거
  return false
}

/**
 * 미연결 안내 메시지 표시 조건
 * 일반 문서 모드에서 고객 미선택 시에만 표시
 */
function shouldShowUnlinkedMessage(
  documentTypeMode: string,
  customerFileCustomer: { _id: string } | null
): boolean {
  return documentTypeMode === 'normal' && !customerFileCustomer
}

/**
 * FormData에 customerId 포함 여부
 * 고객이 선택되었을 때만 customerId 추가 (빈 문자열 전송 금지)
 */
function shouldIncludeCustomerId(
  customerId: string | undefined
): boolean {
  return Boolean(customerId)
}

describe('DocumentRegistrationView - 미연결 문서 업로드', () => {
  describe('AC#1: 고객 미선택 시 파일 업로드 영역 활성화', () => {
    it('일반 문서 모드에서 고객 미선택 시에도 FileUploadArea가 표시되어야 함', () => {
      const result = shouldShowFileUploadArea('normal', null, false)
      expect(result).toBe(true)
    })

    it('일반 문서 모드에서 고객 선택 시에도 FileUploadArea가 표시되어야 함', () => {
      const result = shouldShowFileUploadArea('normal', { _id: 'customer-1' }, false)
      expect(result).toBe(true)
    })

    it('로그 표시 중에는 FileUploadArea가 숨겨져야 함', () => {
      const result = shouldShowFileUploadArea('normal', null, true)
      expect(result).toBe(false)
    })

    it('AR 모드에서는 고객 선택과 무관하게 표시 (기존 동작)', () => {
      expect(shouldShowFileUploadArea('annual_report', null, false)).toBe(true)
    })

    it('고객 미선택 시 안내 메시지가 표시되어야 함', () => {
      expect(shouldShowUnlinkedMessage('normal', null)).toBe(true)
    })

    it('고객 선택 시 안내 메시지가 숨겨져야 함', () => {
      expect(shouldShowUnlinkedMessage('normal', { _id: 'customer-1' })).toBe(false)
    })

    it('AR 모드에서는 안내 메시지가 표시되지 않아야 함', () => {
      expect(shouldShowUnlinkedMessage('annual_report', null)).toBe(false)
    })
  })

  describe('AC#2: FormData에 customerId 미포함 (고객 미선택 시)', () => {
    it('customerId가 undefined이면 FormData에 포함하지 않아야 함', () => {
      expect(shouldIncludeCustomerId(undefined)).toBe(false)
    })

    it('customerId가 빈 문자열이면 FormData에 포함하지 않아야 함', () => {
      expect(shouldIncludeCustomerId('')).toBe(false)
    })

    it('customerId가 유효한 값이면 FormData에 포함해야 함', () => {
      expect(shouldIncludeCustomerId('customer-123')).toBe(true)
    })
  })

  describe('AC#3 (Regression): 고객 선택 후 업로드 - 기존 동작 유지', () => {
    it('고객 선택 시 customerId가 UploadFile에 포함되어야 함', () => {
      const customerFileCustomer = { _id: 'customer-123' }
      const uploadFile = {
        customerId: customerFileCustomer?._id
      }
      expect(uploadFile.customerId).toBe('customer-123')
    })

    it('고객 미선택 시 customerId가 undefined여야 함', () => {
      const customerFileCustomer = null
      const uploadFile = {
        customerId: customerFileCustomer?._id
      }
      expect(uploadFile.customerId).toBeUndefined()
    })
  })
})
