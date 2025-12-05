/**
 * MappingPreview 컴포넌트 테스트
 * @since 2025-12-05
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MappingPreview from '../components/MappingPreview'
import type { FolderMapping } from '../types'

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

      // 매칭 2개
      expect(screen.getByText('2')).toBeInTheDocument()
      // 미매칭 1개
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    test('총 파일 수가 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ fileCount: 5 }),
        createMockMapping({ fileCount: 10 }),
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
        createMockMapping({ totalSize: 1024 * 1024 }), // 1MB
        createMockMapping({ totalSize: 2 * 1024 * 1024 }), // 2MB
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
    test('테이블 헤더가 표시된다', () => {
      render(
        <MappingPreview
          mappings={[createMockMapping()]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('상태')).toBeInTheDocument()
      expect(screen.getByText('폴더명')).toBeInTheDocument()
      expect(screen.getByText('고객명')).toBeInTheDocument()
      expect(screen.getByText('파일')).toBeInTheDocument()
      expect(screen.getByText('크기')).toBeInTheDocument()
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
      expect(screen.getByText('5개')).toBeInTheDocument()
    })

    test('미매칭 폴더에 "일치하는 고객 없음" 표시', () => {
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

      expect(screen.getByText('일치하는 고객 없음')).toBeInTheDocument()
    })
  })

  describe('경고 메시지', () => {
    test('미매칭 폴더가 있으면 경고가 표시된다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ matched: true }),
        createMockMapping({ matched: false, customerId: null, customerName: null }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText(/미매칭된 1개 폴더의 문서는 업로드되지 않습니다/)).toBeInTheDocument()
    })

    test('모두 매칭되면 경고가 표시되지 않는다', () => {
      const mappings: FolderMapping[] = [
        createMockMapping({ matched: true }),
        createMockMapping({ matched: true }),
      ]

      render(
        <MappingPreview
          mappings={mappings}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.queryByText(/미매칭된.*폴더의 문서는 업로드되지 않습니다/)).not.toBeInTheDocument()
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
          mappings={[createMockMapping({ matched: false, customerId: null, customerName: null })]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      const uploadButton = screen.getByText('매칭된 폴더가 없습니다')
      expect(uploadButton.closest('button')).toBeDisabled()
    })

    test('업로드 버튼에 매칭된 폴더 수가 표시된다', () => {
      render(
        <MappingPreview
          mappings={[
            createMockMapping({ matched: true }),
            createMockMapping({ matched: true }),
            createMockMapping({ matched: false, customerId: null, customerName: null }),
          ]}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByText('2개 폴더 업로드 시작')).toBeInTheDocument()
    })
  })
})
