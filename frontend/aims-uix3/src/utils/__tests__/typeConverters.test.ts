/**
 * Phase 1.1 테스트: typeConverters.ts
 *
 * 테스트 대상:
 * - isPlainObject
 * - toOptionalString
 * - toTrimmedString
 * - toFiniteNumber
 * - firstNonEmptyString
 */

import {
  isPlainObject,
  toOptionalString,
  toTrimmedString,
  toFiniteNumber,
  firstNonEmptyString
} from '../typeConverters'

describe('typeConverters', () => {
  describe('isPlainObject', () => {
    test('plain object는 true 반환', () => {
      expect(isPlainObject({})).toBe(true)
      expect(isPlainObject({ a: 1 })).toBe(true)
      expect(isPlainObject({ nested: { value: 'test' } })).toBe(true)
    })

    test('null은 false 반환', () => {
      expect(isPlainObject(null)).toBe(false)
    })

    test('undefined는 false 반환', () => {
      expect(isPlainObject(undefined)).toBe(false)
    })

    test('primitive 타입은 false 반환', () => {
      expect(isPlainObject('string')).toBe(false)
      expect(isPlainObject(123)).toBe(false)
      expect(isPlainObject(true)).toBe(false)
    })

    test('array도 object이므로 true 반환', () => {
      // JavaScript에서 배열도 object 타입
      expect(isPlainObject([])).toBe(true)
      expect(isPlainObject([1, 2, 3])).toBe(true)
    })
  })

  describe('toOptionalString', () => {
    test('string은 그대로 반환', () => {
      expect(toOptionalString('hello')).toBe('hello')
      expect(toOptionalString('')).toBe('')
      expect(toOptionalString('  spaces  ')).toBe('  spaces  ')
    })

    test('non-string은 undefined 반환', () => {
      expect(toOptionalString(123)).toBeUndefined()
      expect(toOptionalString(null)).toBeUndefined()
      expect(toOptionalString(undefined)).toBeUndefined()
      expect(toOptionalString({})).toBeUndefined()
      expect(toOptionalString([])).toBeUndefined()
    })
  })

  describe('toTrimmedString', () => {
    test('string은 trim하여 반환', () => {
      expect(toTrimmedString('hello')).toBe('hello')
      expect(toTrimmedString('  hello  ')).toBe('hello')
      expect(toTrimmedString('\n\ttab\n')).toBe('tab')
    })

    test('빈 문자열이나 공백만 있는 문자열은 undefined 반환', () => {
      expect(toTrimmedString('')).toBeUndefined()
      expect(toTrimmedString('   ')).toBeUndefined()
      expect(toTrimmedString('\n\t')).toBeUndefined()
    })

    test('non-string은 undefined 반환', () => {
      expect(toTrimmedString(123)).toBeUndefined()
      expect(toTrimmedString(null)).toBeUndefined()
      expect(toTrimmedString(undefined)).toBeUndefined()
    })
  })

  describe('toFiniteNumber', () => {
    test('finite number는 그대로 반환', () => {
      expect(toFiniteNumber(0)).toBe(0)
      expect(toFiniteNumber(123)).toBe(123)
      expect(toFiniteNumber(-456.78)).toBe(-456.78)
      expect(toFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    })

    test('Infinity는 undefined 반환', () => {
      expect(toFiniteNumber(Infinity)).toBeUndefined()
      expect(toFiniteNumber(-Infinity)).toBeUndefined()
    })

    test('NaN은 undefined 반환', () => {
      expect(toFiniteNumber(NaN)).toBeUndefined()
    })

    test('non-number는 undefined 반환', () => {
      expect(toFiniteNumber('123')).toBeUndefined()
      expect(toFiniteNumber(null)).toBeUndefined()
      expect(toFiniteNumber(undefined)).toBeUndefined()
    })
  })

  describe('firstNonEmptyString', () => {
    test('첫 번째 non-empty string 반환', () => {
      expect(firstNonEmptyString('first', 'second')).toBe('first')
      expect(firstNonEmptyString('', 'second')).toBe('second')
      expect(firstNonEmptyString('   ', 'second')).toBe('second')
      expect(firstNonEmptyString(null, undefined, 'third')).toBe('third')
    })

    test('모든 값이 empty면 undefined 반환', () => {
      expect(firstNonEmptyString()).toBeUndefined()
      expect(firstNonEmptyString('')).toBeUndefined()
      expect(firstNonEmptyString('', '   ', null, undefined)).toBeUndefined()
    })

    test('non-string은 건너뜀', () => {
      expect(firstNonEmptyString(123, {}, [], 'valid')).toBe('valid')
    })

    test('반환된 string은 trim됨', () => {
      expect(firstNonEmptyString('  trimmed  ')).toBe('trimmed')
    })
  })
})
