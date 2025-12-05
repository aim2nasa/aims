/**
 * P2 작업 검증 테스트
 *
 * 테스트 대상:
 * 1. P2-1: sessionStorage Map 직렬화/역직렬화
 * 2. P2-2: 고객 필터링 로직 중복 제거 (partitionBulkResultByType)
 */

import * as fs from 'fs'
import * as path from 'path'

describe('P2: sessionStorage Map 직렬화 및 중복 로직 제거', () => {
  let componentSource: string

  beforeAll(() => {
    const componentPath = path.join(__dirname, '..', 'ExcelRefiner.tsx')
    componentSource = fs.readFileSync(componentPath, 'utf-8')
  })

  describe('P2-1: sessionStorage Map 직렬화', () => {
    test('SerializedProductMatchResult 인터페이스가 정의되어야 함', () => {
      expect(componentSource).toContain('interface SerializedProductMatchResult')
      expect(componentSource).toContain('originalMatch: Array<[number, string]>')
      expect(componentSource).toContain('modified: Array<[number, string]>')
      expect(componentSource).toContain('productNames: Array<[string, string]>')
      expect(componentSource).toContain('allProducts: Array<[string, InsuranceProduct]>')
    })

    test('serializeProductMatchResult 함수가 정의되어야 함', () => {
      expect(componentSource).toContain('function serializeProductMatchResult(result: ProductMatchResult)')
      expect(componentSource).toContain('Array.from(result.originalMatch.entries())')
      expect(componentSource).toContain('Array.from(result.modified.entries())')
      expect(componentSource).toContain('Array.from(result.productNames.entries())')
      expect(componentSource).toContain('Array.from(result.allProducts.entries())')
    })

    test('deserializeProductMatchResult 함수가 정의되어야 함', () => {
      expect(componentSource).toContain('function deserializeProductMatchResult(serialized: SerializedProductMatchResult)')
      expect(componentSource).toContain('new Map(serialized.originalMatch)')
      expect(componentSource).toContain('new Map(serialized.modified)')
      expect(componentSource).toContain('new Map(serialized.productNames)')
      expect(componentSource).toContain('new Map(serialized.allProducts)')
    })

    test('PersistedState에 productMatchResult 필드가 있어야 함', () => {
      expect(componentSource).toContain('productMatchResult?: SerializedProductMatchResult')
      expect(componentSource).toContain('productNameColumnIndex?: number')
    })

    test('savePersistedState에서 productMatchResult를 직렬화해야 함', () => {
      expect(componentSource).toContain('serializeProductMatchResult(productMatchResult)')
    })

    test('loadPersistedState에서 productMatchResult를 역직렬화해야 함', () => {
      expect(componentSource).toContain('deserializeProductMatchResult(saved.productMatchResult)')
    })
  })

  describe('P2-2: 고객 필터링 로직 중복 제거', () => {
    test('BulkImportResult 인터페이스가 정의되어야 함', () => {
      expect(componentSource).toContain('interface BulkImportResult')
      expect(componentSource).toContain('created: Array<{ name: string')
      expect(componentSource).toContain('updated: Array<{ name: string')
      expect(componentSource).toContain('skipped: Array<{ name: string')
      expect(componentSource).toContain('errors: Array<{ name: string')
    })

    test('PartitionedCustomerResult 인터페이스가 정의되어야 함', () => {
      expect(componentSource).toContain('interface PartitionedCustomerResult')
      expect(componentSource).toContain('개인고객: {')
      expect(componentSource).toContain('법인고객: {')
    })

    test('partitionBulkResultByType 함수가 정의되어야 함', () => {
      expect(componentSource).toContain('function partitionBulkResultByType(')
      expect(componentSource).toContain('result: BulkImportResult')
      expect(componentSource).toContain('customers: BulkCustomerInput[]')
      expect(componentSource).toContain('): PartitionedCustomerResult')
    })

    test('partitionBulkResultByType이 3곳에서 사용되어야 함', () => {
      const matches = componentSource.match(/partitionBulkResultByType\(/g)
      // 함수 정의 1개 + 호출 3개 = 4개
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(4)
    })

    test('개인/법인 분류 로직이 함수 내에 있어야 함', () => {
      // 함수 내에서 customer_type 필터링
      expect(componentSource).toContain("customer_type === '개인'")
      expect(componentSource).toContain("customer_type === '법인'")
    })
  })

  describe('P2-1: Map 직렬화 로직 시뮬레이션', () => {
    // 직렬화/역직렬화 로직 테스트
    interface MockProductMatchResult {
      originalMatch: Map<number, string>
      modified: Map<number, string>
      unmatched: number[]
      productNames: Map<string, string>
      allProducts: Map<string, { _id: string; productName: string }>
    }

    interface MockSerializedResult {
      originalMatch: Array<[number, string]>
      modified: Array<[number, string]>
      unmatched: number[]
      productNames: Array<[string, string]>
      allProducts: Array<[string, { _id: string; productName: string }]>
    }

    const serialize = (result: MockProductMatchResult): MockSerializedResult => ({
      originalMatch: Array.from(result.originalMatch.entries()),
      modified: Array.from(result.modified.entries()),
      unmatched: result.unmatched,
      productNames: Array.from(result.productNames.entries()),
      allProducts: Array.from(result.allProducts.entries())
    })

    const deserialize = (serialized: MockSerializedResult): MockProductMatchResult => ({
      originalMatch: new Map(serialized.originalMatch),
      modified: new Map(serialized.modified),
      unmatched: serialized.unmatched,
      productNames: new Map(serialized.productNames),
      allProducts: new Map(serialized.allProducts)
    })

    test('Map → 배열 직렬화가 정상 동작해야 함', () => {
      const original: MockProductMatchResult = {
        originalMatch: new Map([[0, 'id1'], [2, 'id2']]),
        modified: new Map([[1, 'id3']]),
        unmatched: [3, 4],
        productNames: new Map([['상품A', 'id1'], ['상품B', 'id2']]),
        allProducts: new Map([['id1', { _id: 'id1', productName: '상품A' }]])
      }

      const serialized = serialize(original)

      expect(serialized.originalMatch).toEqual([[0, 'id1'], [2, 'id2']])
      expect(serialized.modified).toEqual([[1, 'id3']])
      expect(serialized.unmatched).toEqual([3, 4])
      expect(serialized.productNames).toEqual([['상품A', 'id1'], ['상품B', 'id2']])
    })

    test('배열 → Map 역직렬화가 정상 동작해야 함', () => {
      const serialized: MockSerializedResult = {
        originalMatch: [[0, 'id1'], [2, 'id2']],
        modified: [[1, 'id3']],
        unmatched: [3, 4],
        productNames: [['상품A', 'id1'], ['상품B', 'id2']],
        allProducts: [['id1', { _id: 'id1', productName: '상품A' }]]
      }

      const restored = deserialize(serialized)

      expect(restored.originalMatch.get(0)).toBe('id1')
      expect(restored.originalMatch.get(2)).toBe('id2')
      expect(restored.modified.get(1)).toBe('id3')
      expect(restored.productNames.get('상품A')).toBe('id1')
      expect(restored.allProducts.get('id1')?.productName).toBe('상품A')
    })

    test('직렬화 후 역직렬화하면 원본과 동일해야 함', () => {
      const original: MockProductMatchResult = {
        originalMatch: new Map([[0, 'id1'], [5, 'id2']]),
        modified: new Map([[3, 'id3']]),
        unmatched: [1, 2],
        productNames: new Map([['상품X', 'idx']]),
        allProducts: new Map([['idx', { _id: 'idx', productName: '상품X' }]])
      }

      const serialized = serialize(original)
      const jsonString = JSON.stringify(serialized)
      const parsed = JSON.parse(jsonString)
      const restored = deserialize(parsed)

      expect(restored.originalMatch.get(0)).toBe(original.originalMatch.get(0))
      expect(restored.originalMatch.get(5)).toBe(original.originalMatch.get(5))
      expect(restored.modified.get(3)).toBe(original.modified.get(3))
      expect(restored.unmatched).toEqual(original.unmatched)
    })

    test('빈 Map도 정상 처리되어야 함', () => {
      const empty: MockProductMatchResult = {
        originalMatch: new Map(),
        modified: new Map(),
        unmatched: [],
        productNames: new Map(),
        allProducts: new Map()
      }

      const serialized = serialize(empty)
      const restored = deserialize(serialized)

      expect(restored.originalMatch.size).toBe(0)
      expect(restored.modified.size).toBe(0)
      expect(restored.unmatched).toEqual([])
    })
  })

  describe('P2-2: 고객 분류 로직 시뮬레이션', () => {
    interface MockCustomer {
      name: string
      customer_type: '개인' | '법인'
      mobile_phone?: string
      address?: string
      gender?: string
      birth_date?: string
    }

    interface MockBulkResult {
      created: Array<{ name: string }>
      updated: Array<{ name: string; changes?: string[] }>
      skipped: Array<{ name: string; reason?: string }>
      errors: Array<{ name: string; reason?: string }>
    }

    const partitionByType = (result: MockBulkResult, customers: MockCustomer[]) => {
      const customerMap = new Map(customers.map(c => [c.name, c]))

      const 개인Created = result.created
        .map(c => customerMap.get(c.name))
        .filter((c): c is MockCustomer => c !== undefined && c.customer_type === '개인')

      const 법인Created = result.created
        .map(c => customerMap.get(c.name))
        .filter((c): c is MockCustomer => c !== undefined && c.customer_type === '법인')

      const 개인Skipped = result.skipped.filter(c => customerMap.get(c.name)?.customer_type === '개인')
      const 법인Skipped = result.skipped.filter(c => customerMap.get(c.name)?.customer_type === '법인')

      return {
        개인고객: { created: 개인Created, skipped: 개인Skipped },
        법인고객: { created: 법인Created, skipped: 법인Skipped }
      }
    }

    test('개인/법인 고객이 올바르게 분류되어야 함', () => {
      const customers: MockCustomer[] = [
        { name: '홍길동', customer_type: '개인' },
        { name: '김철수', customer_type: '개인' },
        { name: '(주)테스트', customer_type: '법인' }
      ]

      const result: MockBulkResult = {
        created: [{ name: '홍길동' }, { name: '(주)테스트' }],
        updated: [],
        skipped: [{ name: '김철수', reason: '변경없음' }],
        errors: []
      }

      const partitioned = partitionByType(result, customers)

      expect(partitioned.개인고객.created).toHaveLength(1)
      expect(partitioned.개인고객.created[0].name).toBe('홍길동')
      expect(partitioned.법인고객.created).toHaveLength(1)
      expect(partitioned.법인고객.created[0].name).toBe('(주)테스트')
      expect(partitioned.개인고객.skipped).toHaveLength(1)
    })

    test('빈 결과도 정상 처리되어야 함', () => {
      const customers: MockCustomer[] = []
      const result: MockBulkResult = {
        created: [],
        updated: [],
        skipped: [],
        errors: []
      }

      const partitioned = partitionByType(result, customers)

      expect(partitioned.개인고객.created).toHaveLength(0)
      expect(partitioned.법인고객.created).toHaveLength(0)
    })

    test('개인 고객만 있는 경우', () => {
      const customers: MockCustomer[] = [
        { name: '이영희', customer_type: '개인' },
        { name: '박민수', customer_type: '개인' }
      ]

      const result: MockBulkResult = {
        created: [{ name: '이영희' }, { name: '박민수' }],
        updated: [],
        skipped: [],
        errors: []
      }

      const partitioned = partitionByType(result, customers)

      expect(partitioned.개인고객.created).toHaveLength(2)
      expect(partitioned.법인고객.created).toHaveLength(0)
    })

    test('법인 고객만 있는 경우', () => {
      const customers: MockCustomer[] = [
        { name: '(주)ABC', customer_type: '법인' },
        { name: '(주)XYZ', customer_type: '법인' }
      ]

      const result: MockBulkResult = {
        created: [{ name: '(주)ABC' }],
        updated: [],
        skipped: [{ name: '(주)XYZ' }],
        errors: []
      }

      const partitioned = partitionByType(result, customers)

      expect(partitioned.개인고객.created).toHaveLength(0)
      expect(partitioned.법인고객.created).toHaveLength(1)
      expect(partitioned.법인고객.skipped).toHaveLength(1)
    })
  })
})
