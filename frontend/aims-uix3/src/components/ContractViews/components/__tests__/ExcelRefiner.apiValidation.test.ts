/**
 * P1 작업 검증 테스트
 *
 * 테스트 대상:
 * 1. API 응답 검증 및 기본값 설정 (P1-1)
 * 2. 에러 메시지 분류 로직 (P1-2)
 */

import * as fs from 'fs'
import * as path from 'path'

describe('P1: API 응답 검증 및 에러 메시지 개선', () => {
  let componentSource: string

  beforeAll(() => {
    const componentPath = path.join(__dirname, '..', 'ExcelRefiner.tsx')
    componentSource = fs.readFileSync(componentPath, 'utf-8')
  })

  describe('P1-1: API 응답 검증 강화', () => {
    test('bulkImportCustomers 결과에 기본값 설정이 있어야 함', () => {
      // rawResult 변수 사용 확인
      expect(componentSource).toContain('const rawResult = await CustomerService.bulkImportCustomers')

      // 숫자 필드 기본값 확인 (nullish coalescing)
      expect(componentSource).toContain('rawResult?.createdCount ?? 0')
      expect(componentSource).toContain('rawResult?.updatedCount ?? 0')
      expect(componentSource).toContain('rawResult?.skippedCount ?? 0')
      expect(componentSource).toContain('rawResult?.errorCount ?? 0')
    })

    test('배열 필드에 Array.isArray 검증이 있어야 함', () => {
      expect(componentSource).toContain("Array.isArray(rawResult?.created)")
      expect(componentSource).toContain("Array.isArray(rawResult?.updated)")
      expect(componentSource).toContain("Array.isArray(rawResult?.skipped)")
      expect(componentSource).toContain("Array.isArray(rawResult?.errors)")
    })

    test('createContractsBulk 결과에 기본값 설정이 있어야 함', () => {
      // rawContractResult 변수 사용 확인
      expect(componentSource).toContain('const rawContractResult = bulkResult?.data')

      // 숫자 필드 기본값 확인
      expect(componentSource).toContain('rawContractResult?.createdCount ?? 0')
      expect(componentSource).toContain('rawContractResult?.updatedCount ?? 0')
    })
  })

  describe('P1-2: 에러 메시지 분류', () => {
    test('네트워크 오류 분류가 있어야 함', () => {
      expect(componentSource).toContain("message.includes('network')")
      expect(componentSource).toContain("message.includes('fetch')")
      expect(componentSource).toContain("message.includes('failed to fetch')")
      expect(componentSource).toContain("errorTitle = '네트워크 오류'")
    })

    test('인증 오류 분류가 있어야 함', () => {
      expect(componentSource).toContain("message.includes('401')")
      expect(componentSource).toContain("message.includes('unauthorized')")
      expect(componentSource).toContain("message.includes('token')")
      expect(componentSource).toContain("errorTitle = '인증 오류'")
    })

    test('권한 오류 분류가 있어야 함', () => {
      expect(componentSource).toContain("message.includes('403')")
      expect(componentSource).toContain("message.includes('forbidden')")
      expect(componentSource).toContain("errorTitle = '권한 오류'")
    })

    test('서버 오류 분류가 있어야 함', () => {
      expect(componentSource).toContain("message.includes('500')")
      expect(componentSource).toContain("message.includes('server')")
      expect(componentSource).toContain("errorTitle = '서버 오류'")
    })

    test('사용자 친화적 에러 메시지가 있어야 함', () => {
      expect(componentSource).toContain('서버에 연결할 수 없습니다')
      expect(componentSource).toContain('로그인이 만료되었습니다')
      expect(componentSource).toContain('이 작업을 수행할 권한이 없습니다')
      expect(componentSource).toContain('서버에서 오류가 발생했습니다')
    })
  })

  describe('에러 분류 로직 시뮬레이션', () => {
    // 에러 분류 로직을 직접 테스트
    const classifyError = (errorMessage: string) => {
      const message = errorMessage.toLowerCase()

      if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
        return { title: '네트워크 오류', message: '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.' }
      } else if (message.includes('401') || message.includes('unauthorized') || message.includes('token')) {
        return { title: '인증 오류', message: '로그인이 만료되었습니다. 다시 로그인해주세요.' }
      } else if (message.includes('403') || message.includes('forbidden')) {
        return { title: '권한 오류', message: '이 작업을 수행할 권한이 없습니다.' }
      } else if (message.includes('500') || message.includes('server')) {
        return { title: '서버 오류', message: '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }
      }
      return { title: '일괄등록 오류', message: errorMessage }
    }

    test('네트워크 오류 분류', () => {
      expect(classifyError('Failed to fetch')).toEqual({
        title: '네트워크 오류',
        message: '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.'
      })
      expect(classifyError('NetworkError when attempting to fetch resource')).toEqual({
        title: '네트워크 오류',
        message: '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.'
      })
    })

    test('인증 오류 분류', () => {
      expect(classifyError('401 Unauthorized')).toEqual({
        title: '인증 오류',
        message: '로그인이 만료되었습니다. 다시 로그인해주세요.'
      })
      expect(classifyError('Token expired')).toEqual({
        title: '인증 오류',
        message: '로그인이 만료되었습니다. 다시 로그인해주세요.'
      })
    })

    test('권한 오류 분류', () => {
      expect(classifyError('403 Forbidden')).toEqual({
        title: '권한 오류',
        message: '이 작업을 수행할 권한이 없습니다.'
      })
    })

    test('서버 오류 분류', () => {
      expect(classifyError('500 Internal Server Error')).toEqual({
        title: '서버 오류',
        message: '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      })
    })

    test('기타 오류는 원본 메시지 유지', () => {
      expect(classifyError('Custom error message')).toEqual({
        title: '일괄등록 오류',
        message: 'Custom error message'
      })
    })
  })

  describe('API 응답 기본값 시뮬레이션', () => {
    // API 응답 정규화 로직을 직접 테스트
    const normalizeApiResponse = (rawResult: Record<string, unknown> | null | undefined) => ({
      createdCount: rawResult?.createdCount ?? 0,
      updatedCount: rawResult?.updatedCount ?? 0,
      skippedCount: rawResult?.skippedCount ?? 0,
      errorCount: rawResult?.errorCount ?? 0,
      created: Array.isArray(rawResult?.created) ? rawResult.created : [],
      updated: Array.isArray(rawResult?.updated) ? rawResult.updated : [],
      skipped: Array.isArray(rawResult?.skipped) ? rawResult.skipped : [],
      errors: Array.isArray(rawResult?.errors) ? rawResult.errors : []
    })

    test('정상 응답 처리', () => {
      const rawResult = {
        createdCount: 5,
        updatedCount: 3,
        skippedCount: 1,
        errorCount: 0,
        created: [{ name: 'A' }, { name: 'B' }],
        updated: [{ name: 'C' }],
        skipped: [],
        errors: []
      }

      const result = normalizeApiResponse(rawResult)
      expect(result.createdCount).toBe(5)
      expect(result.created).toHaveLength(2)
    })

    test('undefined 응답 처리', () => {
      const result = normalizeApiResponse(undefined)

      expect(result.createdCount).toBe(0)
      expect(result.updatedCount).toBe(0)
      expect(result.skippedCount).toBe(0)
      expect(result.errorCount).toBe(0)
      expect(result.created).toEqual([])
      expect(result.updated).toEqual([])
      expect(result.skipped).toEqual([])
      expect(result.errors).toEqual([])
    })

    test('null 응답 처리', () => {
      const result = normalizeApiResponse(null)

      expect(result.createdCount).toBe(0)
      expect(result.created).toEqual([])
    })

    test('부분 응답 처리 (일부 필드만 있는 경우)', () => {
      const rawResult = {
        createdCount: 10,
        // updatedCount 없음
        // created 없음
        errors: 'not an array'  // 잘못된 타입
      }

      const result = normalizeApiResponse(rawResult)

      expect(result.createdCount).toBe(10)
      expect(result.updatedCount).toBe(0)  // 기본값
      expect(result.created).toEqual([])   // 기본값
      expect(result.errors).toEqual([])    // 배열이 아니면 빈 배열
    })

    test('숫자 필드가 undefined인 경우', () => {
      const rawResult = {
        createdCount: undefined,
        updatedCount: null,
        skippedCount: 0,
        errorCount: NaN  // NaN은 nullish가 아님
      }

      const result = normalizeApiResponse(rawResult)

      expect(result.createdCount).toBe(0)  // undefined → 0
      expect(result.updatedCount).toBe(0)  // null → 0
      expect(result.skippedCount).toBe(0)  // 0 유지
      expect(result.errorCount).toBe(NaN)  // NaN은 그대로 (주의 필요)
    })
  })
})
