/**
 * treeBuilders 유틸리티 Regression 테스트
 * @description 트리 빌더의 초성 추출 함수 검증
 * @regression 커밋 06a73c6b, e0709f2a
 */

import { describe, it, expect } from 'vitest'
import {
  getKoreanInitial,
  getAlphabetInitial,
  getNumberInitial,
  getNameInitial,
  getDocumentDate,
} from '../utils/treeBuilders'

// ============================================================
// 한글 초성 추출
// ============================================================

describe('getKoreanInitial', () => {
  it('완성형 한글에서 초성을 추출한다', () => {
    expect(getKoreanInitial('가')).toBe('ㄱ')
    expect(getKoreanInitial('나')).toBe('ㄴ')
    expect(getKoreanInitial('다')).toBe('ㄷ')
    expect(getKoreanInitial('라')).toBe('ㄹ')
    expect(getKoreanInitial('마')).toBe('ㅁ')
    expect(getKoreanInitial('바')).toBe('ㅂ')
    expect(getKoreanInitial('사')).toBe('ㅅ')
    expect(getKoreanInitial('아')).toBe('ㅇ')
    expect(getKoreanInitial('자')).toBe('ㅈ')
    expect(getKoreanInitial('차')).toBe('ㅊ')
    expect(getKoreanInitial('카')).toBe('ㅋ')
    expect(getKoreanInitial('타')).toBe('ㅌ')
    expect(getKoreanInitial('파')).toBe('ㅍ')
    expect(getKoreanInitial('하')).toBe('ㅎ')
  })

  it('쌍자음 초성을 추출한다', () => {
    expect(getKoreanInitial('까')).toBe('ㄲ')
    expect(getKoreanInitial('따')).toBe('ㄸ')
    expect(getKoreanInitial('빠')).toBe('ㅃ')
    expect(getKoreanInitial('싸')).toBe('ㅆ')
    expect(getKoreanInitial('짜')).toBe('ㅉ')
  })

  it('고객 이름에서 초성을 추출한다', () => {
    expect(getKoreanInitial('홍길동')).toBe('ㅎ')
    expect(getKoreanInitial('김영희')).toBe('ㄱ')
    expect(getKoreanInitial('이철수')).toBe('ㅇ')
  })

  it('한글 자음(ㄱ-ㅎ)은 그대로 반환한다', () => {
    expect(getKoreanInitial('ㄱ')).toBe('ㄱ')
    expect(getKoreanInitial('ㅎ')).toBe('ㅎ')
  })

  it('빈 문자열이면 빈 문자열을 반환한다', () => {
    expect(getKoreanInitial('')).toBe('')
  })

  it('영문자는 빈 문자열을 반환한다', () => {
    expect(getKoreanInitial('A')).toBe('')
    expect(getKoreanInitial('hello')).toBe('')
  })

  it('숫자는 빈 문자열을 반환한다', () => {
    expect(getKoreanInitial('123')).toBe('')
  })
})

// ============================================================
// 영문 알파벳 초성 추출
// ============================================================

describe('getAlphabetInitial', () => {
  it('대문자를 반환한다', () => {
    expect(getAlphabetInitial('Apple')).toBe('A')
    expect(getAlphabetInitial('Zebra')).toBe('Z')
  })

  it('소문자도 대문자로 변환하여 반환한다', () => {
    expect(getAlphabetInitial('apple')).toBe('A')
    expect(getAlphabetInitial('zulu')).toBe('Z')
  })

  it('빈 문자열이면 빈 문자열을 반환한다', () => {
    expect(getAlphabetInitial('')).toBe('')
  })

  it('한글이면 빈 문자열을 반환한다', () => {
    expect(getAlphabetInitial('가나다')).toBe('')
  })

  it('숫자면 빈 문자열을 반환한다', () => {
    expect(getAlphabetInitial('123')).toBe('')
  })
})

// ============================================================
// 숫자 초성 추출
// ============================================================

describe('getNumberInitial', () => {
  it('첫 글자가 숫자면 해당 숫자를 반환한다', () => {
    expect(getNumberInitial('0번')).toBe('0')
    expect(getNumberInitial('1차')).toBe('1')
    expect(getNumberInitial('9호')).toBe('9')
  })

  it('빈 문자열이면 빈 문자열을 반환한다', () => {
    expect(getNumberInitial('')).toBe('')
  })

  it('영문이면 빈 문자열을 반환한다', () => {
    expect(getNumberInitial('abc')).toBe('')
  })

  it('한글이면 빈 문자열을 반환한다', () => {
    expect(getNumberInitial('가나다')).toBe('')
  })
})

// ============================================================
// getNameInitial (타입별 위임)
// ============================================================

describe('getNameInitial', () => {
  it('korean 타입일 때 한글 초성을 추출한다', () => {
    expect(getNameInitial('홍길동', 'korean')).toBe('ㅎ')
  })

  it('alphabet 타입일 때 영문 초성을 추출한다', () => {
    expect(getNameInitial('Apple', 'alphabet')).toBe('A')
  })

  it('number 타입일 때 숫자 초성을 추출한다', () => {
    expect(getNameInitial('3호', 'number')).toBe('3')
  })
})

// ============================================================
// getDocumentDate 우선순위
// ============================================================

describe('getDocumentDate', () => {
  it('upload.uploaded_at이 최우선이다', () => {
    const doc = {
      upload: { uploaded_at: '2026-03-01T00:00:00Z' },
      uploaded_at: '2026-01-01T00:00:00Z',
      created_at: '2025-12-01T00:00:00Z',
    } as unknown as Parameters<typeof getDocumentDate>[0]

    expect(getDocumentDate(doc)).toBe('2026-03-01T00:00:00Z')
  })

  it('upload.timestamp이 두 번째 우선이다', () => {
    const doc = {
      upload: { timestamp: '2026-02-01T00:00:00Z' },
      uploaded_at: '2026-01-01T00:00:00Z',
    } as unknown as Parameters<typeof getDocumentDate>[0]

    expect(getDocumentDate(doc)).toBe('2026-02-01T00:00:00Z')
  })

  it('upload 객체가 없으면 uploaded_at을 사용한다', () => {
    const doc = {
      uploaded_at: '2026-01-01T00:00:00Z',
      created_at: '2025-12-01T00:00:00Z',
    } as unknown as Parameters<typeof getDocumentDate>[0]

    expect(getDocumentDate(doc)).toBe('2026-01-01T00:00:00Z')
  })

  it('uploaded_at도 없으면 created_at을 사용한다', () => {
    const doc = {
      created_at: '2025-12-01T00:00:00Z',
    } as unknown as Parameters<typeof getDocumentDate>[0]

    expect(getDocumentDate(doc)).toBe('2025-12-01T00:00:00Z')
  })

  it('아무 날짜도 없으면 undefined를 반환한다', () => {
    const doc = {} as unknown as Parameters<typeof getDocumentDate>[0]
    expect(getDocumentDate(doc)).toBeUndefined()
  })
})
