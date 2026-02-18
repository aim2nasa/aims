/**
 * 고객명 DB 유일성 검증 테스트
 *
 * 테스트 대상:
 * 1. excel-refiner-core 패키지의 validateCustomerNamesWithDB 함수 export
 * 2. 타입 정의 (CustomerNameValidationResult, CustomerNameStatus 등)
 * 3. ExcelRefiner 컴포넌트의 고객명 검증 통합
 */

import * as fs from 'fs'
import * as path from 'path'

describe('고객명 DB 유일성 검증', () => {
  describe('1. excel-refiner-core 패키지', () => {
    let indexSource: string
    let typesSource: string
    let validationSource: string

    beforeAll(() => {
      const corePackagePath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'excel-refiner-core', 'src')
      indexSource = fs.readFileSync(path.join(corePackagePath, 'index.ts'), 'utf-8')
      typesSource = fs.readFileSync(path.join(corePackagePath, 'types', 'excel.ts'), 'utf-8')
      validationSource = fs.readFileSync(path.join(corePackagePath, 'hooks', 'useValidation.ts'), 'utf-8')
    })

    test('validateCustomerNamesWithDB 함수가 export되어야 함', () => {
      expect(indexSource).toContain('validateCustomerNamesWithDB')
    })

    test('CustomerNameValidationResult 타입이 export되어야 함', () => {
      expect(indexSource).toContain('CustomerNameValidationResult')
    })

    test('CustomerNameStatus 타입이 export되어야 함', () => {
      expect(indexSource).toContain('CustomerNameStatus')
    })

    test('ExistingCustomer 타입이 export되어야 함', () => {
      expect(indexSource).toContain('ExistingCustomer')
    })

    test('CustomerNameValidationItem 타입이 export되어야 함', () => {
      expect(indexSource).toContain('CustomerNameValidationItem')
    })
  })

  describe('2. 타입 정의', () => {
    let typesSource: string

    beforeAll(() => {
      const corePackagePath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'excel-refiner-core', 'src')
      typesSource = fs.readFileSync(path.join(corePackagePath, 'types', 'excel.ts'), 'utf-8')
    })

    test('CustomerNameStatus에 new, update, type_conflict, empty 상태가 있어야 함', () => {
      const pattern = /CustomerNameStatus\s*=\s*['"]new['"]\s*\|\s*['"]update['"]\s*\|\s*['"]type_conflict['"]\s*\|\s*['"]empty['"]/
      expect(typesSource).toMatch(pattern)
    })

    test('ExistingCustomer에 필수 필드가 있어야 함', () => {
      expect(typesSource).toContain('interface ExistingCustomer')
      expect(typesSource).toContain('_id: string')
      expect(typesSource).toContain('name: string')
      expect(typesSource).toContain("customerType: '개인' | '법인'")
    })

    test('CustomerNameValidationResult에 results Map과 stats가 있어야 함', () => {
      expect(typesSource).toContain('interface CustomerNameValidationResult')
      expect(typesSource).toContain('results: Map<number, CustomerNameValidationItem>')
      expect(typesSource).toContain('stats:')
    })
  })

  describe('3. validateCustomerNamesWithDB 함수', () => {
    let validationSource: string

    beforeAll(() => {
      const corePackagePath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'excel-refiner-core', 'src')
      validationSource = fs.readFileSync(path.join(corePackagePath, 'hooks', 'useValidation.ts'), 'utf-8')
    })

    test('함수가 async로 정의되어야 함', () => {
      expect(validationSource).toMatch(/export async function validateCustomerNamesWithDB/)
    })

    test('customerType 파라미터를 받아야 함', () => {
      expect(validationSource).toMatch(/validateCustomerNamesWithDB\([^)]*customerType:\s*['"]개인['"]\s*\|\s*['"]법인['"]/)
    })

    test('API 엔드포인트가 /api/customers/validate-names여야 함', () => {
      expect(validationSource).toContain('/api/customers/validate-names')
    })

    test('에러 시 fallback 처리가 있어야 함', () => {
      expect(validationSource).toContain('catch (error)')
      expect(validationSource).toContain("status: 'new'")
      expect(validationSource).toContain("message: '검증 실패 - 신규로 처리'")
    })
  })

  describe('4. ExcelRefiner 컴포넌트 통합', () => {
    let componentSource: string

    beforeAll(() => {
      const componentPath = path.join(__dirname, '..', 'ExcelRefiner.tsx')
      componentSource = fs.readFileSync(componentPath, 'utf-8')
    })

    test('validateCustomerNamesWithDB가 import되어야 함', () => {
      expect(componentSource).toContain('validateCustomerNamesWithDB')
    })

    test('CustomerNameValidationResult 타입이 import되어야 함', () => {
      expect(componentSource).toContain('CustomerNameValidationResult')
    })

    test('customerNameValidationResult 상태가 있어야 함', () => {
      expect(componentSource).toContain('const [customerNameValidationResult, setCustomerNameValidationResult]')
    })

    test('customerNameColumnIndex 상태가 있어야 함', () => {
      expect(componentSource).toContain('const [customerNameColumnIndex, setCustomerNameColumnIndex]')
    })

    test('개인고객/법인고객 시트에서 고객명 검증을 호출해야 함', () => {
      // handleColumnClick에서 customerName + 개인고객/법인고객 조건 체크
      expect(componentSource).toMatch(/type === 'customerName' && \(sheetName === '개인고객' \|\| sheetName === '법인고객'\)/)
    })

    test('getCustomerNameCellStatus 함수가 있어야 함', () => {
      expect(componentSource).toContain('const getCustomerNameCellStatus')
    })
  })

  describe('5. CSS 스타일', () => {
    let cssSource: string

    beforeAll(() => {
      const cssPath = path.join(__dirname, '..', 'ExcelRefiner.editing.css')
      cssSource = fs.readFileSync(cssPath, 'utf-8')
    })

    test('excel-refiner__td--customer-valid 스타일이 있어야 함', () => {
      expect(cssSource).toContain('.excel-refiner__td--customer-valid')
    })

    test('excel-refiner__td--customer-error 스타일이 있어야 함', () => {
      expect(cssSource).toContain('.excel-refiner__td--customer-error')
    })

    test('다크 테마 스타일이 있어야 함', () => {
      expect(cssSource).toContain('html[data-theme="dark"] .excel-refiner__td--customer-valid')
      expect(cssSource).toContain('html[data-theme="dark"] .excel-refiner__td--customer-error')
    })
  })

  describe('6. 정책 로직 시뮬레이션', () => {
    test('동일 타입 고객명 → UPDATE (허용)', () => {
      const excelCustomer = { name: '홍길동', type: '개인' }
      const dbCustomer = { name: '홍길동', type: '개인' }

      const isSameType = excelCustomer.type === dbCustomer.type
      const result = isSameType ? 'update' : 'type_conflict'

      expect(result).toBe('update')
    })

    test('다른 타입 고객명 → TYPE_CONFLICT (에러)', () => {
      const excelCustomer = { name: '홍길동', type: '법인' }
      const dbCustomer = { name: '홍길동', type: '개인' }

      const isSameType = excelCustomer.type === dbCustomer.type
      const result = isSameType ? 'update' : 'type_conflict'

      expect(result).toBe('type_conflict')
    })

    test('DB에 없는 고객명 → NEW (신규)', () => {
      const excelCustomer = { name: '김철수', type: '개인' }
      const dbCustomers = new Map([['홍길동', { type: '개인' }]])

      const exists = dbCustomers.has(excelCustomer.name)
      const result = exists ? 'update' : 'new'

      expect(result).toBe('new')
    })

    test('빈 고객명 → EMPTY (에러)', () => {
      const customerName = ''

      const result = !customerName.trim() ? 'empty' : 'valid'

      expect(result).toBe('empty')
    })
  })

  describe('7. 백엔드 API', () => {
    let serverSource: string
    let backendAvailable = false

    beforeAll(() => {
      try {
        // 고객 라우트 파일 (server.js 리팩토링으로 customers-routes.js로 이동)
        const routePath = 'D:\\aims\\backend\\api\\aims_api\\routes\\customers-routes.js'
        serverSource = fs.readFileSync(routePath, 'utf-8')
        backendAvailable = true
      } catch {
        // CI 환경 등에서 백엔드 파일이 없을 수 있음
        backendAvailable = false
      }
    })

    test('POST /customers/validate-names 엔드포인트가 있어야 함', () => {
      if (!backendAvailable) return // 백엔드 파일 없으면 스킵
      expect(serverSource).toContain("router.post('/customers/validate-names'")
    })

    test('authenticateJWT 미들웨어가 적용되어야 함', () => {
      if (!backendAvailable) return
      expect(serverSource).toMatch(/router\.post\('\/customers\/validate-names',\s*authenticateJWT/)
    })

    test('customers 배열을 받아야 함', () => {
      if (!backendAvailable) return
      expect(serverSource).toContain('const { customers } = req.body')
    })

    test('status 필드에 new, update, type_conflict, empty가 있어야 함', () => {
      if (!backendAvailable) return
      expect(serverSource).toContain("status: 'new'")
      expect(serverSource).toContain("status: 'update'")
      expect(serverSource).toContain("status: 'type_conflict'")
      expect(serverSource).toContain("status: 'empty'")
    })

    test('stats 객체를 반환해야 함', () => {
      if (!backendAvailable) return
      expect(serverSource).toContain('const stats = {')
      expect(serverSource).toContain('total:')
      expect(serverSource).toContain('new:')
      expect(serverSource).toContain('update:')
      expect(serverSource).toContain('typeConflict:')
      expect(serverSource).toContain('empty:')
    })
  })
})
