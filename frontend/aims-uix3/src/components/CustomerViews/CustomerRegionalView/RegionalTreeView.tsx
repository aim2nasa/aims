/**
 * RegionalTreeView Component
 * 애플 스타일의 지역별 고객 트리 뷰 (커스텀 구현, antd 사용 안 함)
 *
 * @since 1.0.0
 * @example
 * ```tsx
 * <RegionalTreeView
 *   customers={customers}
 *   selectedCustomerId={selectedId}
 *   onCustomerSelect={handleSelect}
 *   loading={isLoading}
 * />
 * ```
 */
import React, { useState, useMemo } from 'react'
import type { Customer } from '../../../entities/customer/model'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import RefreshButton from '../../RefreshButton/RefreshButton'
import './RegionalTreeView.css'

/**
 * 광역시/도 이름 정규화 맵
 * 주소의 첫 단어를 표준 광역시/도 이름으로 변환
 */
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

/**
 * 광역시/도 이름 정규화 함수
 * @param rawCity - 주소에서 추출한 원본 광역시/도 이름
 * @returns 정규화된 광역시/도 이름
 */
const normalizeProvinceName = (rawCity: string): string => {
  return PROVINCE_NORMALIZATION_MAP[rawCity] || rawCity
}

/**
 * RegionalTreeView 컴포넌트 Props
 */
interface RegionalTreeViewProps {
  /** 표시할 고객 목록 */
  customers: Customer[]
  /** 현재 선택된 고객 ID */
  selectedCustomerId?: string | null
  /** 고객 선택 시 호출되는 콜백 함수 */
  onCustomerSelect?: (customerId: string) => void
  /** 로딩 상태 */
  loading?: boolean
  /** 새로고침 핸들러 */
  onRefresh?: () => void | Promise<void>
}

/**
 * 트리 노드 데이터 구조
 * @internal
 */
interface TreeNodeData {
  key: string
  label: string
  type: 'city' | 'district' | 'customer' | 'no-address'
  count?: number
  customers?: Customer[]
  children?: TreeNodeData[]
}

/**
 * RegionalTreeView Component
 *
 * 지역별 고객을 3단계 트리 구조(도시 → 구/군 → 고객)로 표시합니다.
 * 애플 디자인 철학(Progressive Disclosure)을 따르며,
 * React.memo를 통해 불필요한 리렌더링을 방지합니다.
 *
 * @param props - RegionalTreeView Props
 * @returns 렌더링된 지역별 트리 컴포넌트
 */
export const RegionalTreeView = React.memo<RegionalTreeViewProps>(({
  customers,
  selectedCustomerId,
  onCustomerSelect,
  loading = false,
  onRefresh
}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['no-address']))
  const [isAllExpanded, setIsAllExpanded] = useState(false)

  // 지역별 그룹핑 - 정규화된 광역시/도 이름 사용
  const regionalGroups = useMemo(() => {
    const groups: { [city: string]: { [district: string]: Customer[] } } = {}
    const noAddressCustomers: Customer[] = []

    customers.forEach((customer) => {
      const address = customer.personal_info?.address?.address1
      if (!address) {
        noAddressCustomers.push(customer)
        return
      }
      const parts = address.split(' ')
      const rawCity = parts[0] || '기타'
      const district = parts[1] || '기타구'

      // 광역시/도 이름 정규화 (예: "경기" → "경기도")
      const city = normalizeProvinceName(rawCity)

      if (!groups[city]) groups[city] = {}
      if (!groups[city][district]) groups[city][district] = []
      groups[city][district].push(customer)
    })

    return { groups, noAddressCustomers }
  }, [customers])

  // 통계 계산 - aims-uix2와 동일
  const stats = useMemo(() => {
    const { groups, noAddressCustomers } = regionalGroups
    const totalCustomers = customers.length
    const citiesCount = Object.keys(groups).length
    const districtsCount = Object.values(groups).reduce(
      (sum, districts) => sum + Object.keys(districts).length, 0
    )

    // 개인/법인 고객 수 계산 (전체보기와 동일한 로직)
    const personalCount = customers.filter(c => c.insurance_info?.customer_type !== '법인').length
    const corporateCount = customers.filter(c => c.insurance_info?.customer_type === '법인').length

    return {
      totalCustomers,
      personalCount,
      corporateCount,
      citiesCount,
      districtsCount,
      noAddressCount: noAddressCustomers.length
    }
  }, [regionalGroups, customers])

  // 트리 데이터 생성
  const treeData = useMemo((): TreeNodeData[] => {
    const { groups, noAddressCustomers } = regionalGroups
    const nodes: TreeNodeData[] = []

    // 주소 없는 고객 (상단에 배치)
    if (noAddressCustomers.length > 0) {
      nodes.push({
        key: 'no-address',
        label: '주소 미입력',
        type: 'no-address',
        count: noAddressCustomers.length,
        customers: noAddressCustomers
      })
    }

    // 도시별 노드
    Object.keys(groups).sort().forEach(city => {
      const districts = groups[city]
      const cityCustomers = Object.values(districts).flat()

      const districtNodes: TreeNodeData[] = Object.keys(districts).sort().map(district => ({
        key: `${city}-${district}`,
        label: district,
        type: 'district' as const,
        count: districts[district].length,
        customers: districts[district]
      }))

      nodes.push({
        key: city,
        label: city,
        type: 'city',
        count: cityCustomers.length,
        children: districtNodes
      })
    })

    return nodes
  }, [regionalGroups])

  // 모두 펼치기/접기 토글 함수
  const toggleExpandAll = () => {
    if (isAllExpanded) {
      // 모두 접기
      setExpandedKeys(new Set())
      setIsAllExpanded(false)
    } else {
      // 모두 펼치기
      const allKeys = new Set<string>()
      treeData.forEach(node => {
        allKeys.add(node.key)
        if (node.children) {
          node.children.forEach(child => allKeys.add(child.key))
        }
      })
      setExpandedKeys(allKeys)
      setIsAllExpanded(true)
    }
  }

  // 노드 확장/축소 토글
  const toggleNode = (key: string) => {
    setExpandedKeys(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      // 개별 노드 토글 시 전체 확장 상태 업데이트
      const totalNodes = treeData.reduce((count, node) => {
        return count + 1 + (node.children ? node.children.length : 0)
      }, 0)
      setIsAllExpanded(newSet.size === totalNodes)
      return newSet
    })
  }

  // 고객 선택 핸들러
  const handleCustomerClick = (customer: Customer) => {
    if (onCustomerSelect && customer._id) {
      onCustomerSelect(customer._id)
    }
  }

  // 고객 타입 아이콘 (전체 보기와 동일한 SVG)
  const getCustomerTypeIcon = (customer: Customer) => {
    const customerType = customer.insurance_info?.customer_type
    if (customerType === '법인') {
      // 법인: 건물 아이콘
      return (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
        </svg>
      )
    }
    // 개인: 사람 아이콘
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
        <circle cx="10" cy="10" r="10" opacity="0.2" />
        <circle cx="10" cy="7" r="3" />
        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
      </svg>
    )
  }

  // 재귀적 트리 렌더링
  const renderTreeNode = (node: TreeNodeData, level: number = 0): React.ReactNode => {
    const isExpanded = expandedKeys.has(node.key)
    const hasChildren = node.children && node.children.length > 0
    const hasCustomers = node.customers && node.customers.length > 0
    const isExpandable = hasChildren || hasCustomers

    return (
      <div key={node.key} className="tree-node-wrapper">
        <div
          className={`tree-node tree-node-${node.type} tree-node-level-${level}`}
          onClick={() => isExpandable && toggleNode(node.key)}
        >
          {/* 윈도우 탐색기 스타일: 확장/축소 표시 */}
          {isExpandable && (
            <SFSymbol
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={SFSymbolSize.CAPTION1}
              weight={SFSymbolWeight.MEDIUM}
              className="tree-node-chevron"
            />
          )}
          {!isExpandable && <div className="tree-node-spacer" />}

          {/* 폴더 아이콘 (텍스트) */}
          <span className="tree-node-folder-icon">
            {node.type === 'city' || node.type === 'district'
              ? (isExpanded ? '📂' : '📁')
              : node.type === 'no-address'
              ? '⚠️'
              : ''}
          </span>

          <span className="tree-node-label">{node.label}</span>

          {node.count !== undefined && (
            <span className={`tree-node-badge badge-${node.type}`}>
              {node.count}
            </span>
          )}
        </div>

        {/* 자식 노드 (구/군) */}
        {hasChildren && isExpanded && (
          <div className="tree-node-children">
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}

        {/* 고객 목록 */}
        {hasCustomers && isExpanded && (
          <div className="tree-node-customers">
            {node.customers!.map(customer => (
              <div
                key={customer._id}
                className={`tree-customer-item tree-customer-item-level-${level + 1} ${selectedCustomerId === customer._id ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCustomerClick(customer)
                }}
              >
                {getCustomerTypeIcon(customer)}
                <span className="tree-customer-name">
                  {customer?.personal_info?.name || customer?.name || '이름 없음'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 로딩 상태
  if (loading) {
    return (
      <div className="regional-tree-view">
        <div className="regional-tree-loading">
          <SFSymbol name="arrow-clockwise" size={SFSymbolSize.TITLE1} weight={SFSymbolWeight.MEDIUM} />
          <span>로딩 중...</span>
        </div>
      </div>
    )
  }

  // Empty State - 고객 데이터가 없을 때
  if (customers.length === 0) {
    return (
      <div className="regional-tree-view">
        <div className="regional-tree-empty">
          <SFSymbol name="person-3" size={SFSymbolSize.LARGE_TITLE} weight={SFSymbolWeight.LIGHT} />
          <h3 className="empty-title">등록된 고객이 없습니다</h3>
          <p className="empty-message">고객을 추가하면 지역별로 자동 분류됩니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="regional-tree-view">

      {/* 통계 - 텍스트 아이콘 */}
      <div className="regional-tree-stats">
        <div className="stat-item">
          <span className="stat-icon">👥</span>
          <span className="stat-label">전체 고객</span>
          <span className="stat-value">{stats.totalCustomers}명 (개인 {stats.personalCount}, 법인 {stats.corporateCount})</span>
        </div>
        <span className="stat-divider">·</span>
        <div className="stat-item">
          <span className="stat-icon">🗺️</span>
          <span className="stat-label">지역</span>
          <span className="stat-value">{stats.citiesCount}</span>
        </div>
        <span className="stat-divider">·</span>
        <div className="stat-item">
          <span className="stat-icon">📍</span>
          <span className="stat-label">구/군</span>
          <span className="stat-value">{stats.districtsCount}</span>
        </div>

        {/* 모두 펼치기/접기 토글 버튼 & 새로고침 버튼 */}
        <div className="tree-actions">
          <RefreshButton
            onClick={onRefresh}
            loading={loading}
            tooltip="지역별 고객 새로고침"
            size="small"
          />
          <button
            type="button"
            className="tree-action-btn tree-action-btn--icon-only"
            onClick={toggleExpandAll}
            title={isAllExpanded ? "모든 폴더 접기" : "모든 폴더 펼치기"}
            aria-label={isAllExpanded ? "모든 폴더 접기" : "모든 폴더 펼치기"}
          >
            {isAllExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* 트리 */}
      <div className="regional-tree-container">
        {treeData.map(node => renderTreeNode(node))}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // 커스텀 비교 함수: 고객 목록 길이와 선택된 ID만 비교
  return (
    prevProps.customers.length === nextProps.customers.length &&
    prevProps.selectedCustomerId === nextProps.selectedCustomerId &&
    prevProps.loading === nextProps.loading
  )
})

RegionalTreeView.displayName = 'RegionalTreeView'

export default RegionalTreeView
