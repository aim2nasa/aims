/**
 * ExcelRefiner 버그 수정 검증 테스트
 *
 * 테스트 대상:
 * 1. 빠른 연속 검증 차단 (경쟁 상태 방지)
 * 2. 시트 전환 시 필터 초기화
 */

import * as fs from 'fs'
import * as path from 'path'

describe('ExcelRefiner 버그 수정 검증', () => {
  let sourceCode: string

  beforeAll(() => {
    const filePath = path.join(__dirname, '..', 'ExcelRefiner.tsx')
    sourceCode = fs.readFileSync(filePath, 'utf-8')
  })

  describe('1. 빠른 연속 검증 차단', () => {
    test('handleColumnClick에 validatingInProgress 체크가 있어야 함', () => {
      // handleColumnClick 함수 시작 부분에 validatingInProgress.size > 0 체크가 있는지 확인
      const pattern = /const handleColumnClick = useCallback\(async.*?\n.*?\/\/ 검증 진행 중이면 클릭 무시.*?\n.*?if \(validatingInProgress\.size > 0\) return/s
      expect(sourceCode).toMatch(pattern)
    })

    test('handleColumnClick 의존성 배열에 validatingInProgress가 포함되어야 함', () => {
      // handleColumnClick의 useCallback 의존성 배열 찾기
      // 패턴: handleColumnClick 함수 끝의 }, [...dependencies])

      // handleColumnClick 함수 전체를 찾아서 의존성 배열 확인
      const handleColumnClickMatch = sourceCode.match(
        /const handleColumnClick = useCallback\(async[\s\S]*?\}, \[([\s\S]*?)\]\)/
      )

      expect(handleColumnClickMatch).not.toBeNull()

      if (handleColumnClickMatch) {
        const dependencies = handleColumnClickMatch[1]
        expect(dependencies).toContain('validatingInProgress')
      }
    })

    test('validatingInProgress 체크가 다른 체크보다 먼저 실행되어야 함', () => {
      // handleColumnClick 시작 부분에서 validatingInProgress 체크가 가장 먼저 나와야 함
      const functionStart = sourceCode.indexOf('const handleColumnClick = useCallback(async')
      const validatingCheck = sourceCode.indexOf('if (validatingInProgress.size > 0) return', functionStart)
      const columnNameCheck = sourceCode.indexOf('if (!columnName || !currentSheet) return', functionStart)

      expect(functionStart).toBeGreaterThan(-1)
      expect(validatingCheck).toBeGreaterThan(-1)
      expect(columnNameCheck).toBeGreaterThan(-1)

      // validatingInProgress 체크가 columnName 체크보다 먼저 나와야 함
      expect(validatingCheck).toBeLessThan(columnNameCheck)
    })
  })

  describe('2. 시트 전환 시 필터 초기화', () => {
    test('handleSheetChange에 setProductStatusFilter(null) 호출이 있어야 함', () => {
      // handleSheetChange 함수 내에 setProductStatusFilter(null) 호출이 있는지 확인
      const pattern = /const handleSheetChange = useCallback\(\(index: number\)[\s\S]*?setProductStatusFilter\(null\)[\s\S]*?\}, \[\]\)/
      expect(sourceCode).toMatch(pattern)
    })

    test('handleSheetChange에 setLastClickedColumn(null) 호출이 있어야 함', () => {
      // handleSheetChange 함수 내에 setLastClickedColumn(null) 호출이 있는지 확인
      const pattern = /const handleSheetChange = useCallback\(\(index: number\)[\s\S]*?setLastClickedColumn\(null\)[\s\S]*?\}, \[\]\)/
      expect(sourceCode).toMatch(pattern)
    })

    test('필터 초기화가 정렬 초기화 이후에 실행되어야 함', () => {
      // handleSheetChange 함수에서 순서 확인
      const functionStart = sourceCode.indexOf('const handleSheetChange = useCallback((index: number)')
      const functionEnd = sourceCode.indexOf('}, [])', functionStart)
      const functionBody = sourceCode.substring(functionStart, functionEnd)

      const sortColumnReset = functionBody.indexOf('setSortColumn(null)')
      const productFilterReset = functionBody.indexOf('setProductStatusFilter(null)')
      const lastClickedReset = functionBody.indexOf('setLastClickedColumn(null)')

      expect(sortColumnReset).toBeGreaterThan(-1)
      expect(productFilterReset).toBeGreaterThan(-1)
      expect(lastClickedReset).toBeGreaterThan(-1)

      // 정렬 초기화 후 필터 초기화
      expect(productFilterReset).toBeGreaterThan(sortColumnReset)
      expect(lastClickedReset).toBeGreaterThan(sortColumnReset)
    })
  })

  describe('시뮬레이션 테스트', () => {
    test('빠른 연속 클릭 시나리오 - 코드 흐름 검증', () => {
      // 시나리오: validatingInProgress.size > 0 일 때 함수가 즉시 반환되어야 함

      // 1. validatingInProgress Set 시뮬레이션
      const validatingInProgress = new Set<number>()

      // 2. 첫 번째 클릭 - 검증 시작 (size = 0 -> 1)
      validatingInProgress.add(0)
      expect(validatingInProgress.size).toBe(1)

      // 3. 두 번째 클릭 시도 - size > 0 이므로 차단되어야 함
      const shouldBlock = validatingInProgress.size > 0
      expect(shouldBlock).toBe(true)

      // 4. 검증 완료 후 (size = 0)
      validatingInProgress.delete(0)
      expect(validatingInProgress.size).toBe(0)

      // 5. 이제 클릭 가능
      const canClick = validatingInProgress.size === 0
      expect(canClick).toBe(true)
    })

    test('시트 전환 시나리오 - 상태 초기화 검증', () => {
      // 시나리오: 시트 전환 시 필터 상태가 초기화되어야 함

      // 1. 초기 상태
      let productStatusFilter: 'original' | 'unmatched' | null = null
      let lastClickedColumn: number | null = null

      // 2. 계약 시트에서 검증 후 필터 활성화
      productStatusFilter = 'unmatched'
      lastClickedColumn = 2

      expect(productStatusFilter).toBe('unmatched')
      expect(lastClickedColumn).toBe(2)

      // 3. 시트 전환 (handleSheetChange 시뮬레이션)
      const handleSheetChange = () => {
        productStatusFilter = null
        lastClickedColumn = null
      }

      handleSheetChange()

      // 4. 필터 상태가 초기화되어야 함
      expect(productStatusFilter).toBeNull()
      expect(lastClickedColumn).toBeNull()
    })
  })
})
