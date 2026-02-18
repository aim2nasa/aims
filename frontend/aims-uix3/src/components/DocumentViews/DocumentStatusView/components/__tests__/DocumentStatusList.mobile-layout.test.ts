/**
 * 모바일 레이아웃 CSS 규칙 검증 테스트
 * @description 문서 라이브러리의 모바일/가로 모드 레이아웃이 올바른지 CSS 규칙을 정적 분석
 *
 * 검증 항목:
 * 1. 가로 모드에서 초성 필터바가 숨겨지지 않는지
 * 2. 768px 이하 카드 레이아웃에서 고객명 칼럼이 최소 110px 확보되는지 (6글자 기준)
 * 3. 삭제 모드에서도 고객명 칼럼 너비가 보장되는지
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// aims-uix3/ 디렉토리 기준
const AIMS_UIX3 = resolve(__dirname, '../../../../../..')

function readCSS(relativePath: string): string {
  return readFileSync(resolve(AIMS_UIX3, relativePath), 'utf-8')
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

  // ─── DocumentStatusList.responsive.css: 768px 카드 레이아웃 고객명 칼럼 ───
  describe('DocumentStatusList.responsive.css 카드 레이아웃 고객명 칼럼', () => {
    let statusListCSS: string

    it('DocumentStatusList.responsive.css 파일을 읽을 수 있어야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )
      expect(statusListCSS).toBeTruthy()
    })

    it('768px 이하 카드 레이아웃에서 고객명 칼럼이 고정 너비(110px, 6글자 기준)여야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      // @media (max-width: 768px) 블록 내의 .status-item grid-template-columns 추출
      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // .status-item 의 grid-template-columns 추출
      const gridMatch = mediaBlock768!.match(
        /\.status-item\s*\{[^}]*grid-template-columns\s*:\s*([^;]+)/
      )
      expect(gridMatch).toBeTruthy()

      const gridColumns = gridMatch![1].trim()
      // 마지막 칼럼(고객명)이 고정 너비 또는 최소 너비 보장
      const lastColumn = gridColumns.split(/\s+/).pop()!
      const numericWidth = parsePixelValue(lastColumn)

      // 고객명 칼럼이 최소 110px 이상이어야 한글 6글자 + 아이콘 표시 가능
      expect(numericWidth).toBeGreaterThanOrEqual(110)
    })

    it('삭제 모드에서도 고객명 칼럼이 고정 너비(110px, 6글자 기준)여야 함', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // 삭제 모드 grid-template-columns 추출
      const deleteGridMatch = mediaBlock768!.match(
        /--delete-mode\s+\.status-item\s*\{[^}]*grid-template-columns\s*:\s*([^;]+)/
      )
      expect(deleteGridMatch).toBeTruthy()

      const gridColumns = deleteGridMatch![1].trim()
      const lastColumn = gridColumns.split(/\s+/).pop()!
      const numericWidth = parsePixelValue(lastColumn)

      expect(numericWidth).toBeGreaterThanOrEqual(110)
    })

    it('768px 이하에서 칼럼 헤더가 숨겨져야 함 (카드 레이아웃)', () => {
      statusListCSS = readCSS(
        'src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.responsive.css'
      )

      const mediaBlock768 = extractMediaBlock(statusListCSS, 768)
      expect(mediaBlock768).toBeTruthy()

      // .status-list-header { display: none } 확인
      expect(mediaBlock768).toMatch(/\.status-list-header\s*\{[^}]*display\s*:\s*none/)
    })
  })
})

/**
 * @media (max-width: Npx) 블록의 내용을 추출
 */
function extractMediaBlock(css: string, maxWidth: number): string | null {
  const pattern = new RegExp(
    `@media\\s*\\([^)]*max-width\\s*:\\s*${maxWidth}px[^)]*\\)\\s*\\{`,
    'g'
  )
  const match = pattern.exec(css)
  if (!match) return null

  let depth = 1
  let i = match.index + match[0].length
  const start = i

  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    i++
  }

  return css.slice(start, i - 1)
}

/**
 * CSS 값에서 px 수치를 추출
 * "70px" → 70, "minmax(54px, auto)" → 54
 */
function parsePixelValue(value: string): number {
  // minmax(Npx, ...) 패턴
  const minmaxMatch = value.match(/minmax\s*\(\s*(\d+)px/)
  if (minmaxMatch) return parseInt(minmaxMatch[1], 10)

  // 직접 Npx 패턴
  const directMatch = value.match(/^(\d+)px$/)
  if (directMatch) return parseInt(directMatch[1], 10)

  // auto 등 px가 아닌 값은 0으로 반환 (고정 너비 아님)
  return 0
}
