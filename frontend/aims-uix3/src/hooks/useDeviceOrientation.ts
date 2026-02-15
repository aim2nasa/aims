import { useState, useEffect, useCallback } from 'react'

/**
 * 디바이스 방향 및 모바일 레이아웃 감지 훅
 *
 * 기존 width-only 감지(768px)의 한계를 보완:
 * - 폰 가로 모드(width > 768px, height < 500px) → 모바일 레이아웃 유지
 * - `pointer: coarse`로 터치 디바이스 구분 (데스크톱 리사이즈 오탐 방지)
 */

interface DeviceOrientationState {
  /** 모바일 레이아웃 사용 여부 (1칼럼, 드로어 네비, 오버레이 RightPane) */
  isMobileLayout: boolean
  /** 가로 모드 여부 */
  isLandscape: boolean
  /** 폰 가로 모드 (특수 컴팩트 모드) */
  isPhoneLandscape: boolean
  /** 뷰포트 너비 */
  viewportWidth: number
  /** 뷰포트 높이 */
  viewportHeight: number
}

const MOBILE_WIDTH_BREAKPOINT = 768
const PHONE_LANDSCAPE_MAX_HEIGHT = 500

/** coarse pointer 미디어 쿼리 (터치 디바이스 감지) */
const coarsePointerQuery = typeof window !== 'undefined'
  ? window.matchMedia('(pointer: coarse)')
  : null

/**
 * 현재 디바이스 상태를 즉시 감지 (비-훅 환경에서 사용)
 * useEffect 내부 등 훅을 사용할 수 없는 곳에서 활용
 */
export function detectDeviceState(): DeviceOrientationState {
  const w = window.innerWidth
  const h = window.innerHeight
  const isLandscape = w > h

  // 폰 가로 모드 감지:
  // 1. 가로 방향 (width > height)
  // 2. 높이 ≤ 500px (폰 가로 모드의 최대 높이)
  // 3. 터치 디바이스 (데스크톱 브라우저 리사이즈 제외)
  const isCoarsePointer = coarsePointerQuery?.matches ?? false
  const isPhoneLandscape = isLandscape && h <= PHONE_LANDSCAPE_MAX_HEIGHT && isCoarsePointer

  // 모바일 레이아웃 적용 조건:
  // 1. width ≤ 768px (일반 세로 모드 폰) OR
  // 2. 폰 가로 모드 (height ≤ 500px + 터치 디바이스)
  const isMobileLayout = w <= MOBILE_WIDTH_BREAKPOINT || isPhoneLandscape

  return {
    isMobileLayout,
    isLandscape,
    isPhoneLandscape,
    viewportWidth: w,
    viewportHeight: h,
  }
}

export function useDeviceOrientation(): DeviceOrientationState {
  const [state, setState] = useState<DeviceOrientationState>(detectDeviceState)

  const handleChange = useCallback(() => {
    setState(detectDeviceState())
  }, [])

  useEffect(() => {
    window.addEventListener('resize', handleChange)

    // orientationchange 이벤트 (구형 브라우저 호환)
    const handleOrientationChange = () => {
      // 방향 전환 후 뷰포트 안정화까지 약간 대기
      setTimeout(handleChange, 150)
    }
    window.addEventListener('orientationchange', handleOrientationChange)

    // pointer 미디어 쿼리 변경 감지 (드물지만 외부 키보드 연결 등)
    coarsePointerQuery?.addEventListener('change', handleChange)

    return () => {
      window.removeEventListener('resize', handleChange)
      window.removeEventListener('orientationchange', handleOrientationChange)
      coarsePointerQuery?.removeEventListener('change', handleChange)
    }
  }, [handleChange])

  return state
}
