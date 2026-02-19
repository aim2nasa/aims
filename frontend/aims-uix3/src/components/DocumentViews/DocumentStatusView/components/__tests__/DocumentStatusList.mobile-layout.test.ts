/**
 * 모바일 레이아웃 CSS 규칙 검증 테스트
 * @description 문서 라이브러리의 모바일/가로 모드 레이아웃이 올바른지 CSS 규칙을 정적 분석
 *
 * 검증 항목:
 * 1. 가로 모드에서 초성 필터바가 숨겨지지 않는지
 * 2. 768px 이하 가로 스크롤 테이블 레이아웃 검증 (commit 1b8c3dd3 이후 방식)
 *    - overflow-x: auto 적용으로 가로 스크롤 가능 여부
 *    - .status-list-header min-width: 850px (헤더가 살아있고 가로 스크롤로 접근 가능)
 *    - .status-item min-width: 850px
 * 3. 삭제 모드에서도 가로 스크롤 너비(880px) 보장
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// aims-uix3/ 디렉토리 기준
const AIMS_UIX3 = resolve(__dirname, '../../../../../..')

function readCSS(relativePath: string): string {
  return readFileSync(resolve(AIMS_UIX3, relativePath), 'utf-8')
}

/**
 * @media (max-width: Npx) 블록의 내용을 추출
 * 주의: new RegExp 문자열 방식으로 \s 사용 시 tsx 변환 버그 발생.
 * 반드시 String.indexOf + 직접 탐색 방식 사용.
 */
function extractMediaBlock(css: string, maxWidth: number): string | null {
  const marker = `@media (max-width: ${maxWidth}px)`
  const markerIdx = css.indexOf(marker)
  if (markerIdx === -1) return null

  // @media ... { 의 { 위치 찾기
  const braceIdx = css.indexOf('{', markerIdx)
  if (braceIdx === -1) return null

  // depth 추적으로 닫는 } 찾기
  let depth = 1
  let i = braceIdx + 1
  const start = i

  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    i++
  }

  return css.slice(start, i - 1)
}

describe('모바일 문서 라이브러리 레이아웃 CSS 검증', () => {
  // ─── phone-landscape.css: 초성 필터바 숨김 금지 ───
  describe('phone-landscape.css 초성 필터바', () => {
    let phoneLandscapeCSS: string

    it('phone-landscape.css 파일을 읽을 수 있어야 함', () => {
      phoneLandscapeCSS = readCSS('src/shared/styles/phone-landscape.css')
      expect(phoneLandscapeCSS).toBeTruthy()
    })

    it('초성 필터바를 display:none으로 숨기지 않아야 함', () => {
      phoneLandscapeCSS = readCSS('src/shared/styles/phone-landscape.css')

      // .layout-main--phone-landscape .initial-filter-bar { display: none } 패턴 검출
      const hidePattern = /\.layout-main--phone-landscape\s+\.initial-filter-bar\s*\{[^}]*display\s*:\s*none/
      expect(phoneLandscapeCSS).not.toMatch(hidePattern)
    })

    it('초성 필터바에 컴팩트 스타일이 적용되어야 함', () => {
      phoneLandscapeCSS = readCSS('src/shared/styles/phone-landscape.css')

      // 컴팩트 스타일의 핵심 요소 확인
      expect(phoneLandscapeCSS).toContain('.layout-main--phone-landscape .initial-filter-bar')
      expect(phoneLandscapeCSS).toContain('.layout-main--phone-landscape .initial-filter-bar__initials')

      // flex-wrap: wrap 이 적용되어야 함 (수평 스크롤 대신 래핑)
      const initialsBlock = phoneLandscapeCSS.match(
        /\.layout-main--phone-landscape\s+\.initial-filter-bar__initials\s*\{([^}]*)\}/
      )
      expect(initialsBlock).toBeTruthy()
      expect(initialsBlock![1]).toContain('flex-wrap')
      expect(initialsBlock![1]).toMatch(/flex-wrap\s*:\s*wrap/)
    })
  })

  // ─── DocumentStatusList.responsive.css: 768px 가로 스크롤 테이블 레이아웃 ───
  // commit 1b8c3dd3: 카드 레이아웃 → 가로 스크롤 테이블 방식으로 전환
  describe('DocumentStatusList.responsive.css 가로 스크롤 테이블 레이아웃', () => {
    let statusListCSS: string

    it('DocumentStatusList.responsive.css 파일을 읽을 수 있어야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )
      expect(statusListCSS).toBeTruthy()
    })

    it('768px 이하에서 가로 스크롤이 활성화되어야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // .document-status-list 블록에 overflow-x: auto 확인
      expect(mediaBlock768).toMatch(/\.document-status-list\s*\{[^}]*overflow-x\s*:\s*auto/)
    })

    it('768px 이하에서 헤더가 충분한 min-width(850px)를 가져야 함 (가로 스크롤 테이블)', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // .status-list-header { min-width: 850px } 확인 (가로 스크롤 방식에서 헤더는 숨기지 않음)
      const headerMinWidthMatch = mediaBlock768!.match(
        /\.status-list-header\s*\{[^}]*min-width\s*:\s*(\d+)px/
      )
      expect(headerMinWidthMatch).toBeTruthy()
      const headerMinWidth = parseInt(headerMinWidthMatch![1], 10)
      expect(headerMinWidth).toBeGreaterThanOrEqual(800)
    })

    it('768px 이하에서 status-item이 충분한 min-width(850px)를 가져야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // .status-item { min-width: 850px } 확인
      const itemMinWidthMatch = mediaBlock768!.match(
        /\.status-item\s*\{[^}]*min-width\s*:\s*(\d+)px/
      )
      expect(itemMinWidthMatch).toBeTruthy()
      const itemMinWidth = parseInt(itemMinWidthMatch![1], 10)
      expect(itemMinWidth).toBeGreaterThanOrEqual(800)
    })

    it('삭제 모드에서도 충분한 min-width(880px)가 보장되어야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // 삭제 모드에서도 min-width 보장 확인
      // .document-status-list--delete-mode .status-item { min-width: 880px } 패턴
      const deleteModeMinWidthMatch = mediaBlock768!.match(
        /--delete-mode\s+\.status-item[^{]*\{[^}]*min-width\s*:\s*(\d+)px/
      )
      expect(deleteModeMinWidthMatch).toBeTruthy()
      const deleteModeMinWidth = parseInt(deleteModeMinWidthMatch![1], 10)
      expect(deleteModeMinWidth).toBeGreaterThanOrEqual(850)
    })
  })
})
