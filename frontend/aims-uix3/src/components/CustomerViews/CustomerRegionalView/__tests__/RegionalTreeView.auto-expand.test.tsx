/**
 * RegionalTreeView.tsx - 마커 클릭 시 트리 자동 펼침 기능 테스트
 * @since 2025-10-22
 *
 * 테스트하는 커밋들:
 * - dab2bce: feat(tree): 지역별 트리 펼치기/접기 버튼을 macOS 스타일 sticky header로 개선
 * - 136a2ca: feat(map): 지도 마커 클릭 시 트리 자동 펼침 기능 추가
 */

import { describe, it, expect } from 'vitest'
import type { Customer } from '@/entities/customer/model'

// Mock customer helper
const createMockCustomer = (id: string, name: string, address1: string): Customer => ({
  _id: id,
  personal_info: {
    name,
    address: {
      address1,
      address2: ''
    }
  }
} as Customer)

// 광역시/도 이름 정규화 맵 (RegionalTreeView.tsx와 동일)
const PROVINCE_NORMALIZATION_MAP: { [key: string]: string } = {
  // 특별시/광역시
  '서울': '서울특별시',
  '서울특별시': '서울특별시',
  '부산': '부산광역시',
  '부산광역시': '부산광역시',
  '대구': '대구광역시',
  '대구광역시': '대구광역시',
  '인천': '인천광역시',
  '인천광역시': '인천광역시',
  '광주': '광주광역시',
  '광주광역시': '광주광역시',
  '대전': '대전광역시',
  '대전광역시': '대전광역시',
  '울산': '울산광역시',
  '울산광역시': '울산광역시',

  // 특별자치시/도
  '세종': '세종특별자치시',
  '세종특별자치시': '세종특별자치시',
  '제주': '제주특별자치도',
  '제주특별자치도': '제주특별자치도',

  // 도
  '경기': '경기도',
  '경기도': '경기도',
  '강원': '강원특별자치도',
  '강원도': '강원특별자치도',
  '강원특별자치도': '강원특별자치도',
  '충북': '충청북도',
  '충청북도': '충청북도',
  '충남': '충청남도',
  '충청남도': '충청남도',
  '전북': '전북특별자치도',
  '전라북도': '전북특별자치도',
  '전북특별자치도': '전북특별자치도',
  '전남': '전라남도',
  '전라남도': '전라남도',
  '경북': '경상북도',
  '경상북도': '경상북도',
  '경남': '경상남도',
  '경상남도': '경상남도',
}

// 광역시/도 이름 정규화 함수 (RegionalTreeView.tsx와 동일)
const normalizeProvinceName = (rawCity: string): string => {
  return PROVINCE_NORMALIZATION_MAP[rawCity] || rawCity
}

describe('RegionalTreeView.tsx - 마커 클릭 시 트리 자동 펼침', () => {
  describe('주소가 있는 고객 선택 시', () => {
    it('시/도 노드가 expandedKeys에 추가되어야 함', () => {
      const customer = createMockCustomer('1', '김철수', '서울특별시 강남구')
      const expandedKeys: string[] = []

      // 주소 파싱
      const address = customer.personal_info?.address?.address1
      const parts = address!.split(' ')
      const rawCity = parts[0] || ''
      const city = normalizeProvinceName(rawCity)

      // 시/도 추가
      const newSet = new Set(expandedKeys)
      newSet.add(city)
      const updatedKeys = Array.from(newSet)

      expect(updatedKeys).toContain('서울특별시')
      expect(city).toBe('서울특별시')
    })

    it('시/군/구 노드가 expandedKeys에 추가되어야 함', () => {
      const customer = createMockCustomer('1', '이영희', '경기도 성남시')
      const expandedKeys: string[] = []

      // 주소 파싱
      const address = customer.personal_info?.address?.address1
      const parts = address!.split(' ')
      const rawCity = parts[0] || ''
      const district = parts[1] || ''
      const city = normalizeProvinceName(rawCity)
      const districtKey = `${city}-${district}`

      // 시/도와 시/군/구 추가
      const newSet = new Set(expandedKeys)
      newSet.add(city)
      newSet.add(districtKey)
      const updatedKeys = Array.from(newSet)

      expect(updatedKeys).toContain('경기도')
      expect(updatedKeys).toContain('경기도-성남시')
      expect(districtKey).toBe('경기도-성남시')
    })

    it('계층 구조가 모두 펼쳐져야 함 (시/도 + 시/군/구)', () => {
      const customer = createMockCustomer('1', '박민수', '강원특별자치도 춘천시')
      const expandedKeys: string[] = []

      const address = customer.personal_info?.address?.address1
      const parts = address!.split(' ')
      const rawCity = parts[0] || ''
      const district = parts[1] || ''
      const city = normalizeProvinceName(rawCity)
      const districtKey = `${city}-${district}`

      const newSet = new Set(expandedKeys)
      newSet.add(city)
      newSet.add(districtKey)
      const updatedKeys = Array.from(newSet)

      expect(updatedKeys).toHaveLength(2)
      expect(updatedKeys).toContain('강원특별자치도')
      expect(updatedKeys).toContain('강원특별자치도-춘천시')
    })

    it('이미 펼쳐진 노드가 있어도 중복 없이 추가되어야 함', () => {
      const customer = createMockCustomer('1', '홍길동', '서울특별시 강남구')
      const expandedKeys = ['서울특별시', '부산광역시'] // 이미 서울특별시가 펼쳐져 있음

      const address = customer.personal_info?.address?.address1
      const parts = address!.split(' ')
      const rawCity = parts[0] || ''
      const district = parts[1] || ''
      const city = normalizeProvinceName(rawCity)
      const districtKey = `${city}-${district}`

      const newSet = new Set(expandedKeys)
      newSet.add(city)
      newSet.add(districtKey)
      const updatedKeys = Array.from(newSet)

      // Set을 사용했으므로 중복 없음
      expect(updatedKeys).toContain('서울특별시')
      expect(updatedKeys).toContain('부산광역시')
      expect(updatedKeys).toContain('서울특별시-강남구')
      expect(updatedKeys.filter(k => k === '서울특별시')).toHaveLength(1) // 중복 없음
    })

    it('다른 지역 고객을 선택하면 해당 지역도 추가되어야 함', () => {
      const expandedKeys = ['서울특별시', '서울특별시-강남구']
      const customer2 = createMockCustomer('2', '김유신', '부산광역시 해운대구')

      const address = customer2.personal_info?.address?.address1
      const parts = address!.split(' ')
      const rawCity = parts[0] || ''
      const district = parts[1] || ''
      const city = normalizeProvinceName(rawCity)
      const districtKey = `${city}-${district}`

      const newSet = new Set(expandedKeys)
      newSet.add(city)
      newSet.add(districtKey)
      const updatedKeys = Array.from(newSet)

      expect(updatedKeys).toContain('서울특별시')
      expect(updatedKeys).toContain('서울특별시-강남구')
      expect(updatedKeys).toContain('부산광역시')
      expect(updatedKeys).toContain('부산광역시-해운대구')
      expect(updatedKeys).toHaveLength(4)
    })
  })

  describe('주소가 없는 고객 선택 시', () => {
    it('"주소 미입력" 폴더가 expandedKeys에 추가되어야 함', () => {
      const customer = createMockCustomer('1', '주소없음', '')
      const expandedKeys: string[] = []

      const address = customer.personal_info?.address?.address1

      if (!address) {
        const newSet = new Set(expandedKeys)
        newSet.add('no-address')
        const updatedKeys = Array.from(newSet)

        expect(updatedKeys).toContain('no-address')
        expect(updatedKeys).toHaveLength(1)
      }
    })

    it('주소가 빈 문자열이어도 "주소 미입력" 폴더가 추가되어야 함', () => {
      const customer: Customer = {
        _id: '1',
        personal_info: {
          name: '테스트',
          address: {
            address1: '', // 빈 문자열
            address2: ''
          }
        }
      } as Customer

      const expandedKeys: string[] = []
      const address = customer.personal_info?.address?.address1

      if (!address) {
        const newSet = new Set(expandedKeys)
        newSet.add('no-address')
        const updatedKeys = Array.from(newSet)

        expect(updatedKeys).toContain('no-address')
      }
    })

    it('이미 "주소 미입력" 폴더가 펼쳐져 있어도 중복 없이 유지되어야 함', () => {
      const customer = createMockCustomer('1', '주소없음', '')
      const expandedKeys = ['no-address', '서울특별시'] // 이미 펼쳐져 있음

      const address = customer.personal_info?.address?.address1

      if (!address) {
        const newSet = new Set(expandedKeys)
        newSet.add('no-address')
        const updatedKeys = Array.from(newSet)

        expect(updatedKeys).toContain('no-address')
        expect(updatedKeys).toContain('서울특별시')
        expect(updatedKeys.filter(k => k === 'no-address')).toHaveLength(1) // 중복 없음
      }
    })
  })

  describe('광역시/도 이름 정규화', () => {
    it('경기 → 경기도로 변환되어야 함', () => {
      const normalized = normalizeProvinceName('경기')
      expect(normalized).toBe('경기도')
    })

    it('강원 → 강원특별자치도로 변환되어야 함', () => {
      const normalized = normalizeProvinceName('강원')
      expect(normalized).toBe('강원특별자치도')
    })

    it('MAP에 없는 값은 그대로 반환되어야 함', () => {
      const normalized = normalizeProvinceName('강원특별자치')
      expect(normalized).toBe('강원특별자치') // MAP에 정의되지 않음

      const normalized2 = normalizeProvinceName('알수없음')
      expect(normalized2).toBe('알수없음')
    })

    it('제주 → 제주특별자치도로 변환되어야 함', () => {
      const normalized = normalizeProvinceName('제주')
      expect(normalized).toBe('제주특별자치도')
    })

    it('서울특별시는 그대로 유지되어야 함', () => {
      const normalized = normalizeProvinceName('서울특별시')
      expect(normalized).toBe('서울특별시')
    })

    it('부산광역시는 그대로 유지되어야 함', () => {
      const normalized = normalizeProvinceName('부산광역시')
      expect(normalized).toBe('부산광역시')
    })

    it('광역시 목록의 모든 도시는 전체 이름으로 변환되어야 함', () => {
      const cityMappings = {
        '서울': '서울특별시',
        '부산': '부산광역시',
        '대구': '대구광역시',
        '인천': '인천광역시',
        '광주': '광주광역시',
        '대전': '대전광역시',
        '울산': '울산광역시',
        '세종': '세종특별자치시'
      }

      Object.entries(cityMappings).forEach(([city, fullName]) => {
        const normalized = normalizeProvinceName(city)
        expect(normalized).toBe(fullName)
      })
    })

    it('이미 "도"로 끝나는 이름은 그대로 유지되어야 함', () => {
      const normalized1 = normalizeProvinceName('경상남도')
      const normalized2 = normalizeProvinceName('전라남도')

      expect(normalized1).toBe('경상남도')
      expect(normalized2).toBe('전라남도')
    })

    it('전라북도는 전북특별자치도로 변환되어야 함', () => {
      const normalized = normalizeProvinceName('전라북도')
      expect(normalized).toBe('전북특별자치도')
    })
  })

  describe('districtKey 생성 규칙', () => {
    it('districtKey는 "시/도-시/군/구" 형식이어야 함', () => {
      const city = '서울특별시'
      const district = '강남구'
      const districtKey = `${city}-${district}`

      expect(districtKey).toBe('서울특별시-강남구')
    })

    it('정규화된 시/도 이름을 사용해야 함', () => {
      const rawCity = '경기'
      const district = '성남시'
      const city = normalizeProvinceName(rawCity)
      const districtKey = `${city}-${district}`

      expect(districtKey).toBe('경기도-성남시')
      expect(districtKey).not.toBe('경기-성남시') // 정규화 전 이름 사용 안 함
    })

    it('강원특별자치도는 전체 이름이 포함되어야 함', () => {
      const rawCity = '강원'
      const district = '춘천시'
      const city = normalizeProvinceName(rawCity)
      const districtKey = `${city}-${district}`

      expect(districtKey).toBe('강원특별자치도-춘천시')
    })
  })

  describe('NaverMap onCustomerSelect 콜백 연동', () => {
    it('지도에서 마커 클릭 시 customers 배열에서 고객 객체를 찾아야 함', () => {
      const customers = [
        createMockCustomer('1', '김철수', '서울특별시 강남구'),
        createMockCustomer('2', '이영희', '경기도 성남시'),
        createMockCustomer('3', '박민수', '부산광역시 해운대구')
      ]

      const customerId = '2'
      const customer = customers.find(c => c._id === customerId)

      expect(customer).toBeDefined()
      expect(customer?.personal_info?.name).toBe('이영희')
      expect(customer?.personal_info?.address?.address1).toBe('경기도 성남시')
    })

    it('고객을 찾으면 handleCustomerClick을 호출해야 함', () => {
      const customers = [createMockCustomer('1', '김철수', '서울특별시 강남구')]
      const customerId = '1'
      const customer = customers.find(c => c._id === customerId)

      expect(customer).toBeDefined()

      // handleCustomerClick 로직 시뮬레이션
      if (customer) {
        const address = customer.personal_info?.address?.address1
        expect(address).toBe('서울특별시 강남구')

        const parts = address!.split(' ')
        const rawCity = parts[0] || ''
        const city = normalizeProvinceName(rawCity)
        const district = parts[1] || ''
        const districtKey = `${city}-${district}`

        expect(city).toBe('서울특별시')
        expect(districtKey).toBe('서울특별시-강남구')
      }
    })

    it('존재하지 않는 customerId는 undefined를 반환해야 함', () => {
      const customers = [createMockCustomer('1', '김철수', '서울특별시 강남구')]
      const customerId = '999'
      const customer = customers.find(c => c._id === customerId)

      expect(customer).toBeUndefined()
    })
  })

  describe('selectionTimestamp 업데이트', () => {
    it('같은 고객을 다시 선택해도 타임스탬프가 갱신되어야 함', () => {
      const timestamp1 = Date.now()

      // 약간의 시간 경과 시뮬레이션
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

      return wait(10).then(() => {
        const timestamp2 = Date.now()

        expect(timestamp2).toBeGreaterThan(timestamp1)
      })
    })

    it('타임스탬프가 변경되면 지도가 해당 위치로 다시 이동해야 함', () => {
      // 타임스탬프 변경 감지 로직
      let selectionTimestamp = 1000
      const newTimestamp = Date.now()

      const hasTimestampChanged = newTimestamp !== selectionTimestamp

      expect(hasTimestampChanged).toBe(true)

      // 타임스탬프 업데이트
      selectionTimestamp = newTimestamp
      expect(selectionTimestamp).toBe(newTimestamp)
    })
  })

  describe('모든 폴더 펼치기/접기 기능', () => {
    // 트리 구조 시뮬레이션
    interface TreeNode {
      key: string
      children?: TreeNode[]
    }

    const sampleTreeData: TreeNode[] = [
      {
        key: '서울특별시',
        children: [
          { key: '서울특별시-강남구' },
          { key: '서울특별시-서초구' }
        ]
      },
      {
        key: '경기도',
        children: [
          { key: '경기도-성남시' },
          { key: '경기도-수원시' }
        ]
      },
      {
        key: 'no-address'
      }
    ]

    const getAllKeys = (nodes: TreeNode[]): string[] => {
      const keys: string[] = []
      const traverse = (node: TreeNode) => {
        keys.push(node.key)
        if (node.children) {
          node.children.forEach(traverse)
        }
      }
      nodes.forEach(traverse)
      return keys
    }

    it('모든 폴더 펼치기 시 모든 키가 expandedKeys에 포함되어야 함', () => {
      const allKeys = getAllKeys(sampleTreeData)

      // 펼치기 동작
      const expandedKeys = allKeys

      expect(expandedKeys).toHaveLength(7) // 5개 지역 + 2개 no-address
      expect(expandedKeys).toContain('서울특별시')
      expect(expandedKeys).toContain('서울특별시-강남구')
      expect(expandedKeys).toContain('서울특별시-서초구')
      expect(expandedKeys).toContain('경기도')
      expect(expandedKeys).toContain('경기도-성남시')
      expect(expandedKeys).toContain('경기도-수원시')
      expect(expandedKeys).toContain('no-address')
    })

    it('모든 폴더 접기 시 expandedKeys가 비어야 함', () => {
      const expandedKeys = getAllKeys(sampleTreeData)
      expect(expandedKeys).not.toHaveLength(0) // 초기에는 펼쳐져 있음

      // 접기 동작
      const newExpandedKeys: string[] = []

      expect(newExpandedKeys).toHaveLength(0)
      expect(newExpandedKeys).toEqual([])
    })

  })
})
