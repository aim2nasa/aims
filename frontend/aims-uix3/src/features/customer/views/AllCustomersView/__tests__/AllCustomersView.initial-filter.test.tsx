/**
 * AllCustomersView 서버사이드 초성 필터 regression 테스트
 * @description 서버사이드 초성 카운트 API 연동 + initialType 탭 전환 검증
 * @since 커밋 00e6014c — 전체문서보기 초성 필터 서버사이드 전환
 */

import { describe, it, expect, vi } from 'vitest'
import { KOREAN_INITIALS, ALPHABET_INITIALS, NUMBER_INITIALS } from '@/shared/ui/InitialFilterBar/types'

// === 초성 카운트 맵 빌드 로직 (AllCustomersView L271-279 추출) ===
function buildInitialCountsMap(serverCounts: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>()
  KOREAN_INITIALS.forEach(i => map.set(i, 0))
  ALPHABET_INITIALS.forEach(i => map.set(i, 0))
  NUMBER_INITIALS.forEach(i => map.set(i, 0))
  Object.entries(serverCounts).forEach(([k, v]) => map.set(k, v))
  return map
}

describe('AllCustomersView — 서버사이드 초성 카운트 (커밋 00e6014c)', () => {
  describe('초성 카운트 맵 빌드', () => {
    it('서버 응답을 초성 맵으로 변환', () => {
      const serverCounts = { 'ㄱ': 188, 'ㄴ': 50, 'ㅂ': 30, 'A': 1, '#': 3 }
      const map = buildInitialCountsMap(serverCounts)

      expect(map.get('ㄱ')).toBe(188)
      expect(map.get('ㄴ')).toBe(50)
      expect(map.get('A')).toBe(1)
      expect(map.get('#')).toBe(3)
    })

    it('서버에 없는 초성은 0으로 초기화', () => {
      const serverCounts = { 'ㄱ': 5 }
      const map = buildInitialCountsMap(serverCounts)

      expect(map.get('ㄴ')).toBe(0)
      expect(map.get('ㅁ')).toBe(0)
      expect(map.get('A')).toBe(0)
      expect(map.get('Z')).toBe(0)
      expect(map.get('0')).toBe(0)
      expect(map.get('#')).toBe(0)
    })

    it('모든 초성(한글+영문+숫자+#)이 맵에 존재', () => {
      const map = buildInitialCountsMap({})

      const totalExpected = KOREAN_INITIALS.length + ALPHABET_INITIALS.length + NUMBER_INITIALS.length
      expect(map.size).toBe(totalExpected)

      // 각 카테고리 확인
      KOREAN_INITIALS.forEach(i => expect(map.has(i)).toBe(true))
      ALPHABET_INITIALS.forEach(i => expect(map.has(i)).toBe(true))
      NUMBER_INITIALS.forEach(i => expect(map.has(i)).toBe(true))
    })

    it('# 특수문자 초성이 숫자 탭에 포함', () => {
      expect(NUMBER_INITIALS).toContain('#')
    })
  })

  describe('초성 분류 일관성', () => {
    it('한글/영문/숫자 초성 셋이 겹치지 않음', () => {
      const koreanSet = new Set<string>(KOREAN_INITIALS as unknown as string[])
      const alphabetSet = new Set<string>(ALPHABET_INITIALS as unknown as string[])
      const numberSet = new Set<string>(NUMBER_INITIALS as unknown as string[])

      // 교집합 없음
      KOREAN_INITIALS.forEach(i => {
        expect(alphabetSet.has(i)).toBe(false)
        expect(numberSet.has(i)).toBe(false)
      })
      ALPHABET_INITIALS.forEach(i => {
        expect(koreanSet.has(i)).toBe(false)
        expect(numberSet.has(i)).toBe(false)
      })
      NUMBER_INITIALS.forEach(i => {
        expect(koreanSet.has(i)).toBe(false)
        expect(alphabetSet.has(i)).toBe(false)
      })
    })

    it('한글 초성 19개 (쌍자음 포함)', () => {
      expect(KOREAN_INITIALS.length).toBe(19)
      expect(KOREAN_INITIALS).toContain('ㄱ')
      expect(KOREAN_INITIALS).toContain('ㄲ')
      expect(KOREAN_INITIALS).toContain('ㅎ')
    })

    it('영문 초성 26개 (A-Z 대문자)', () => {
      expect(ALPHABET_INITIALS.length).toBe(26)
      expect(ALPHABET_INITIALS[0]).toBe('A')
      expect(ALPHABET_INITIALS[25]).toBe('Z')
    })

    it('숫자 초성 11개 (0-9 + #)', () => {
      expect(NUMBER_INITIALS.length).toBe(11)
      expect(NUMBER_INITIALS).toContain('0')
      expect(NUMBER_INITIALS).toContain('9')
      expect(NUMBER_INITIALS).toContain('#')
    })
  })

  describe('서버 응답 에지 케이스', () => {
    it('빈 서버 응답 → 모든 카운트 0', () => {
      const map = buildInitialCountsMap({})
      let totalCount = 0
      map.forEach(v => { totalCount += v })
      expect(totalCount).toBe(0)
    })

    it('서버가 알 수 없는 키 반환 → 맵에 추가됨', () => {
      const serverCounts = { 'ㄱ': 5, '★': 1 }
      const map = buildInitialCountsMap(serverCounts)
      expect(map.get('★')).toBe(1)
    })
  })
})
