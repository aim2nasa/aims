/**
 * MappingPreview 컴포넌트 테스트
 * @since 2025-12-05
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MappingPreview from '../components/MappingPreview'
import type { FolderMapping } from '../types'
import type { CustomerForMatching } from '../utils/customerMatcher'

/**
 * 테스트용 매핑 데이터 생성
 */
function createMockMapping(overrides: Partial<FolderMapping> = {}): FolderMapping {
  return {
    folderName: '홍길동',
    customerId: 'c1',
    customerName: '홍길동',
    matched: true,
    files: [],
    fileCount: 5,
    totalSize: 1024 * 1024, // 1MB
    ...overrides,
  }
}

describe('MappingPreview', () => {
  const mockOnBack = vi.fn()
  const mockOnStartUpload = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('요약 통계', () => {
    test('매칭/미매칭 수가 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '홍길동', matched: true }),
        createMockMapping({ folderName: '김철수', matched: true }),
        createMockMapping({ folderName: '미매칭', matched: false, customerId: null, customerName: null }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      // 선택됨: 2/2 (선택된 수/전체 매칭 수)
      expect(screen.getByText('2/2')).toBeInTheDocument()
      // 미매칭 1개
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    test('총 파일 수가 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '홍길동', fileCount: 5 }),
        createMockMapping({ folderName: '김철수', fileCount: 10 }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('15')).toBeInTheDocument()
    })

    test('총 크기가 포맷되어 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '홍길동', totalSize: 1024 * 1024 }), // 1MB
        createMockMapping({ folderName: '김철수', totalSize: 2 * 1024 * 1024 }), // 2MB
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('3.0 MB')).toBeInTheDocument()
    })
  })

  describe('매핑 목록', () => {
    test('트리 헤더가 표시된다', () => {
      render(
        <MappingPreview
          mappings={[createMockMapping()]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('폴더 구조')).toBeInTheDocument()
      expect(screen.getByText('전체 해제')).toBeInTheDocument() // 기본적으로 모든 매칭 폴더 선택됨
      expect(screen.getByText(/모두 접기|모두 펼치기/)).toBeInTheDocument()
    })

    test('매칭된 폴더가 표시된다', () => {
      const mapping = createMockMapping({
        folderName: '홍길동',
        customerName: '홍길동',
        matched: true,
        fileCount: 5,
      })

      render(
        <MappingPreview
          mappings={[mapping]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      // 폴더명과 고객명이 같으면 두 번 표시됨
      const hongElements = screen.getAllByText('홍길동')
      expect(hongElements.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/5개/)).toBeInTheDocument()
    })

    test('미매칭 폴더에 "미매칭" 표시', () => {
      const mapping = createMockMapping({
        folderName: '미매칭폴더',
        matched: false,
        customerId: null,
        customerName: null,
      })

      render(
        <MappingPreview
          mappings={[mapping]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      // "미매칭"이 legend와 폴더 note에 모두 표시됨
      const unmatchedElements = screen.getAllByText('미매칭')
      expect(unmatchedElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('경고 메시지', () => {
    test('미매칭 폴더가 있으면 경고가 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '홍길동', matched: true }),
        createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText(/미매칭된 1개 폴더는 업로드되지 않습니다/)).toBeInTheDocument()
    })

    test('모두 매칭되면 경고가 표시되지 않는다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '홍길동', matched: true }),
        createMockMapping({ folderName: '김철수', matched: true }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.queryByText(/미매칭된.*폴더는 업로드되지 않습니다/)).not.toBeInTheDocument()
    })
  })

  describe('버튼 동작', () => {
    test('뒤로 버튼 클릭 시 onBack 호출', () => {
      render(
        <MappingPreview
          mappings={[createMockMapping()]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByText('뒤로'))
      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })

    test('업로드 버튼 클릭 시 onStartUpload 호출', () => {
      render(
        <MappingPreview
          mappings={[createMockMapping({ matched: true })]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByText(/업로드 시작/))
      expect(mockOnStartUpload).toHaveBeenCalledTimes(1)
    })

    test('매칭된 폴더가 없으면 업로드 버튼이 비활성화된다', () => {
      render(
        <MappingPreview
          mappings={[createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null })]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      const uploadButton = screen.getByText('업로드할 폴더를 선택하세요')
      expect(uploadButton.closest('button')).toBeDisabled()
    })

    test('업로드 버튼에 선택된 폴더 수가 표시된다', () => {
      render(
        <MappingPreview
          mappings={[
            createMockMapping({ folderName: '홍길동', matched: true }),
            createMockMapping({ folderName: '김철수', matched: true }),
            createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null }),
          ]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('2개 폴더 업로드 시작')).toBeInTheDocument()
    })
  })

  describe('수동 고객 매핑', () => {
    const mockOnMappingChange = vi.fn()

    const mockCustomers: CustomerForMatching[] = [
      { _id: 'c1', personal_info: { name: '김태호' }, insurance_info: { customer_type: '개인' } },
      { _id: 'c2', personal_info: { name: '홍길동' }, insurance_info: { customer_type: '개인' } },
      { _id: 'c3', personal_info: { name: '한울테크' }, insurance_info: { customer_type: '법인' } },
    ]

    beforeEach(() => {
      mockOnMappingChange.mockClear()
    })

    test('"고객 지정" 버튼이 미매칭 폴더에만 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null }),
        createMockMapping({ folderName: '홍길동', matched: true }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      // 미매칭 폴더에 "고객 지정" 버튼이 존재
      const assignButtons = screen.getAllByText('고객 지정')
      expect(assignButtons).toHaveLength(1)

      // 매칭된 폴더에는 "고객 지정" 버튼이 없음 (총 1개뿐)
      expect(assignButtons.length).toBe(1)
    })

    test('"고객 지정" 클릭 시 검색 드롭다운이 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByText('고객 지정'))
      expect(screen.getByPlaceholderText('고객명 검색')).toBeInTheDocument()
    })

    test('고객 선택 시 onMappingChange가 올바른 인자로 호출된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      // 드롭다운 열기
      fireEvent.click(screen.getByText('고객 지정'))
      // 고객 선택
      fireEvent.click(screen.getByText('김태호'))

      expect(mockOnMappingChange).toHaveBeenCalledTimes(1)
      expect(mockOnMappingChange).toHaveBeenCalledWith('미매칭폴더', mockCustomers[0])
    })

    test('검색 필터링이 동작한다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ folderName: '미매칭폴더', matched: false, customerId: null, customerName: null }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      // 드롭다운 열기
      fireEvent.click(screen.getByText('고객 지정'))

      // "김" 입력
      const searchInput = screen.getByPlaceholderText('고객명 검색')
      fireEvent.change(searchInput, { target: { value: '김' } })

      // "김태호"만 표시되고 "홍길동", "한울테크"는 안 보임
      expect(screen.getByText('김태호')).toBeInTheDocument()
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument()
      expect(screen.queryByText('한울테크')).not.toBeInTheDocument()
    })

    test('수동 매핑된 폴더에 "수동 지정" 배지가 표시된다', () => {
      // folderName !== customerName인 matched 매핑 → 수동 매핑으로 판별
      const mappings: FolderMapping[] = [
        createMockMapping({
          folderName: '미매칭폴더',
          customerId: 'c1',
          customerName: '김태호',
          matched: true,
        }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('수동 지정')).toBeInTheDocument()
    })
  })
})
