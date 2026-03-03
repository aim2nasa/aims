/**
 * 초성 필터 타입 정의
 * @description 한글/영문/숫자 초성 필터링을 위한 공통 타입
 */

/**
 * 초성 필터 타입 (한글/영문/숫자)
 */
export type InitialType = 'korean' | 'alphabet' | 'number'

/**
 * 한글 초성 목록
 */
export const KOREAN_INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const

/**
 * 영문 알파벳 목록
 */
export const ALPHABET_INITIALS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] as const

/**
 * 숫자 초성 목록
 */
export const NUMBER_INITIALS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#'] as const
