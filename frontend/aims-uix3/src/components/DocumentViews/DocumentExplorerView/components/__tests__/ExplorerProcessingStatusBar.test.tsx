/**
 * ExplorerProcessingStatusBar 컴포넌트 테스트
 * - Progressive Disclosure: 처리 중 문서가 없으면 숨김
 * - 퍼센트 계산 정확성 + 99% 클램핑
 * - 스켈레톤 로딩 상태
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExplorerProcessingStatusBar } from '../ExplorerProcessingStatusBar'
import type { DocumentStatistics } from '@/types/documentStatistics'

/** 기본 통계 생성 헬퍼 */
function makeStats(overrides: Partial<DocumentStatistics> = {}): DocumentStatistics {
  return {
    total: 100,
    completed: 80,
    processing: 0,
    error: 0,
    pending: 0,
    completed_with_skip: 0,
    credit_pending: 0,
    stages: { upload: 0, meta: 0, ocr_prep: 0, ocr: 0, docembed: 0 },
    badgeTypes: {},
    ...overrides,
  }
}

describe('ExplorerProcessingStatusBar', () => {
  it('statistics=null이면 null을 렌더링한다', () => {
    const { container } = render(
      <ExplorerProcessingStatusBar statistics={null} isLoading={false} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('processing=0, error=0, pending=0, credit_pending=0이면 null (Progressive Disclosure)', () => {
    const stats = makeStats({
      total: 50,
      completed: 50,
      processing: 0,
      error: 0,
      pending: 0,
      credit_pending: 0,
    })
    const { container } = render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('processing > 0이면 바를 표시하고 퍼센트 계산이 정확하다', () => {
    const stats = makeStats({
      total: 200,
      completed: 150,
      completed_with_skip: 10,
      processing: 5,
      credit_pending: 0,
    })
    // allCompleted = 150 + 10 = 160 (credit_pending 제외), rawPct = Math.round(160/200*100) = 80
    render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(screen.getByText('처리 현황')).toBeInTheDocument()
    expect(screen.getByText(/160\/200 완료 \(80%\)/)).toBeInTheDocument()
    expect(screen.getByText('5 처리중')).toBeInTheDocument()
  })

  it('rawPct=100이지만 hasActiveProcessing=true이면 99%로 클램핑한다', () => {
    // allCompleted = completed + completed_with_skip = 97 + 3 = 100
    // total = 100 → rawPct = 100, 하지만 processing > 0이므로 99%로 클램핑
    const stats = makeStats({
      total: 100,
      completed: 97,
      completed_with_skip: 3,
      credit_pending: 0,
      processing: 1,
    })
    render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(screen.getByText(/99%/)).toBeInTheDocument()
    // 100%가 표시되지 않아야 함
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument()
  })

  it('credit_pending은 완료 건수에 포함되지 않는다', () => {
    // allCompleted = 80 + 0 = 80 (credit_pending 5는 제외)
    // rawPct = Math.round(80/100*100) = 80
    const stats = makeStats({
      total: 100,
      completed: 80,
      completed_with_skip: 0,
      credit_pending: 5,
      processing: 0,
      error: 0,
      pending: 0,
    })
    render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(screen.getByText(/80\/100 완료 \(80%\)/)).toBeInTheDocument()
    expect(screen.getByText('5 크레딧대기')).toBeInTheDocument()
  })

  it('isLoading=true, statistics=null이면 스켈레톤을 렌더링한다', () => {
    const { container } = render(
      <ExplorerProcessingStatusBar statistics={null} isLoading={true} />
    )
    expect(container.querySelector('.explorer-psb--skeleton')).toBeInTheDocument()
    expect(container.querySelector('.explorer-psb__skeleton-track')).toBeInTheDocument()
  })

  it('error > 0이면 에러 배지를 표시한다', () => {
    const stats = makeStats({
      total: 100,
      completed: 90,
      error: 3,
    })
    render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(screen.getByText('3 에러')).toBeInTheDocument()
  })

  it('pending > 0이면 대기 배지를 표시한다', () => {
    const stats = makeStats({
      total: 100,
      completed: 90,
      pending: 7,
    })
    render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(screen.getByText('7 대기')).toBeInTheDocument()
  })

  it('credit_pending > 0이면 크레딧대기 배지를 표시한다', () => {
    const stats = makeStats({
      total: 100,
      completed: 90,
      credit_pending: 5,
    })
    render(
      <ExplorerProcessingStatusBar statistics={stats} isLoading={false} />
    )
    expect(screen.getByText('5 크레딧대기')).toBeInTheDocument()
  })
})
