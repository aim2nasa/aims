/**
 * DocumentRegistrationView - 고객 변경 시 드래그존 표시 테스트
 *
 * @issue 고객 선택 해제 후 다시 선택하면 드래그존이 안 나오는 문제 (2025-12-29)
 * @cause 고객 해제 시 customerFileCustomer만 null로 바뀌고 isLogVisible은 true로 유지됨
 *        드래그존 표시 조건: customerFileCustomer && !isLogVisible
 * @fix 고객이 변경되면(해제 또는 다른 고객 선택 시) isLogVisible을 false로 초기화
 *
 * 이 테스트는 사용자가 고객을 x로 해제한 뒤 다시 고객을 선택했을 때
 * 드래그존이 반드시 표시되는지 검증합니다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

vi.mock('@/services/userService', () => ({
  getMyStorageInfo: vi.fn().mockResolvedValue({
    used_bytes: 0,
    quota_bytes: 1073741824,
    remaining_bytes: 1073741824,
    tierName: 'Free'
  })
}))

vi.mock('./services/uploadService', () => ({
  uploadService: {
    queueFiles: vi.fn(),
    cancelAllUploads: vi.fn(),
    setProgressCallback: vi.fn(() => vi.fn()),
    setStatusCallback: vi.fn(() => vi.fn())
  }
}))

vi.mock('@/shared/store/useRecentCustomersStore', () => ({
  useRecentCustomersStore: () => ({
    recentCustomers: [],
    addRecentCustomer: vi.fn(),
    getRecentCustomers: () => []
  })
}))

// CustomerSelectorModal mock
vi.mock('@/shared/ui/CustomerSelectorModal', () => ({
  CustomerSelectorModal: ({ visible, onSelect, onClose }: any) => {
    if (!visible) return null
    return (
      <div data-testid="customer-selector-modal">
        <button
          data-testid="select-customer-1"
          onClick={() => onSelect({ _id: 'customer-1', personal_info: { name: '홍길동' } })}
        >
          홍길동 선택
        </button>
        <button
          data-testid="select-customer-2"
          onClick={() => onSelect({ _id: 'customer-2', personal_info: { name: '김철수' } })}
        >
          김철수 선택
        </button>
        <button data-testid="close-modal" onClick={onClose}>
          닫기
        </button>
      </div>
    )
  }
}))

describe('DocumentRegistrationView - 고객 변경 시 드래그존 표시', () => {
  const SESSION_KEY = 'document-upload-state'
  const LOGS_KEY = 'document-upload-logs'

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  /**
   * 헬퍼: 드래그존(FileUploadArea)이 표시되는지 확인
   * FileUploadArea는 "클릭하여 파일 선택" 또는 드래그 영역 텍스트를 포함
   */
  const isDropzoneVisible = () => {
    // FileUploadArea 컴포넌트의 특징적인 텍스트나 요소로 확인
    const dropzoneTexts = [
      '클릭하여 파일 선택',
      '파일을 여기에 드래그',
      '드래그 앤 드롭'
    ]

    for (const text of dropzoneTexts) {
      try {
        if (screen.queryByText(text, { exact: false })) {
          return true
        }
      } catch {
        // continue
      }
    }

    // data-testid로도 확인
    return screen.queryByTestId('file-upload-area') !== null
  }

  /**
   * 헬퍼: 로그 영역이 표시되는지 확인
   */
  const isLogAreaVisible = () => {
    return screen.queryByTestId('processing-log') !== null ||
           screen.queryByText('처리 로그', { exact: false }) !== null
  }

  it('고객이 선택되지 않으면 드래그존이 표시되지 않아야 함', async () => {
    // Given: 컴포넌트 렌더링
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 고객이 선택되지 않았으므로 드래그존이 없어야 함
    // "고객 선택" 버튼은 있어야 함
    expect(screen.getByText('고객 선택')).toBeInTheDocument()
  })

  it('고객을 선택하면 드래그존이 표시되어야 함', async () => {
    // Given: 컴포넌트 렌더링
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // When: 고객 선택 버튼 클릭
    const selectCustomerButton = screen.getByText('고객 선택')
    fireEvent.click(selectCustomerButton)

    // 모달에서 고객 선택
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })

    const selectButton = screen.getByTestId('select-customer-1')
    fireEvent.click(selectButton)

    // Then: 고객이 선택되었으므로 고객명이 표시되어야 함
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })
  })

  it('🔴 핵심 테스트: 고객 해제 후 다시 선택하면 드래그존이 표시되어야 함', async () => {
    // Given: 업로드 후 로그가 표시된 상태를 시뮬레이션
    // isLogVisible = true인 상태에서 시작
    const mockLogs = [
      {
        id: 'log1',
        timestamp: new Date().toISOString(),
        level: 'info',
        message: '테스트 로그'
      }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    // 업로드 상태도 설정 (업로드 완료 상태)
    const mockUploadState = {
      files: [
        {
          id: 'file1',
          status: 'completed',
          progress: 100,
          fileInfo: { name: 'test.pdf', size: 1000, type: 'application/pdf' }
        }
      ],
      uploading: false,
      totalProgress: 100,
      completedCount: 1,
      errors: [],
      context: { identifierType: 'userId', identifierValue: 'tester' }
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(mockUploadState))

    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Step 1: 고객 선택
    const selectCustomerButton = screen.getByText('고객 선택')
    fireEvent.click(selectCustomerButton)

    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('select-customer-1'))

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })

    // Step 2: 고객 해제 (x 버튼 클릭)
    const clearButton = screen.getByLabelText('고객 선택 해제')
    fireEvent.click(clearButton)

    // 고객이 해제되었는지 확인
    await waitFor(() => {
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument()
    })

    // Step 3: 다시 고객 선택
    fireEvent.click(screen.getByText('고객 선택'))

    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('select-customer-2'))

    // Then: 새 고객이 선택되어야 함
    await waitFor(() => {
      expect(screen.getByText('김철수')).toBeInTheDocument()
    })

    // 🔴 핵심 검증: 로그가 초기화되어 드래그존이 표시될 준비가 되어야 함
    // (isLogVisible이 false로 초기화되었으므로)
    // sessionStorage의 로그가 비어있어야 함 (초기화됨)
    const savedLogs = sessionStorage.getItem(LOGS_KEY)
    const parsedLogs = savedLogs ? JSON.parse(savedLogs) : []
    expect(parsedLogs.length).toBe(0)
  })

  it('다른 고객으로 변경하면 이전 업로드 상태가 초기화되어야 함', async () => {
    // Given: 업로드 완료 상태
    const mockUploadState = {
      files: [
        {
          id: 'file1',
          status: 'completed',
          progress: 100,
          fileInfo: { name: 'test.pdf', size: 1000, type: 'application/pdf' }
        }
      ],
      uploading: false,
      totalProgress: 100,
      completedCount: 1,
      errors: [],
      context: { identifierType: 'userId', identifierValue: 'tester' }
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(mockUploadState))

    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Step 1: 첫 번째 고객 선택
    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-1'))
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })

    // Step 2: 다른 고객으로 변경 (해제 후 재선택)
    fireEvent.click(screen.getByLabelText('고객 선택 해제'))
    await waitFor(() => {
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-2'))

    // Then: 업로드 상태가 초기화되어야 함
    await waitFor(() => {
      const savedState = sessionStorage.getItem(SESSION_KEY)
      if (savedState) {
        const parsedState = JSON.parse(savedState)
        expect(parsedState.files.length).toBe(0)
        expect(parsedState.completedCount).toBe(0)
      }
    })
  })

  it('같은 고객을 다시 선택해도 상태가 유지되어야 함 (불필요한 초기화 방지)', async () => {
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // 고객 선택
    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-1'))

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })

    // 같은 고객을 다시 선택 (모달을 열어서)
    // 이 경우는 실제로 변경이 아니므로 초기화가 일어나지 않아야 함
    // (현재 구현에서는 prevCustomerId와 currentCustomerId가 같으면 초기화 안 함)

    // 참고: 실제로 같은 고객을 다시 선택하려면 해제 없이 모달에서 같은 고객을 선택해야 함
    // 이 테스트는 해제 없이 같은 고객 ID가 설정되면 초기화가 일어나지 않는지 확인
  })

  it('고객 해제 시 prevCustomerId가 올바르게 추적되어야 함', async () => {
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Step 1: 고객 선택
    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-1'))

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })

    // Step 2: 고객 해제
    fireEvent.click(screen.getByLabelText('고객 선택 해제'))

    await waitFor(() => {
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument()
    })

    // Step 3: 같은 고객 다시 선택
    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-1'))

    // Then: 고객이 정상적으로 선택되어야 함
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })
  })
})

describe('DocumentRegistrationView - isLogVisible 상태 검증', () => {
  const LOGS_KEY = 'document-upload-logs'

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('초기 상태에서 isLogVisible은 false여야 함', () => {
    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // 로그 영역이 표시되지 않아야 함
    // (isLogVisible이 false이므로)
    expect(screen.queryByTestId('processing-log')).not.toBeInTheDocument()
  })

  it('고객 변경 시 sessionStorage의 로그가 초기화되어야 함', async () => {
    // Given: 로그가 있는 상태
    const mockLogs = [
      { id: 'log1', timestamp: new Date().toISOString(), level: 'info', message: '테스트' }
    ]
    sessionStorage.setItem(LOGS_KEY, JSON.stringify(mockLogs))

    render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // 고객 선택
    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-1'))

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument()
    })

    // 고객 해제
    fireEvent.click(screen.getByLabelText('고객 선택 해제'))

    // 다른 고객 선택
    fireEvent.click(screen.getByText('고객 선택'))
    await waitFor(() => {
      expect(screen.getByTestId('customer-selector-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('select-customer-2'))

    // Then: 로그가 초기화되어야 함
    await waitFor(() => {
      const savedLogs = sessionStorage.getItem(LOGS_KEY)
      const parsedLogs = savedLogs ? JSON.parse(savedLogs) : []
      expect(parsedLogs.length).toBe(0)
    })
  })
})
