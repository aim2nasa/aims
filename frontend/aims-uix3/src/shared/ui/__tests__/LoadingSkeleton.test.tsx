/**
 * LoadingSkeleton 컴포넌트 테스트
 * 로딩 상태를 위한 스켈레톤 플레이스홀더 컴포넌트 검증
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingSkeleton, TextSkeleton, CardSkeleton } from '../LoadingSkeleton'

describe('LoadingSkeleton', () => {
  describe('기본 렌더링', () => {
    it('스켈레톤이 렌더링되어야 함', () => {
      render(<LoadingSkeleton />)

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('기본 aria-label이 설정되어야 함', () => {
      render(<LoadingSkeleton />)

      expect(screen.getByLabelText('콘텐츠 로딩 중')).toBeInTheDocument()
    })

    it('커스텀 aria-label 적용', () => {
      render(<LoadingSkeleton aria-label="사용자 정보 로딩 중" />)

      expect(screen.getByLabelText('사용자 정보 로딩 중')).toBeInTheDocument()
    })
  })

  describe('variant prop', () => {
    it('text variant 적용', () => {
      const { container } = render(<LoadingSkeleton variant="text" />)

      const skeleton = container.querySelector('.loading-skeleton--text')
      expect(skeleton).toBeInTheDocument()
    })

    it('rectangle variant 적용', () => {
      const { container } = render(<LoadingSkeleton variant="rectangle" />)

      const skeleton = container.querySelector('.loading-skeleton--rectangle')
      expect(skeleton).toBeInTheDocument()
    })

    it('circle variant 적용', () => {
      const { container } = render(<LoadingSkeleton variant="circle" />)

      const skeleton = container.querySelector('.loading-skeleton--circle')
      expect(skeleton).toBeInTheDocument()
    })

    it('rounded variant 적용', () => {
      const { container } = render(<LoadingSkeleton variant="rounded" />)

      const skeleton = container.querySelector('.loading-skeleton--rounded')
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe('width prop', () => {
    it('픽셀 단위 너비 적용 (number)', () => {
      const { container } = render(<LoadingSkeleton width={200} />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ width: '200px' })
    })

    it('퍼센트 단위 너비 적용 (string)', () => {
      const { container } = render(<LoadingSkeleton width="50%" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ width: '50%' })
    })

    it('기본 너비는 100%', () => {
      const { container } = render(<LoadingSkeleton />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ width: '100%' })
    })
  })

  describe('height prop', () => {
    it('픽셀 단위 높이 적용 (number)', () => {
      const { container } = render(<LoadingSkeleton height={100} />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ height: '100px' })
    })

    it('문자열 단위 높이 적용 (string)', () => {
      const { container } = render(<LoadingSkeleton height="2em" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ height: '2em' })
    })

    it('variant별 기본 높이 - text', () => {
      const { container } = render(<LoadingSkeleton variant="text" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ height: '1em' })
    })

    it('variant별 기본 높이 - rectangle', () => {
      const { container } = render(<LoadingSkeleton variant="rectangle" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ height: '200px' })
    })

    it('variant별 기본 높이 - circle', () => {
      const { container } = render(<LoadingSkeleton variant="circle" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ height: '40px' })
    })

    it('variant별 기본 높이 - rounded', () => {
      const { container } = render(<LoadingSkeleton variant="rounded" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveStyle({ height: '120px' })
    })
  })

  describe('animate prop', () => {
    it('animate=true일 때 애니메이션 클래스 적용 (기본값)', () => {
      const { container } = render(<LoadingSkeleton animate={true} />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveClass('loading-skeleton--animate')
    })

    it('animate=false일 때 애니메이션 클래스 없음', () => {
      const { container } = render(<LoadingSkeleton animate={false} />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).not.toHaveClass('loading-skeleton--animate')
    })
  })

  describe('className prop', () => {
    it('커스텀 클래스 적용', () => {
      const { container } = render(<LoadingSkeleton className="custom-skeleton" />)

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveClass('custom-skeleton')
      expect(skeleton).toHaveClass('loading-skeleton')
    })
  })

  describe('조합 테스트', () => {
    it('circle + width + height', () => {
      const { container } = render(
        <LoadingSkeleton variant="circle" width={50} height={50} />
      )

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveClass('loading-skeleton--circle')
      expect(skeleton).toHaveStyle({ width: '50px', height: '50px' })
    })

    it('rectangle + width + height + animate=false', () => {
      const { container } = render(
        <LoadingSkeleton
          variant="rectangle"
          width="100%"
          height={300}
          animate={false}
        />
      )

      const skeleton = container.querySelector('.loading-skeleton')
      expect(skeleton).toHaveClass('loading-skeleton--rectangle')
      expect(skeleton).not.toHaveClass('loading-skeleton--animate')
      expect(skeleton).toHaveStyle({ width: '100%', height: '300px' })
    })
  })

  describe('접근성', () => {
    it('role=status 속성이 있어야 함', () => {
      render(<LoadingSkeleton />)

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('스크린 리더 전용 텍스트 포함', () => {
      const { container } = render(<LoadingSkeleton aria-label="로딩 중" />)

      const srOnly = container.querySelector('.sr-only')
      expect(srOnly).toHaveTextContent('로딩 중')
    })
  })
})

describe('TextSkeleton', () => {
  describe('기본 렌더링', () => {
    it('기본 3줄의 텍스트 스켈레톤 렌더링', () => {
      const { container } = render(<TextSkeleton />)

      const textLines = container.querySelectorAll('.loading-skeleton--text')
      expect(textLines).toHaveLength(3)
    })

    it('커스텀 라인 수 렌더링', () => {
      const { container } = render(<TextSkeleton lines={5} />)

      const textLines = container.querySelectorAll('.loading-skeleton--text')
      expect(textLines).toHaveLength(5)
    })

    it('aria-label에 라인 수 포함', () => {
      render(<TextSkeleton lines={4} />)

      expect(screen.getByLabelText('4줄의 텍스트 로딩 중')).toBeInTheDocument()
    })
  })

  describe('widths prop', () => {
    it('커스텀 너비 배열 적용', () => {
      const widths = ['100%', '80%', '60%']
      const { container } = render(<TextSkeleton lines={3} widths={widths} />)

      const textLines = container.querySelectorAll('.loading-skeleton--text')
      expect(textLines[0]).toHaveStyle({ width: '100%' })
      expect(textLines[1]).toHaveStyle({ width: '80%' })
      expect(textLines[2]).toHaveStyle({ width: '60%' })
    })

    it('widths가 없으면 기본 패턴 사용', () => {
      const { container } = render(<TextSkeleton lines={5} />)

      const textLines = container.querySelectorAll('.loading-skeleton--text')
      expect(textLines).toHaveLength(5)
      // 기본 패턴: ['100%', '80%', '60%', '90%', '70%']
      expect(textLines[0]).toHaveStyle({ width: '100%' })
      expect(textLines[1]).toHaveStyle({ width: '80%' })
    })
  })

  describe('gap prop', () => {
    it('기본 gap 적용', () => {
      const { container } = render(<TextSkeleton />)

      const wrapper = container.querySelector('.text-skeleton')
      expect(wrapper).toHaveStyle({ gap: 'var(--spacing-2)' })
    })

    it('커스텀 gap 적용', () => {
      const { container } = render(<TextSkeleton gap="16px" />)

      const wrapper = container.querySelector('.text-skeleton')
      expect(wrapper).toHaveStyle({ gap: '16px' })
    })
  })

  describe('animate prop', () => {
    it('animate=true일 때 모든 라인에 애니메이션', () => {
      const { container } = render(<TextSkeleton lines={3} animate={true} />)

      const textLines = container.querySelectorAll('.loading-skeleton--animate')
      expect(textLines).toHaveLength(3)
    })

    it('animate=false일 때 애니메이션 없음', () => {
      const { container } = render(<TextSkeleton lines={3} animate={false} />)

      const textLines = container.querySelectorAll('.loading-skeleton--animate')
      expect(textLines).toHaveLength(0)
    })
  })

  describe('className prop', () => {
    it('커스텀 클래스 적용', () => {
      const { container } = render(<TextSkeleton className="custom-text" />)

      const wrapper = container.querySelector('.text-skeleton')
      expect(wrapper).toHaveClass('custom-text')
    })
  })

  describe('접근성', () => {
    it('role=status 속성', () => {
      render(<TextSkeleton lines={2} />)

      // TextSkeleton 래퍼에 role=status와 aria-label이 있는지 확인
      expect(screen.getByLabelText('2줄의 텍스트 로딩 중')).toBeInTheDocument()
    })
  })
})

describe('CardSkeleton', () => {
  describe('기본 렌더링', () => {
    it('카드 스켈레톤이 렌더링되어야 함', () => {
      render(<CardSkeleton />)

      expect(screen.getByLabelText('카드 콘텐츠 로딩 중')).toBeInTheDocument()
    })

    it('기본 구조: 제목(1줄) + 내용(3줄)', () => {
      const { container } = render(<CardSkeleton />)

      // 최소 4개 이상의 스켈레톤 라인 (제목 1 + 내용 3)
      const skeletons = container.querySelectorAll('.loading-skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('showAvatar prop', () => {
    it('showAvatar=false일 때 아바타 없음 (기본값)', () => {
      const { container } = render(<CardSkeleton showAvatar={false} />)

      const header = container.querySelector('.card-skeleton__header')
      expect(header).not.toBeInTheDocument()
    })

    it('showAvatar=true일 때 아바타와 헤더 렌더링', () => {
      const { container } = render(<CardSkeleton showAvatar={true} />)

      const header = container.querySelector('.card-skeleton__header')
      expect(header).toBeInTheDocument()

      const circle = container.querySelector('.loading-skeleton--circle')
      expect(circle).toBeInTheDocument()
    })

    it('avatarSize 커스터마이징', () => {
      const { container } = render(<CardSkeleton showAvatar={true} avatarSize="60px" />)

      const circle = container.querySelector('.loading-skeleton--circle')
      expect(circle).toHaveStyle({ width: '60px', height: '60px' })
    })
  })

  describe('titleLines prop', () => {
    it('기본 제목 라인 수는 1', () => {
      const { container } = render(<CardSkeleton titleLines={1} />)

      // 제목 영역에 1개의 스켈레톤
      const skeletons = container.querySelectorAll('.loading-skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(1)
    })

    it('커스텀 제목 라인 수', () => {
      const { container } = render(<CardSkeleton titleLines={2} />)

      const skeletons = container.querySelectorAll('.loading-skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('contentLines prop', () => {
    it('기본 콘텐츠 라인 수는 3', () => {
      const { container } = render(<CardSkeleton contentLines={3} />)

      const skeletons = container.querySelectorAll('.loading-skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(3)
    })

    it('커스텀 콘텐츠 라인 수', () => {
      const { container } = render(<CardSkeleton contentLines={5} />)

      const skeletons = container.querySelectorAll('.loading-skeleton')
      expect(skeletons.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('showActions prop', () => {
    it('showActions=false일 때 액션 버튼 없음 (기본값)', () => {
      const { container } = render(<CardSkeleton showActions={false} />)

      const actions = container.querySelector('.card-skeleton__actions')
      expect(actions).not.toBeInTheDocument()
    })

    it('showActions=true일 때 액션 버튼 렌더링', () => {
      const { container } = render(<CardSkeleton showActions={true} />)

      const actions = container.querySelector('.card-skeleton__actions')
      expect(actions).toBeInTheDocument()

      const actionButtons = actions?.querySelectorAll('.loading-skeleton--rounded')
      expect(actionButtons?.length).toBe(2)
    })
  })

  describe('animate prop', () => {
    it('animate=true일 때 모든 요소에 애니메이션', () => {
      const { container } = render(<CardSkeleton animate={true} />)

      const animated = container.querySelectorAll('.loading-skeleton--animate')
      expect(animated.length).toBeGreaterThan(0)
    })

    it('animate=false일 때 애니메이션 없음', () => {
      const { container } = render(<CardSkeleton animate={false} />)

      const animated = container.querySelectorAll('.loading-skeleton--animate')
      expect(animated).toHaveLength(0)
    })
  })

  describe('className prop', () => {
    it('커스텀 클래스 적용', () => {
      const { container } = render(<CardSkeleton className="custom-card" />)

      const card = container.querySelector('.card-skeleton')
      expect(card).toHaveClass('custom-card')
    })
  })

  describe('조합 테스트', () => {
    it('전체 옵션 활성화', () => {
      const { container } = render(
        <CardSkeleton
          showAvatar={true}
          avatarSize="50px"
          titleLines={2}
          contentLines={4}
          showActions={true}
          animate={true}
        />
      )

      expect(container.querySelector('.card-skeleton__header')).toBeInTheDocument()
      expect(container.querySelector('.card-skeleton__actions')).toBeInTheDocument()
      expect(container.querySelectorAll('.loading-skeleton--animate').length).toBeGreaterThan(0)
    })
  })

  describe('접근성', () => {
    it('role=status 속성과 aria-label 설정', () => {
      render(<CardSkeleton />)

      // CardSkeleton에 role=status와 aria-label이 있는지 확인
      expect(screen.getByLabelText('카드 콘텐츠 로딩 중')).toBeInTheDocument()
    })
  })
})
