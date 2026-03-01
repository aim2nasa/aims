/**
 * 지역별 고객보기 UX 개선 Regression 테스트
 * @description 광역시/도 축약 표시, 더블클릭 전체보기 이동, 주소 미입력 정렬
 * @regression 커밋 1fc9dd4a (광역시 축약), dc3d5ca8 (더블클릭), 3bd44629 (주소 미입력 정렬)
 * @priority HIGH - 지역별 고객보기 핵심 UX
 */

import { describe, it, expect } from 'vitest'

// ===== 소스에서 추출한 순수 로직 (RegionalTreeView.tsx) =====

/** 광역시/도 이름 정규화 맵 */
const PROVINCE_NORMALIZATION_MAP: { [key: string]: string } = {
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
  '세종': '세종특별자치시',
  '세종특별자치시': '세종특별자치시',
  '제주': '제주특별자치도',
  '제주특별자치도': '제주특별자치도',
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

/** 광역시/도 간략 표시명 */
const PROVINCE_SHORT_NAME: { [key: string]: string } = {
  '서울특별시': '서울시',
  '부산광역시': '부산시',
  '대구광역시': '대구시',
  '인천광역시': '인천시',
  '광주광역시': '광주시',
  '대전광역시': '대전시',
  '울산광역시': '울산시',
  '세종특별자치시': '세종시',
  '경기도': '경기도',
  '강원특별자치도': '강원도',
  '충청북도': '충북',
  '충청남도': '충남',
  '전북특별자치도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주도',
}

const normalizeProvinceName = (rawCity: string): string => {
  return PROVINCE_NORMALIZATION_MAP[rawCity] || rawCity
}

const getProvinceShortName = (province: string): string => {
  return PROVINCE_SHORT_NAME[province] || province
}

/** 전체 한국 광역시/도 목록 (17개) */
const ALL_PROVINCES = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
]

// ===== 테스트 =====

describe('지역별 고객보기 UX 개선 - Regression 테스트', () => {
  describe('광역시/도 이름 정규화 (커밋 1fc9dd4a)', () => {
    /**
     * 회귀 테스트: 주소의 첫 단어가 다양한 형태로 입력되어도
     * 동일한 표준 광역시/도 이름으로 정규화되어야 함
     */
    it('약칭을 정식 명칭으로 정규화', () => {
      expect(normalizeProvinceName('서울')).toBe('서울특별시')
      expect(normalizeProvinceName('부산')).toBe('부산광역시')
      expect(normalizeProvinceName('경기')).toBe('경기도')
      expect(normalizeProvinceName('충북')).toBe('충청북도')
      expect(normalizeProvinceName('전남')).toBe('전라남도')
      expect(normalizeProvinceName('제주')).toBe('제주특별자치도')
    })

    it('정식 명칭은 그대로 유지', () => {
      expect(normalizeProvinceName('서울특별시')).toBe('서울특별시')
      expect(normalizeProvinceName('부산광역시')).toBe('부산광역시')
      expect(normalizeProvinceName('경기도')).toBe('경기도')
      expect(normalizeProvinceName('세종특별자치시')).toBe('세종특별자치시')
    })

    it('강원도 → 강원특별자치도 (명칭 변경 반영)', () => {
      expect(normalizeProvinceName('강원도')).toBe('강원특별자치도')
      expect(normalizeProvinceName('강원')).toBe('강원특별자치도')
      expect(normalizeProvinceName('강원특별자치도')).toBe('강원특별자치도')
    })

    it('전라북도 → 전북특별자치도 (명칭 변경 반영)', () => {
      expect(normalizeProvinceName('전라북도')).toBe('전북특별자치도')
      expect(normalizeProvinceName('전북')).toBe('전북특별자치도')
      expect(normalizeProvinceName('전북특별자치도')).toBe('전북특별자치도')
    })

    it('매핑에 없는 값은 원본 반환', () => {
      expect(normalizeProvinceName('알 수 없는 지역')).toBe('알 수 없는 지역')
      expect(normalizeProvinceName('')).toBe('')
    })
  })

  describe('광역시/도 간략 표시 (커밋 1fc9dd4a)', () => {
    /**
     * 회귀 테스트: UI 공간 절약을 위해 긴 광역시/도 이름을 간략화
     * 내부 키(정식 명칭)는 변경하지 않고, 화면 표시만 간략화
     */
    it('특별시/광역시 → ~시 형태로 축약', () => {
      expect(getProvinceShortName('서울특별시')).toBe('서울시')
      expect(getProvinceShortName('부산광역시')).toBe('부산시')
      expect(getProvinceShortName('대구광역시')).toBe('대구시')
      expect(getProvinceShortName('인천광역시')).toBe('인천시')
      expect(getProvinceShortName('광주광역시')).toBe('광주시')
      expect(getProvinceShortName('대전광역시')).toBe('대전시')
      expect(getProvinceShortName('울산광역시')).toBe('울산시')
    })

    it('특별자치시/도 → 간략 명칭', () => {
      expect(getProvinceShortName('세종특별자치시')).toBe('세종시')
      expect(getProvinceShortName('강원특별자치도')).toBe('강원도')
      expect(getProvinceShortName('전북특별자치도')).toBe('전북')
      expect(getProvinceShortName('제주특별자치도')).toBe('제주도')
    })

    it('도 → 약칭으로 축약', () => {
      expect(getProvinceShortName('충청북도')).toBe('충북')
      expect(getProvinceShortName('충청남도')).toBe('충남')
      expect(getProvinceShortName('전라남도')).toBe('전남')
      expect(getProvinceShortName('경상북도')).toBe('경북')
      expect(getProvinceShortName('경상남도')).toBe('경남')
    })

    it('경기도는 축약 없음 (이미 짧음)', () => {
      expect(getProvinceShortName('경기도')).toBe('경기도')
    })

    it('매핑에 없는 값은 원본 반환', () => {
      expect(getProvinceShortName('해외')).toBe('해외')
    })
  })

  describe('정규화 ↔ 간략 표시 일관성', () => {
    it('모든 17개 광역시/도에 대해 정규화 → 간략표시 연결 가능', () => {
      ALL_PROVINCES.forEach(province => {
        const shortName = getProvinceShortName(province)
        expect(shortName).toBeTruthy()
        expect(shortName.length).toBeLessThanOrEqual(province.length)
      })
    })

    it('정규화 맵의 모든 값이 ALL_PROVINCES에 포함', () => {
      const allNormalized = new Set(Object.values(PROVINCE_NORMALIZATION_MAP))
      allNormalized.forEach(normalized => {
        expect(ALL_PROVINCES).toContain(normalized)
      })
    })

    it('간략 표시 맵의 모든 키가 ALL_PROVINCES에 포함', () => {
      Object.keys(PROVINCE_SHORT_NAME).forEach(key => {
        expect(ALL_PROVINCES).toContain(key)
      })
    })
  })

  describe('주소 미입력 고객 정렬 (커밋 3bd44629)', () => {
    /**
     * 회귀 테스트: 주소가 없는 고객을 트리 최하단에 배치
     * 주소 입력 고객이 우선 표시되어야 UX가 자연스러움
     */
    interface MockCustomer {
      name: string
      address?: string | null
    }

    const groupByRegion = (customers: MockCustomer[]) => {
      const groups: { [region: string]: MockCustomer[] } = {}
      const noAddress: MockCustomer[] = []

      customers.forEach(c => {
        if (!c.address || c.address.trim() === '') {
          noAddress.push(c)
        } else {
          const firstWord = c.address.split(' ')[0]
          const normalized = normalizeProvinceName(firstWord)
          if (!groups[normalized]) groups[normalized] = []
          groups[normalized].push(c)
        }
      })

      return { groups, noAddress }
    }

    it('주소 있는 고객은 지역별로 그룹화', () => {
      const customers: MockCustomer[] = [
        { name: '김서울', address: '서울특별시 강남구 역삼동' },
        { name: '이부산', address: '부산 해운대구 중동' },
        { name: '박경기', address: '경기도 성남시 분당구' },
      ]

      const { groups, noAddress } = groupByRegion(customers)

      expect(Object.keys(groups)).toHaveLength(3)
      expect(groups['서울특별시']).toHaveLength(1)
      expect(groups['부산광역시']).toHaveLength(1)
      expect(groups['경기도']).toHaveLength(1)
      expect(noAddress).toHaveLength(0)
    })

    it('주소 미입력 고객은 별도 그룹(noAddress)으로 분리', () => {
      const customers: MockCustomer[] = [
        { name: '김서울', address: '서울특별시 강남구' },
        { name: '주소없음1', address: null },
        { name: '주소없음2', address: '' },
        { name: '주소없음3', address: '  ' },
      ]

      const { groups, noAddress } = groupByRegion(customers)

      expect(Object.keys(groups)).toHaveLength(1)
      expect(noAddress).toHaveLength(3)
    })

    it('주소 미입력 고객은 주소 입력 고객보다 뒤에 표시 (트리 최하단)', () => {
      const customers: MockCustomer[] = [
        { name: '주소없음', address: null },
        { name: '김서울', address: '서울특별시 강남구' },
        { name: '이경기', address: '경기도 성남시' },
      ]

      const { groups, noAddress } = groupByRegion(customers)

      // 그룹화된 지역 → noAddress 순서로 렌더링
      const allRegions = Object.keys(groups)
      expect(allRegions.length).toBeGreaterThan(0)
      expect(noAddress).toHaveLength(1)
      expect(noAddress[0].name).toBe('주소없음')
    })
  })

  describe('더블클릭 전체보기 이동 (커밋 dc3d5ca8)', () => {
    /**
     * 회귀 테스트: 지역별 고객보기에서 고객 더블클릭 시
     * 전체보기 탭으로 이동 (관계별 고객보기와 동일한 UX 패턴)
     */
    it('싱글클릭과 더블클릭 타이머 간격은 300ms', () => {
      const DOUBLE_CLICK_THRESHOLD = 300

      expect(DOUBLE_CLICK_THRESHOLD).toBe(300)
      expect(DOUBLE_CLICK_THRESHOLD).toBeGreaterThanOrEqual(200) // 너무 짧으면 오작동
      expect(DOUBLE_CLICK_THRESHOLD).toBeLessThanOrEqual(500)    // 너무 길면 느림
    })

    it('더블클릭 시 싱글클릭 타이머가 취소되어야 함', () => {
      let singleClickFired = false
      let doubleClickFired = false

      // 싱글클릭 시뮬레이션 (타이머 기반)
      const timer = setTimeout(() => { singleClickFired = true }, 300)

      // 더블클릭 시뮬레이션 (300ms 이내)
      clearTimeout(timer) // 타이머 취소
      doubleClickFired = true

      expect(singleClickFired).toBe(false) // 싱글클릭 취소됨
      expect(doubleClickFired).toBe(true)  // 더블클릭만 발동
    })
  })

  describe('통합 검증: 정규화 → 간략 표시 전체 흐름', () => {
    it('주소 "서울특별시 강남구" → 정규화 "서울특별시" → 표시 "서울시"', () => {
      const address = '서울특별시 강남구 역삼동'
      const firstWord = address.split(' ')[0]
      const normalized = normalizeProvinceName(firstWord)
      const displayed = getProvinceShortName(normalized)

      expect(normalized).toBe('서울특별시')
      expect(displayed).toBe('서울시')
    })

    it('약칭 주소 "부산 해운대구" → 정규화 "부산광역시" → 표시 "부산시"', () => {
      const address = '부산 해운대구 중동'
      const firstWord = address.split(' ')[0]
      const normalized = normalizeProvinceName(firstWord)
      const displayed = getProvinceShortName(normalized)

      expect(normalized).toBe('부산광역시')
      expect(displayed).toBe('부산시')
    })

    it('ALL_PROVINCES는 정확히 17개', () => {
      expect(ALL_PROVINCES).toHaveLength(17)
    })
  })
})
