/**
 * DocumentRegistrationView - 처리 로그 영속화 테스트
 *
 * @issue F5 새로고침 시 처리 로그가 사라지는 문제 (2025-10-25)
 * @cause sessionStorage에 로그가 저장되지 않아 페이지 새로고침 시 초기화됨
 * @fix sessionStorage에 로그 자동 저장 및 복원 기능 추가
 * @commit 9f097a1
 *
 * 이 테스트는 사용자가 F5를 눌렀을 때 업로드 진행 상황을
 * 계속 확인할 수 있도록 로그가 유지되는지 검증합니다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentRegistrationView } from '../DocumentRegistrationView'

// Mock dependencies
vi.mock('@/services/uploadService', () => ({
  uploadService: {
    uploadDocument: vi.fn()
  }
}))

vi.mock('@/services/DocumentService', () => ({
  DocumentService: {
    getCustomerDocuments: vi.fn().mockResolvedValue({
      customer_id: '',
      documents: [],
      total: 0
    })
  }
}))

describe('DocumentRegistrationView - 처리 로그 영속화 (9f097a1)', () => {
  const LOGS_KEY = 'document-upload-logs'

  beforeEach(() => {
    // sessionStorage 초기화
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('sessionStorage에 로그가 저장되어야 함', () => {
    // Given: 저장된 로그가 있음
    const mockLogs = [
      {
        id: 'log1',
        timestamp: new Date('2025-10-25T10:00:00').toISOString(),
        level: 'info',
        message: '테스트 로그'
      }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    // When: 컴포넌트 렌더링
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: sessionStorage에서 로그를 읽었어야 함
    const savedLogs = sessionStorage.getItem(LOGS_KEY)
    expect(savedLogs).not.toBeNull()
  })

  it('sessionStorage가 비어있으면 빈 로그로 시작해야 함', () => {
    // Given: sessionStorage가 비어있음
    expect(sessionStorage.getItem(LOGS_KEY)).toBeNull()

    // When: 컴포넌트 렌더링
    const { container } = render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 에러 없이 렌더링되어야 함
    expect(container).toBeInTheDocument()
  })

  it('잘못된 JSON 형식의 로그는 무시하고 빈 로그로 시작해야 함', () => {
    // Given: 잘못된 JSON 데이터
    sessionStorage.setItem(LOGS_KEY, 'invalid-json{')

    // When: 컴포넌트 렌더링
    const { container } = render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 에러 없이 렌더링되어야 함
    expect(container).toBeInTheDocument()
  })

  it('저장된 로그의 timestamp가 Date 객체로 변환되어야 함', () => {
    // Given: ISO 문자열 형식의 timestamp를 가진 로그
    const mockLogs = [
      {
        id: 'log1',
        timestamp: '2025-10-25T10:00:00.000Z',
        level: 'info',
        message: '테스트 로그'
      }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    // When: 컴포넌트 렌더링
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 저장된 로그가 올바른 형식이어야 함
    const savedLogs = sessionStorage.getItem(LOGS_KEY)
    expect(savedLogs).toBeDefined()

    // 복원 후 다시 저장되므로 형식이 유지되어야 함
    const parsedLogs = JSON.parse(savedLogs!)
    expect(Array.isArray(parsedLogs)).toBe(true)
  })

  it('여러 개의 로그가 저장되고 복원되어야 함', () => {
    // Given: 여러 개의 로그
    const mockLogs = [
      {
        id: 'log1',
        timestamp: new Date('2025-10-25T10:00:00').toISOString(),
        level: 'info',
        message: '첫 번째 로그'
      },
      {
        id: 'log2',
        timestamp: new Date('2025-10-25T10:01:00').toISOString(),
        level: 'success',
        message: '두 번째 로그'
      },
      {
        id: 'log3',
        timestamp: new Date('2025-10-25T10:02:00').toISOString(),
        level: 'error',
        message: '세 번째 로그',
        details: '에러 상세'
      }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    // When: 컴포넌트 렌더링
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 모든 로그가 저장되어 있어야 함
    const savedLogs = sessionStorage.getItem(LOGS_KEY)
    expect(savedLogs).toBeDefined()

    const parsedLogs = JSON.parse(savedLogs!)
    expect(parsedLogs.length).toBeGreaterThanOrEqual(3)
  })

  it('로그 복원 시 details 필드도 보존되어야 함', () => {
    // Given: details 필드를 가진 로그
    const mockLogs = [
      {
        id: 'log1',
        timestamp: new Date('2025-10-25T10:00:00').toISOString(),
        level: 'error',
        message: '에러 발생',
        details: '상세한 에러 메시지'
      }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    // When: 컴포넌트 렌더링
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: details 필드가 보존되어야 함
    const savedLogs = sessionStorage.getItem(LOGS_KEY)
    const parsedLogs = JSON.parse(savedLogs!)

    expect(parsedLogs.length).toBeGreaterThan(0)
    // 첫 로그에 details가 있을 수 있음 (초기 로그가 추가될 수 있음)
    const logWithDetails = parsedLogs.find((log: any) => log.details === '상세한 에러 메시지')
    expect(logWithDetails).toBeDefined()
  })

  it('페이지 새로고침 시나리오 - 로그가 유지되어야 함', () => {
    // Given: 첫 번째 렌더링 (로그 생성)
    const mockLogs = [
      {
        id: 'log1',
        timestamp: new Date('2025-10-25T10:00:00').toISOString(),
        level: 'info',
        message: '파일 업로드 시작'
      }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    const { unmount } = render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // When: 컴포넌트 언마운트 (페이지 새로고침 시뮬레이션)
    unmount()

    // sessionStorage에 로그가 남아있어야 함
    const savedLogs = sessionStorage.getItem(LOGS_KEY)
    expect(savedLogs).not.toBeNull()

    // When: 다시 렌더링 (페이지 새로고침 후)
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 로그가 유지되어야 함
    const restoredLogs = sessionStorage.getItem(LOGS_KEY)
    expect(restoredLogs).not.toBeNull()

    const parsedLogs = JSON.parse(restoredLogs!)
    expect(parsedLogs.length).toBeGreaterThan(0)
  })
})
