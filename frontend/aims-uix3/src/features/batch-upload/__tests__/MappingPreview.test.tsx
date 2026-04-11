/**
 * MappingPreview 컴포넌트 테스트
 * @since 2025-12-05
 * @version 4.0.0 (2026-04-11 재설계 — 3상태 / 공존 금지 가드 / 해제 즉시성)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MappingPreview from '../components/MappingPreview'
import type { FolderMapping } from '../types'
import type { CustomerForMatching } from '../utils/customerMatcher'

/** 3상태 매핑 생성 헬퍼 */
function mkMapping(overrides: Partial<FolderMapping> = {}): FolderMapping {
  return {
    folderPath: '홍길동',
    folderName: '홍길동',
    parentFolderPath: null,
    state: 'unmapped',
    customerId: null,
    customerName: null,
    inheritedFromPath: null,
    directFiles: [],
    directFileCount: 0,
    directTotalSize: 0,
    subtreeFiles: [],
    subtreeFileCount: 5,
    subtreeTotalSize: 1024 * 1024,
    ...overrides,
  }
}

const mockCustomers: CustomerForMatching[] = [
  { _id: 'c1', personal_info: { name: '김태호' }, insurance_info: { customer_type: '개인' } },
  { _id: 'c2', personal_info: { name: '홍길동' }, insurance_info: { customer_type: '개인' } },
  { _id: 'c3', personal_info: { name: '한울테크' }, insurance_info: { customer_type: '법인' } },
]

describe('MappingPreview v4 — 3상태 렌더', () => {
  const mockOnBack = vi.fn()
  const mockOnStartUpload = vi.fn()
  const mockOnMappingChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('상단 요약', () => {
    test('드롭 직후(모두 unmapped)에는 업로드 대상 0개로 표시된다', () => {
      const mappings = [
        mkMapping({ folderPath: 'A', folderName: 'A', state: 'unmapped' }),
        mkMapping({ folderPath: 'B', folderName: 'B', state: 'unmapped' }),
      ]
      render(<MappingPreview mappings={mappings} onBack={mockOnBack} onStartUpload={mockOnStartUpload} />)

      expect(screen.getByText(/업로드 대상:/)).toBeInTheDocument()
      expect(screen.getByText(/0개 폴더/)).toBeInTheDocument()
      expect(screen.getByText(/미매핑 2개는 업로드되지 않습니다/)).toBeInTheDocument()
    })

    test('direct 1개 + unmapped 1개 → 업로드 대상 1개', () => {
      const mappings = [
        mkMapping({ folderPath: 'A', folderName: 'A', state: 'direct', customerId: 'c1', customerName: '김태호' }),
        mkMapping({ folderPath: 'B', folderName: 'B', state: 'unmapped' }),
      ]
      render(<MappingPreview mappings={mappings} customers={mockCustomers} onBack={mockOnBack} onStartUpload={mockOnStartUpload} />)

      // 상단 요약의 <strong>1개 폴더</strong> 정확 매칭
      const summary = screen.getByText((_, el) => el?.className === 'preview-summary')
      expect(summary).toHaveTextContent(/1개 폴더/)
      expect(summary).toHaveTextContent(/1명 고객/)
      expect(screen.getByText(/미매핑 1개는 업로드되지 않습니다/)).toBeInTheDocument()
    })
  })

  describe('3상태 렌더링', () => {
    test('direct: 고객명 + [해제] 버튼', () => {
      const mappings = [
        mkMapping({
          folderPath: '한울',
          folderName: '한울',
          state: 'direct',
          customerId: 'c3',
          customerName: '한울테크',
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

      expect(screen.getByText('한울테크')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '해제' })).toBeInTheDocument()
      // unmapped가 아니므로 [고객 지정] 버튼은 없음
      expect(screen.queryByRole('button', { name: '고객 지정' })).not.toBeInTheDocument()
    })

    test('inherited: 고객명 표시 + [고객 지정] 버튼 없음', () => {
      const mappings = [
        mkMapping({
          folderPath: '한울',
          folderName: '한울',
          state: 'direct',
          customerId: 'c3',
          customerName: '한울테크',
        }),
        mkMapping({
          folderPath: '한울/하위',
          folderName: '하위',
          parentFolderPath: '한울',
          state: 'inherited',
          customerId: 'c3',
          customerName: '한울테크',
          inheritedFromPath: '한울',
        }),
      ]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
          expandedPaths={new Set(['한울'])}
        />
      )

      // 상속 표시
      expect(screen.getByText('(상속)')).toBeInTheDocument()
      // direct 1개, 총 고객지정 버튼 0개, 해제 1개
      expect(screen.queryByRole('button', { name: '고객 지정' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '해제' })).toHaveLength(1)
    })

    test('unmapped: [고객 지정] 버튼 표시', () => {
      const mappings = [mkMapping({ folderPath: '미매핑', folderName: '미매핑', state: 'unmapped' })]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      expect(screen.getByRole('button', { name: '고객 지정' })).toBeInTheDocument()
    })
  })

  describe('고객 지정 드롭다운 + 추천 로직 보존', () => {
    test('[고객 지정] 클릭 → 검색 드롭다운 표시', () => {
      const mappings = [mkMapping({ folderPath: '미매핑', folderName: '미매핑', state: 'unmapped' })]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '고객 지정' }))
      expect(screen.getByPlaceholderText('고객명 검색')).toBeInTheDocument()
    })

    test('고객 선택 시 onMappingChange(folderPath, customer) 호출', () => {
      const mappings = [
        mkMapping({ folderPath: '루트/미매핑', folderName: '미매핑', state: 'unmapped' }),
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

      fireEvent.click(screen.getByRole('button', { name: '고객 지정' }))
      fireEvent.click(screen.getByText('김태호'))

      expect(mockOnMappingChange).toHaveBeenCalledTimes(1)
      expect(mockOnMappingChange).toHaveBeenCalledWith('루트/미매핑', mockCustomers[0])
    })

    test('폴더명이 고객명과 유사할 때 드롭다운 상단에 해당 고객이 정렬된다 (추천 로직 보존)', () => {
      const mappings = [
        mkMapping({ folderPath: '홍길동_2024', folderName: '홍길동_2024', state: 'unmapped' }),
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

      fireEvent.click(screen.getByRole('button', { name: '고객 지정' }))

      const list = screen.getByPlaceholderText('고객명 검색').parentElement!
      const items = within(list).getAllByText(/김태호|홍길동|한울테크/)
      // 첫 번째 항목이 홍길동이어야 함 (점수 상단 정렬)
      expect(items[0].textContent).toContain('홍길동')
    })

    test('검색 필터링이 동작한다', () => {
      const mappings = [mkMapping({ folderPath: 'F', folderName: 'F', state: 'unmapped' })]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '고객 지정' }))
      fireEvent.change(screen.getByPlaceholderText('고객명 검색'), { target: { value: '김' } })

      expect(screen.getByText('김태호')).toBeInTheDocument()
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument()
      expect(screen.queryByText('한울테크')).not.toBeInTheDocument()
    })
  })

  describe('공존 금지 가드 (R3)', () => {
    test('자식에 direct가 있으면 부모 [고객 지정] 버튼이 비활성화된다', () => {
      const mappings = [
        mkMapping({ folderPath: '한울', folderName: '한울', state: 'unmapped' }),
        mkMapping({
          folderPath: '한울/하위A',
          folderName: '하위A',
          parentFolderPath: '한울',
          state: 'direct',
          customerId: 'c3',
          customerName: '한울테크',
        }),
      ]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
          expandedPaths={new Set(['한울'])}
        />
      )

      // 부모 한울(unmapped)의 [고객 지정] 버튼이 disabled 상태
      const assignBtn = screen.getByRole('button', { name: '고객 지정' })
      expect(assignBtn).toBeDisabled()
    })

    test('자식에 direct가 없으면 부모 [고객 지정] 버튼은 활성화된다', () => {
      const mappings = [
        mkMapping({ folderPath: '한울', folderName: '한울', state: 'unmapped' }),
        mkMapping({
          folderPath: '한울/하위A',
          folderName: '하위A',
          parentFolderPath: '한울',
          state: 'unmapped',
        }),
      ]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onMappingChange={mockOnMappingChange}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
          expandedPaths={new Set(['한울'])}
        />
      )

      const assignButtons = screen.getAllByRole('button', { name: '고객 지정' })
      // 한울 + 하위A 둘 다 unmapped, 둘 다 활성화
      expect(assignButtons).toHaveLength(2)
      for (const btn of assignButtons) {
        expect(btn).not.toBeDisabled()
      }
    })
  })

  describe('해제 즉시성 (R5)', () => {
    test('[해제] 클릭 → onMappingChange(folderPath, null) 즉시 호출 (모달 없음)', () => {
      const mappings = [
        mkMapping({
          folderPath: '한울',
          folderName: '한울',
          state: 'direct',
          customerId: 'c3',
          customerName: '한울테크',
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

      fireEvent.click(screen.getByRole('button', { name: '해제' }))
      // 확인 모달 없이 즉시 콜백
      expect(mockOnMappingChange).toHaveBeenCalledTimes(1)
      expect(mockOnMappingChange).toHaveBeenCalledWith('한울', null)
    })
  })

  describe('D3: direct 폴더 고객명 재클릭으로 변경', () => {
    test('direct 행의 고객명 재클릭 → 드롭다운 재오픈', () => {
      const mappings = [
        mkMapping({
          folderPath: '한울',
          folderName: '한울',
          state: 'direct',
          customerId: 'c3',
          customerName: '한울테크',
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

      // 고객명(한울테크) 재클릭
      fireEvent.click(screen.getByText('한울테크'))
      expect(screen.getByPlaceholderText('고객명 검색')).toBeInTheDocument()
    })
  })

  describe('업로드 시작 버튼', () => {
    test('direct 매핑이 하나도 없으면 비활성화', () => {
      const mappings = [
        mkMapping({ folderPath: '미매핑', folderName: '미매핑', state: 'unmapped' }),
      ]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      const uploadBtn = screen.getByRole('button', { name: '고객을 지정해주세요' })
      expect(uploadBtn).toBeDisabled()
    })

    test('direct 매핑이 1개 이상이면 direct 폴더들만 전달된다', () => {
      const directMapping = mkMapping({
        folderPath: '한울',
        folderName: '한울',
        state: 'direct',
        customerId: 'c3',
        customerName: '한울테크',
      })
      const mappings = [
        directMapping,
        mkMapping({ folderPath: '미매핑', folderName: '미매핑', state: 'unmapped' }),
      ]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByText('1개 폴더 업로드 시작'))
      expect(mockOnStartUpload).toHaveBeenCalledTimes(1)
      expect(mockOnStartUpload).toHaveBeenCalledWith([directMapping])
    })

    test('뒤로 버튼 클릭 시 onBack 호출', () => {
      const mappings = [mkMapping({ state: 'unmapped' })]
      render(
        <MappingPreview
          mappings={mappings}
          customers={mockCustomers}
          onBack={mockOnBack}
          onStartUpload={mockOnStartUpload}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '뒤로' }))
      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })
  })
})
