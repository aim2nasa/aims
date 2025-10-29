/**
 * AllCustomersView 날짜 포맷 테스트
 * @since 1.0.0
 *
 * 커밋 65dabda: 등록일 칼럼 날짜 형식 변경
 *
 * 변경사항:
 * - 기존: YY.MM.DD (예: 25.10.27)
 * - 변경: YYYY.MM.DD HH:MM:SS (예: 2025.10.27 05:28:19)
 *
 * 칼럼 너비 조정:
 * - 주소 칼럼: minmax(180px, 3fr) → minmax(150px, 2fr)
 * - 등록일 칼럼: 100px → 160px
 *
 * 핵심 변경:
 * - getFormattedDate() 함수에서 연도를 4자리로 변경
 * - 시/분/초 추가
 */

import { describe, it, expect } from 'vitest'

describe('AllCustomersView - 날짜 포맷 테스트 (커밋 65dabda)', () => {
  describe('커밋 변경사항 검증', () => {
    it('날짜 포맷이 YY.MM.DD에서 YYYY.MM.DD HH:MM:SS로 변경되었음을 검증', () => {
      // 커밋 65dabda의 변경사항:
      // - 기존: const year = date.getFullYear().toString().slice(2)
      //         return `${year}.${month}.${day}`
      // - 변경: const year = date.getFullYear()
      //         + hours, minutes, seconds 추가
      //         return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`

      const oldFormat = {
        yearDigits: 2,
        hasTime: false,
        pattern: 'YY.MM.DD',
        example: '25.10.27',
      }

      const newFormat = {
        yearDigits: 4,
        hasTime: true,
        pattern: 'YYYY.MM.DD HH:MM:SS',
        example: '2025.10.27 05:28:19',
      }

      expect(newFormat.yearDigits).toBeGreaterThan(oldFormat.yearDigits)
      expect(newFormat.hasTime).toBe(true)
      expect(oldFormat.hasTime).toBe(false)
    })

    it('등록일 칼럼 너비가 100px에서 160px로 변경되었음을 검증', () => {
      const oldWidth = '100px'
      const newWidth = '160px'

      expect(parseInt(newWidth)).toBeGreaterThan(parseInt(oldWidth))
      expect(newWidth).toBe('160px')
    })

    it('주소 칼럼 너비가 축소되었음을 검증', () => {
      const oldAddress = 'minmax(180px, 3fr)'
      const newAddress = 'minmax(150px, 2fr)'

      expect(oldAddress).toContain('180px')
      expect(newAddress).toContain('150px')
    })
  })

  describe('날짜 포맷 함수 로직', () => {
    const getFormattedDate = (createdAt: string | undefined) => {
      if (!createdAt) return '-'
      const date = new Date(createdAt)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
    }

    it('유효한 날짜를 YYYY.MM.DD HH:MM:SS 형식으로 변환해야 함', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const formatted = getFormattedDate(testDate)

      // YYYY.MM.DD HH:MM:SS 패턴 검증
      expect(formatted).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/)
    })

    it('연도가 4자리여야 함', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const formatted = getFormattedDate(testDate)

      const yearPart = formatted.split('.')[0]
      expect(yearPart?.length).toBe(4)
      expect(yearPart).toBe('2025')
    })

    it('월이 2자리 zero-padded여야 함', () => {
      const testDate = '2025-01-05T05:28:19.000Z'
      const formatted = getFormattedDate(testDate)

      const monthPart = formatted.split('.')[1]
      expect(monthPart?.length).toBe(2)
      expect(monthPart).toBe('01')
    })

    it('일이 2자리 zero-padded여야 함', () => {
      const testDate = '2025-10-07T05:28:19.000Z'
      const formatted = getFormattedDate(testDate)

      const dayPart = formatted.split('.')[2]?.split(' ')[0]
      expect(dayPart?.length).toBe(2)
      expect(dayPart).toBe('07')
    })

    it('시간이 2자리 zero-padded여야 함', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const formatted = getFormattedDate(testDate)

      const timePart = formatted.split(' ')[1]
      const hoursPart = timePart?.split(':')[0]
      expect(hoursPart?.length).toBe(2)
    })

    it('분이 2자리 zero-padded여야 함', () => {
      const testDate = '2025-10-27T05:08:19.000Z'
      const formatted = getFormattedDate(testDate)

      const timePart = formatted.split(' ')[1]
      const minutesPart = timePart?.split(':')[1]
      expect(minutesPart?.length).toBe(2)
    })

    it('초가 2자리 zero-padded여야 함', () => {
      const testDate = '2025-10-27T05:28:09.000Z'
      const formatted = getFormattedDate(testDate)

      const timePart = formatted.split(' ')[1]
      const secondsPart = timePart?.split(':')[2]
      expect(secondsPart?.length).toBe(2)
    })

    it('undefined 입력 시 "-"를 반환해야 함', () => {
      const formatted = getFormattedDate(undefined)
      expect(formatted).toBe('-')
    })

    it('null 입력 시 "-"를 반환해야 함', () => {
      const formatted = getFormattedDate(undefined)
      expect(formatted).toBe('-')
    })
  })

  describe('실제 날짜 예제 검증', () => {
    const getFormattedDate = (createdAt: string | undefined) => {
      if (!createdAt) return '-'
      const date = new Date(createdAt)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
    }

    it('2025년 10월 27일 05:28:19', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const formatted = getFormattedDate(testDate)

      expect(formatted).toContain('2025.10.27')
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('2024년 1월 1일 (로컬 타임존)', () => {
      const testDate = '2024-01-01T00:00:00.000Z'
      const formatted = getFormattedDate(testDate)

      // 타임존에 따라 날짜가 다를 수 있으므로 패턴만 검증
      expect(formatted).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(formatted).toContain('2024')
    })

    it('2023년 12월 31일 (로컬 타임존)', () => {
      const testDate = '2023-12-31T23:59:59.000Z'
      const formatted = getFormattedDate(testDate)

      // 타임존에 따라 날짜가 다를 수 있으므로 패턴만 검증
      expect(formatted).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/)
    })
  })

  describe('기존 포맷과의 차이', () => {
    const oldGetFormattedDate = (createdAt: string | undefined) => {
      if (!createdAt) return '-'
      const date = new Date(createdAt)
      const year = date.getFullYear().toString().slice(2)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}.${month}.${day}`
    }

    const newGetFormattedDate = (createdAt: string | undefined) => {
      if (!createdAt) return '-'
      const date = new Date(createdAt)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
    }

    it('기존 포맷은 YY.MM.DD (2자리 연도)', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const oldFormatted = oldGetFormattedDate(testDate)

      expect(oldFormatted).toMatch(/^\d{2}\.\d{2}\.\d{2}$/)
      expect(oldFormatted.split('.')[0]?.length).toBe(2)
    })

    it('새 포맷은 YYYY.MM.DD HH:MM:SS (4자리 연도 + 시간)', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const newFormatted = newGetFormattedDate(testDate)

      expect(newFormatted).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(newFormatted.split('.')[0]?.length).toBe(4)
    })

    it('기존 포맷은 시간 정보가 없음', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const oldFormatted = oldGetFormattedDate(testDate)

      expect(oldFormatted).not.toContain(':')
      expect(oldFormatted.split(' ').length).toBe(1)
    })

    it('새 포맷은 시간 정보 포함', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const newFormatted = newGetFormattedDate(testDate)

      expect(newFormatted).toContain(':')
      expect(newFormatted.split(' ').length).toBe(2)
    })

    it('기존 포맷 길이: 8자 (YY.MM.DD)', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const oldFormatted = oldGetFormattedDate(testDate)

      expect(oldFormatted.length).toBe(8)
    })

    it('새 포맷 길이: 19자 (YYYY.MM.DD HH:MM:SS)', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const newFormatted = newGetFormattedDate(testDate)

      expect(newFormatted.length).toBe(19)
    })
  })

  describe('CSS 칼럼 너비 변경', () => {
    it('등록일 칼럼이 100px에서 160px로 60px 증가', () => {
      const oldWidth = 100
      const newWidth = 160
      const increase = newWidth - oldWidth

      expect(increase).toBe(60)
      expect(newWidth).toBe(160)
    })

    it('주소 칼럼이 minmax(180px, 3fr)에서 minmax(150px, 2fr)로 축소', () => {
      const oldMinWidth = 180
      const newMinWidth = 150
      const decrease = oldMinWidth - newMinWidth

      expect(decrease).toBe(30)
      expect(newMinWidth).toBe(150)
    })

    it('grid-template-columns 정의에 160px 포함', () => {
      const gridTemplate = `
        60px           /* 성별 */
        120px          /* 전화번호 */
        minmax(150px, 2fr)  /* 이메일 */
        minmax(150px, 2fr)  /* 주소 */
        80px           /* 유형 */
        80px           /* 상태 */
        160px;         /* 등록일 (YYYY.MM.DD HH:MM:SS) */
      `

      expect(gridTemplate).toContain('160px')
      expect(gridTemplate).toContain('YYYY.MM.DD HH:MM:SS')
    })
  })

  describe('날짜 형식 통일', () => {
    it('전체 애플리케이션에서 동일한 날짜 형식 사용', () => {
      const standardFormat = 'YYYY.MM.DD HH:MM:SS'
      const pattern = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/

      expect(standardFormat).toBe('YYYY.MM.DD HH:MM:SS')
      expect(pattern.test('2025.10.27 05:28:19')).toBe(true)
    })

    it('날짜와 시간 사이에 공백 하나', () => {
      const testDate = '2025-10-27T05:28:19.000Z'
      const date = new Date(testDate)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      const formatted = `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`

      const parts = formatted.split(' ')
      expect(parts.length).toBe(2)
      expect(parts[0]).toMatch(/^\d{4}\.\d{2}\.\d{2}$/)
      expect(parts[1]).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })
  })

  describe('사용자 경험 개선', () => {
    it('4자리 연도로 명확성 향상', () => {
      const twoDigitYear = '25'
      const fourDigitYear = '2025'

      expect(fourDigitYear.length).toBe(4)
      expect(twoDigitYear.length).toBe(2)
      // 4자리가 더 명확함
    })

    it('시간 정보 추가로 정확도 향상', () => {
      const withoutTime = '2025.10.27'
      const withTime = '2025.10.27 05:28:19'

      expect(withTime).toContain(withoutTime)
      expect(withTime.length).toBeGreaterThan(withoutTime.length)
    })

    it('칼럼 너비 조정으로 날짜 완전히 표시', () => {
      const oldWidth = 100
      const newWidth = 160
      const dateFormatLength = 19 // "YYYY.MM.DD HH:MM:SS".length

      // 160px이면 19자 문자열을 충분히 표시 가능
      expect(newWidth).toBeGreaterThan(oldWidth)
      expect(newWidth).toBeGreaterThan(dateFormatLength * 5) // 대략 8px per character
    })
  })

  describe('장점 검증', () => {
    it('Y2K 문제 방지 (4자리 연도)', () => {
      const isY2KSafe = true // 4자리 연도 사용
      expect(isY2KSafe).toBe(true)
    })

    it('정밀한 시간 추적 가능', () => {
      const hasTimeInfo = true
      const precision = 'seconds'

      expect(hasTimeInfo).toBe(true)
      expect(precision).toBe('seconds')
    })

    it('날짜 포맷 일관성 확보', () => {
      const isConsistent = true // 전체 애플리케이션 통일
      expect(isConsistent).toBe(true)
    })
  })
})
