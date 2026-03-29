/**
 * BaseViewer 이름 변경 버튼 테스트
 *
 * RP에서 문서 이름 변경 기능 추가 검증
 * - onRename prop 전달 시 편집 버튼 렌더링
 * - onRename prop 미전달 시 버튼 없음
 * - 버튼 클릭 시 onRename 콜백 호출
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BaseViewer } from '../BaseViewer'

describe('BaseViewer - 이름 변경 버튼 테스트', () => {
  const defaultProps = {
    visible: true,
    title: '테스트 문서.pdf',
    onClose: vi.fn(),
    children: <div>뷰어 콘텐츠</div>,
  }

  it('onRename이 전달되면 편집 버튼이 렌더링되어야 함', () => {
    const onRename = vi.fn()
    const { container } = render(
      <BaseViewer {...defaultProps} onRename={onRename} />
    )

    const renameBtn = container.querySelector('.base-viewer__rename-btn')
    expect(renameBtn).not.toBeNull()
  })

  it('onRename이 없으면 편집 버튼이 없어야 함', () => {
    const { container } = render(
      <BaseViewer {...defaultProps} />
    )

    const renameBtn = container.querySelector('.base-viewer__rename-btn')
    expect(renameBtn).toBeNull()
  })

  it('편집 버튼 클릭 시 onRename이 호출되어야 함', () => {
    const onRename = vi.fn()
    const { container } = render(
      <BaseViewer {...defaultProps} onRename={onRename} />
    )

    const renameBtn = container.querySelector('.base-viewer__rename-btn')
    expect(renameBtn).not.toBeNull()
    fireEvent.click(renameBtn!)
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it('visible이 false이면 아무것도 렌더링하지 않아야 함', () => {
    const { container } = render(
      <BaseViewer {...defaultProps} visible={false} onRename={vi.fn()} />
    )

    expect(container.innerHTML).toBe('')
  })
})
