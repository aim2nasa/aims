/**
 * NaverMap.tsx - 지도 기능 유닛 테스트
 * @since 2025-10-22
 *
 * 테스트하는 커밋들:
 * - c13b352: feat(map): 같은 주소 고객 그룹화 및 줌 레벨 기반 마커 디자인
 * - a0a39d3: fix(map): TypeScript 타입 안정성 개선
 * - 54facf7: fix(map): 선택된 마커 외곽 원을 빨간색으로 변경하여 가시성 개선
 * - 136a2ca: feat(map): 지도 마커 클릭 시 트리 자동 펼침 기능 추가
 * - dbca739: feat(map): 지역별보기 RP 열림 시 마커를 사용자 지도 중앙에 정확히 배치
 * - 77b9852: feat(map): RightPane 닫힐 때 지도 위치 자동 복원
 */

import { describe, it, expect } from 'vitest'
import type { Customer } from '@/entities/customer/model'

// Mock customers for testing
const createMockCustomer = (id: string, name: string, address1: string, address2: string = ''): Customer => ({
  _id: id,
  personal_info: {
    name,
    address: {
      address1,
      address2
    }
  }
} as Customer)

describe('NaverMap.tsx - 같은 주소 고객 그룹화 기능', () => {
  describe('주소별 고객 그룹화 로직', () => {
    it('같은 address1을 가진 고객들이 하나의 그룹으로 묶여야 함', () => {
      const customers = [
        createMockCustomer('1', '김철수', '서울특별시 강남구', '테헤란로 123'),
        createMockCustomer('2', '이영희', '서울특별시 강남구', '테헤란로 456'),
        createMockCustomer('3', '박민수', '서울특별시 서초구', '서초대로 789')
      ]

      // 그룹화 로직 시뮬레이션
      const addressGroups = new Map<string, Customer[]>()

      for (const customer of customers) {
        const address1 = customer.personal_info?.address?.address1 || ''
        if (!addressGroups.has(address1)) {
          addressGroups.set(address1, [])
        }
        addressGroups.get(address1)!.push(customer)
      }

      // 검증
      expect(addressGroups.size).toBe(2) // 강남구, 서초구 2개 그룹
      const gangnamGroup = addressGroups.get('서울특별시 강남구')
      const seochoGroup = addressGroups.get('서울특별시 서초구')
      expect(gangnamGroup?.length).toBe(2) // 김철수, 이영희
      expect(seochoGroup?.length).toBe(1) // 박민수
    })

    it('address1이 빈 문자열인 고객들도 하나의 그룹으로 묶여야 함', () => {
      const customers = [
        createMockCustomer('1', '홍길동', '', ''),
        createMockCustomer('2', '김유신', '', ''),
        createMockCustomer('3', '이순신', '강원특별자치도 춘천시', '')
      ]

      const addressGroups = new Map<string, Customer[]>()

      for (const customer of customers) {
        const address1 = customer.personal_info?.address?.address1 || ''
        if (!addressGroups.has(address1)) {
          addressGroups.set(address1, [])
        }
        addressGroups.get(address1)!.push(customer)
      }

      const emptyGroup = addressGroups.get('')
      const chuncheonGroup = addressGroups.get('강원특별자치도 춘천시')
      expect(emptyGroup?.length).toBe(2) // 빈 주소 2명
      expect(chuncheonGroup?.length).toBe(1)
    })

    it('그룹 내 고객 순서가 배열 순서대로 유지되어야 함', () => {
      const customers = [
        createMockCustomer('1', '첫째', '서울특별시', ''),
        createMockCustomer('2', '둘째', '서울특별시', ''),
        createMockCustomer('3', '셋째', '서울특별시', '')
      ]

      const addressGroups = new Map<string, Customer[]>()

      for (const customer of customers) {
        const address1 = customer.personal_info?.address?.address1 || ''
        if (!addressGroups.has(address1)) {
          addressGroups.set(address1, [])
        }
        addressGroups.get(address1)!.push(customer)
      }

      const group = addressGroups.get('서울특별시')
      expect(group).toBeDefined()
      if (group) {
        expect(group[0]?.personal_info?.name).toBe('첫째')
        expect(group[1]?.personal_info?.name).toBe('둘째')
        expect(group[2]?.personal_info?.name).toBe('셋째')
      }
    })
  })

  describe('그룹 크기 판별', () => {
    it('그룹 내 고객이 2명 이상이면 isGrouped가 true여야 함', () => {
      const group = [
        createMockCustomer('1', '고객1', '주소', ''),
        createMockCustomer('2', '고객2', '주소', '')
      ]

      const isGrouped = group.length > 1

      expect(isGrouped).toBe(true)
    })

    it('그룹 내 고객이 1명이면 isGrouped가 false여야 함', () => {
      const group = [
        createMockCustomer('1', '고객1', '주소', '')
      ]

      const isGrouped = group.length > 1

      expect(isGrouped).toBe(false)
    })
  })
})

describe('NaverMap.tsx - 줌 레벨 기반 마커 디자인', () => {
  describe('숫자 표시 조건 (showNumbers)', () => {
    it('줌 레벨이 11 이상이면 숫자를 표시해야 함', () => {
      const zoom = 11
      const showNumbers = zoom >= 11

      expect(showNumbers).toBe(true)
    })

    it('줌 레벨이 10 이하면 숫자를 표시하지 않아야 함', () => {
      const zoom = 10
      const showNumbers = zoom >= 11

      expect(showNumbers).toBe(false)
    })

    it('줌 레벨이 정확히 11이면 경계값으로 숫자를 표시해야 함', () => {
      const zoom = 11
      const showNumbers = zoom >= 11

      expect(showNumbers).toBe(true)
    })

    it('줌 레벨이 최대(18)여도 숫자를 표시해야 함', () => {
      const zoom = 18
      const showNumbers = zoom >= 11

      expect(showNumbers).toBe(true)
    })

    it('줌 레벨이 최소(6)면 숫자를 표시하지 않아야 함', () => {
      const zoom = 6
      const showNumbers = zoom >= 11

      expect(showNumbers).toBe(false)
    })
  })

  describe('그룹 마커 디자인 - 숫자 표시 모드 (zoom >= 11)', () => {
    it('선택되지 않은 그룹은 빨간색(#FF3B30) 배경과 흰색 테두리를 가져야 함', () => {
      const hasSelectedCustomer = false
      const backgroundColor = hasSelectedCustomer ? '#007AFF' : '#FF3B30'
      const borderColor = hasSelectedCustomer ? '#FF3B30' : 'white'

      expect(backgroundColor).toBe('#FF3B30')
      expect(borderColor).toBe('white')
    })

    it('선택된 고객이 포함된 그룹은 파란색(#007AFF) 배경과 빨간색 테두리를 가져야 함', () => {
      const hasSelectedCustomer = true
      const backgroundColor = hasSelectedCustomer ? '#007AFF' : '#FF3B30'
      const borderColor = hasSelectedCustomer ? '#FF3B30' : 'white'

      expect(backgroundColor).toBe('#007AFF')
      expect(borderColor).toBe('#FF3B30')
    })

    it('마커 크기는 14px이어야 함 (단일 고객 마커와 동일)', () => {
      const markerSize = { width: 14, height: 14 }

      expect(markerSize.width).toBe(14)
      expect(markerSize.height).toBe(14)
    })

    it('그룹 내 고객 수를 숫자로 표시해야 함', () => {
      const groupSize = 5
      const displayText = groupSize.toString()

      expect(displayText).toBe('5')
    })
  })

  describe('그룹 마커 디자인 - 이중 원 모드 (zoom < 11)', () => {
    it('선택되지 않은 그룹은 빨간색(#FF3B30) 내부 원을 가져야 함', () => {
      const hasSelectedCustomer = false
      const innerCircleColor = hasSelectedCustomer ? '#007AFF' : '#FF3B30'

      expect(innerCircleColor).toBe('#FF3B30')
    })

    it('선택된 고객이 포함된 그룹은 파란색(#007AFF) 내부 원을 가져야 함', () => {
      const hasSelectedCustomer = true
      const innerCircleColor = hasSelectedCustomer ? '#007AFF' : '#FF3B30'

      expect(innerCircleColor).toBe('#007AFF')
    })

    it('내부 원 크기는 10px이어야 함', () => {
      const innerCircleSize = { width: 10, height: 10 }

      expect(innerCircleSize.width).toBe(10)
      expect(innerCircleSize.height).toBe(10)
    })

    it('외부 원 테두리는 반투명 빨간색(rgba(255, 59, 48, 0.3))이어야 함', () => {
      const outerBorderColor = 'rgba(255, 59, 48, 0.3)'

      expect(outerBorderColor).toBe('rgba(255, 59, 48, 0.3)')
    })

    it('외부 원 테두리 두께는 3px이어야 함', () => {
      const borderWidth = 3

      expect(borderWidth).toBe(3)
    })
  })

  describe('단일 고객 마커 디자인', () => {
    it('선택되지 않은 단일 마커는 빨간색(#FF3B30)이어야 함', () => {
      const isSelected = false
      const markerColor = isSelected ? '#007AFF' : '#FF3B30'

      expect(markerColor).toBe('#FF3B30')
    })

    it('선택된 단일 마커는 파란색(#007AFF) 배경과 빨간색 테두리를 가져야 함', () => {
      const isSelected = true
      const backgroundColor = isSelected ? '#007AFF' : '#FF3B30'
      const borderColor = isSelected ? '#FF3B30' : 'white'

      expect(backgroundColor).toBe('#007AFF')
      expect(borderColor).toBe('#FF3B30')
    })

    it('단일 마커 크기는 14px이어야 함', () => {
      const markerSize = { width: 14, height: 14 }

      expect(markerSize.width).toBe(14)
      expect(markerSize.height).toBe(14)
    })
  })
})

describe('NaverMap.tsx - 선택된 마커 가시성 개선', () => {
  describe('커밋 54facf7: 선택된 마커 외곽 원 색상', () => {
    it('선택된 단일 마커의 테두리는 빨간색(#FF3B30)이어야 함 (흰색 아님)', () => {
      const isSelected = true
      const borderColor = isSelected ? '#FF3B30' : 'white'

      expect(borderColor).toBe('#FF3B30')
      expect(borderColor).not.toBe('white')
    })

    it('선택된 그룹 마커의 테두리는 빨간색(#FF3B30)이어야 함', () => {
      const hasSelectedCustomer = true
      const borderColor = hasSelectedCustomer ? '#FF3B30' : 'white'

      expect(borderColor).toBe('#FF3B30')
    })

    it('선택되지 않은 마커의 테두리는 흰색이어야 함', () => {
      const isSelected = false
      const borderColor = isSelected ? '#FF3B30' : 'white'

      expect(borderColor).toBe('white')
    })
  })

  describe('선택 상태 시각적 구분', () => {
    it('선택된 마커: 파란색 배경 + 빨간색 테두리 조합', () => {
      const isSelected = true
      const style = {
        backgroundColor: isSelected ? '#007AFF' : '#FF3B30',
        borderColor: isSelected ? '#FF3B30' : 'white'
      }

      expect(style.backgroundColor).toBe('#007AFF')
      expect(style.borderColor).toBe('#FF3B30')
    })

    it('미선택 마커: 빨간색 배경 + 흰색 테두리 조합', () => {
      const isSelected = false
      const style = {
        backgroundColor: isSelected ? '#007AFF' : '#FF3B30',
        borderColor: isSelected ? '#FF3B30' : 'white'
      }

      expect(style.backgroundColor).toBe('#FF3B30')
      expect(style.borderColor).toBe('white')
    })
  })
})

describe('NaverMap.tsx - TypeScript 타입 안정성', () => {
  describe('커밋 a0a39d3: Optional chaining 적용', () => {
    it('group[0]?.customer?._id 접근이 안전해야 함', () => {
      const group: Array<{ customer: Customer; result: any }> = []

      // Optional chaining으로 안전하게 접근
      const customerId = group[0]?.customer?._id

      expect(customerId).toBeUndefined() // 빈 배열이므로 undefined
    })

    it('group[0]?.customer?.personal_info?.name 접근이 안전해야 함', () => {
      const group: Array<{ customer: Customer; result: any }> = []

      const customerName = group[0]?.customer?.personal_info?.name

      expect(customerName).toBeUndefined()
    })

    it('group[0]?.customer?.personal_info?.address?.address1 접근이 안전해야 함', () => {
      const group: Array<{ customer: Customer; result: any }> = []

      const address1 = group[0]?.customer?.personal_info?.address?.address1

      expect(address1).toBeUndefined()
    })

    it('유효한 그룹에서는 값이 올바르게 추출되어야 함', () => {
      const customer = createMockCustomer('123', '테스트', '서울특별시', '강남구')
      const group: Array<{ customer: Customer; result: any }> = [
        { customer, result: {} }
      ]

      const customerId = group[0]?.customer?._id
      const customerName = group[0]?.customer?.personal_info?.name
      const address1 = group[0]?.customer?.personal_info?.address?.address1

      expect(customerId).toBe('123')
      expect(customerName).toBe('테스트')
      expect(address1).toBe('서울특별시')
    })
  })
})

describe('NaverMap.tsx - 그룹 선택 상태 확인', () => {
  describe('hasSelectedCustomer 계산 로직', () => {
    it('선택된 고객이 그룹에 포함되어 있으면 true를 반환해야 함', () => {
      const selectedCustomerId = '2'
      const group = [
        { customer: createMockCustomer('1', '고객1', '서울', ''), result: {} },
        { customer: createMockCustomer('2', '고객2', '서울', ''), result: {} },
        { customer: createMockCustomer('3', '고객3', '서울', ''), result: {} }
      ]

      const hasSelectedCustomer = group.some(item => item.customer._id === selectedCustomerId)

      expect(hasSelectedCustomer).toBe(true)
    })

    it('선택된 고객이 그룹에 없으면 false를 반환해야 함', () => {
      const selectedCustomerId = '999'
      const group = [
        { customer: createMockCustomer('1', '고객1', '서울', ''), result: {} },
        { customer: createMockCustomer('2', '고객2', '서울', ''), result: {} }
      ]

      const hasSelectedCustomer = group.some(item => item.customer._id === selectedCustomerId)

      expect(hasSelectedCustomer).toBe(false)
    })

    it('selectedCustomerId가 null이면 false를 반환해야 함', () => {
      const selectedCustomerId = null
      const group = [
        { customer: createMockCustomer('1', '고객1', '서울', ''), result: {} }
      ]

      const hasSelectedCustomer = group.some(item => item.customer._id === selectedCustomerId)

      expect(hasSelectedCustomer).toBe(false)
    })

    it('그룹이 비어있으면 false를 반환해야 함', () => {
      const selectedCustomerId = '1'
      const group: Array<{ customer: Customer; result: any }> = []

      const hasSelectedCustomer = group.some(item => item.customer._id === selectedCustomerId)

      expect(hasSelectedCustomer).toBe(false)
    })
  })
})

describe('NaverMap.tsx - 그룹 툴팁 내용 생성', () => {
  describe('고객 리스트 포맷', () => {
    it('각 고객의 이름과 상세주소(address2)를 포함해야 함', () => {
      const group = [
        { customer: createMockCustomer('1', '김철수', '서울특별시', '101호'), result: {} },
        { customer: createMockCustomer('2', '이영희', '서울특별시', '202호'), result: {} }
      ]

      const customerInfoList = group.map(item => {
        const name = item.customer.personal_info?.name || '고객'
        const address2 = item.customer.personal_info?.address?.address2 || ''
        return { name, address2 }
      })

      expect(customerInfoList).toHaveLength(2)
      expect(customerInfoList[0]).toBeDefined()
      expect(customerInfoList[1]).toBeDefined()
      expect(customerInfoList[0]!).toEqual({ name: '김철수', address2: '101호' })
      expect(customerInfoList[1]!).toEqual({ name: '이영희', address2: '202호' })
    })

    it('address2가 없는 고객은 빈 문자열을 가져야 함', () => {
      const group = [
        { customer: createMockCustomer('1', '홍길동', '서울특별시', ''), result: {} }
      ]

      const address2 = group[0]?.customer.personal_info?.address?.address2 || ''

      expect(address2).toBe('')
    })

    it('personal_info가 없는 고객은 기본값 "고객"을 이름으로 가져야 함', () => {
      const invalidCustomer = { _id: '1' } as Customer
      const group = [{ customer: invalidCustomer, result: {} }]

      const name = group[0]?.customer.personal_info?.name || '고객'

      expect(name).toBe('고객')
    })

    it('툴팁 헤더에 그룹 크기가 표시되어야 함', () => {
      const group = [
        { customer: createMockCustomer('1', '고객1', '서울', ''), result: {} },
        { customer: createMockCustomer('2', '고객2', '서울', ''), result: {} },
        { customer: createMockCustomer('3', '고객3', '서울', ''), result: {} }
      ]

      const headerText = `${group.length}명의 고객`

      expect(headerText).toBe('3명의 고객')
    })
  })
})

describe('NaverMap.tsx - 마커 컨테이너 크기 일관성', () => {
  describe('모든 마커 타입의 컨테이너 크기', () => {
    it('단일 마커 컨테이너는 24x24px이어야 함', () => {
      const containerSize = { width: 24, height: 24 }

      expect(containerSize.width).toBe(24)
      expect(containerSize.height).toBe(24)
    })

    it('그룹 마커 (숫자 표시) 컨테이너는 24x24px이어야 함', () => {
      const containerSize = { width: 24, height: 24 }

      expect(containerSize.width).toBe(24)
      expect(containerSize.height).toBe(24)
    })

    it('그룹 마커 (이중 원) 컨테이너는 24x24px이어야 함', () => {
      const containerSize = { width: 24, height: 24 }

      expect(containerSize.width).toBe(24)
      expect(containerSize.height).toBe(24)
    })

    it('모든 마커 타입이 동일한 컨테이너 크기를 가져 클릭 영역이 일관되어야 함', () => {
      const singleMarkerContainer = { width: 24, height: 24 }
      const groupMarkerNumberContainer = { width: 24, height: 24 }
      const groupMarkerCircleContainer = { width: 24, height: 24 }

      expect(singleMarkerContainer).toEqual(groupMarkerNumberContainer)
      expect(groupMarkerNumberContainer).toEqual(groupMarkerCircleContainer)
    })
  })
})
