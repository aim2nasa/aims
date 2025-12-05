/**
 * Type Converter Utilities
 * App.tsx에서 추출된 순수 타입 변환 함수들
 */

/**
 * 값이 plain object인지 확인
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * unknown을 optional string으로 변환
 */
export const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/**
 * unknown을 trimmed string으로 변환 (빈 문자열은 undefined)
 */
export const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * unknown을 finite number로 변환
 */
export const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * 여러 값 중 첫 번째 non-empty string 반환
 */
export const firstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const candidate = toTrimmedString(value)
    if (candidate) {
      return candidate
    }
  }
  return undefined
}
