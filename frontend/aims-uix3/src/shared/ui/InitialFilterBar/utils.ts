/**
 * 초성 관련 유틸리티 함수
 */

import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from './types'

/**
 * 한글 초성 추출
 * @param char 첫 글자
 * @returns 초성 또는 null
 */
export function getKoreanInitial(char: string): string | null {
  const code = char.charCodeAt(0)

  // 한글 유니코드 범위 체크 (가 ~ 힣)
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const index = Math.floor((code - 0xAC00) / 588)
    return KOREAN_INITIALS[index] || null
  }

  // 이미 초성인 경우 (ㄱ ~ ㅎ)
  if (KOREAN_INITIALS.includes(char as typeof KOREAN_INITIALS[number])) {
    return char
  }

  return null
}

/**
 * 영문 초성(첫 글자) 추출
 * @param char 첫 글자
 * @returns 대문자 알파벳 또는 null
 */
export function getAlphabetInitial(char: string): string | null {
  const upper = char.toUpperCase()
  if (ALPHABET_INITIALS.includes(upper as typeof ALPHABET_INITIALS[number])) {
    return upper
  }
  return null
}

/**
 * 숫자 초성 추출
 * @param char 첫 글자
 * @returns 숫자 또는 null
 */
export function getNumberInitial(char: string): string | null {
  if (NUMBER_INITIALS.includes(char as typeof NUMBER_INITIALS[number])) {
    return char
  }
  return null
}

/**
 * 문자열에서 초성 추출 (한글/영문/숫자 자동 감지)
 * @param str 대상 문자열
 * @returns { initial, type } 초성과 타입
 */
export function extractInitial(str: string): { initial: string | null; type: 'korean' | 'alphabet' | 'number' | null } {
  if (!str || str.length === 0) {
    return { initial: null, type: null }
  }

  const firstChar = str.charAt(0)

  // 한글 체크
  const koreanInitial = getKoreanInitial(firstChar)
  if (koreanInitial) {
    return { initial: koreanInitial, type: 'korean' }
  }

  // 영문 체크
  const alphabetInitial = getAlphabetInitial(firstChar)
  if (alphabetInitial) {
    return { initial: alphabetInitial, type: 'alphabet' }
  }

  // 숫자 체크
  const numberInitial = getNumberInitial(firstChar)
  if (numberInitial) {
    return { initial: numberInitial, type: 'number' }
  }

  return { initial: null, type: null }
}

/**
 * 초성별 카운트 계산
 * @param items 아이템 배열
 * @param getNameFn 이름 추출 함수
 * @returns 초성별 카운트 Map
 */
export function calculateInitialCounts<T>(
  items: T[],
  getNameFn: (item: T) => string
): Map<string, number> {
  const counts = new Map<string, number>()

  // 모든 초성 0으로 초기화
  KOREAN_INITIALS.forEach(initial => counts.set(initial, 0))
  ALPHABET_INITIALS.forEach(initial => counts.set(initial, 0))
  NUMBER_INITIALS.forEach(initial => counts.set(initial, 0))

  // 카운트 계산
  items.forEach(item => {
    const name = getNameFn(item)
    const { initial } = extractInitial(name)
    if (initial) {
      counts.set(initial, (counts.get(initial) || 0) + 1)
    }
  })

  return counts
}

/**
 * 초성으로 아이템 필터링
 * @param items 아이템 배열
 * @param selectedInitial 선택된 초성
 * @param getNameFn 이름 추출 함수
 * @returns 필터링된 아이템 배열
 */
export function filterByInitial<T>(
  items: T[],
  selectedInitial: string | null,
  getNameFn: (item: T) => string
): T[] {
  if (!selectedInitial) {
    return items
  }

  return items.filter(item => {
    const name = getNameFn(item)
    const { initial } = extractInitial(name)
    return initial === selectedInitial
  })
}
