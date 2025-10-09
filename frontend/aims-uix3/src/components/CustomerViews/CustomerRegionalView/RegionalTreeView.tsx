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
import './RegionalTreeView.css'

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
  loading = false
}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['no-address']))

  // 지역별 그룹핑 - aims-uix2와 동일한 로직
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
      const city = parts[0] || '기타'
      const district = parts[1] || '기타구'

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
    return { totalCustomers, citiesCount, districtsCount, noAddressCount: noAddressCustomers.length }
  }, [regionalGroups, customers.length])

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

  // 노드 확장/축소 토글
  const toggleNode = (key: string) => {
    setExpandedKeys(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  // 고객 선택 핸들러
  const handleCustomerClick = (customer: Customer) => {
    if (onCustomerSelect && customer._id) {
      onCustomerSelect(customer._id)
    }
  }

  // 고객 타입 아이콘
  const getCustomerTypeIcon = (customer: Customer) => {
    const customerType = customer.insurance_info?.customer_type
    return customerType === '법인' ? 'building-2' : 'person'
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
                <SFSymbol
                  name={getCustomerTypeIcon(customer)}
                  size={SFSymbolSize.FOOTNOTE}
                  weight={SFSymbolWeight.REGULAR}
                  className="tree-customer-icon"
                />
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

      {/* 통계 */}
      <div className="regional-tree-stats">
        <span><strong>전체 고객:</strong> {stats.totalCustomers}명</span>
        <span className="stat-divider">|</span>
        <span><strong>지역:</strong> {stats.citiesCount}개</span>
        <span className="stat-divider">|</span>
        <span><strong>구/군:</strong> {stats.districtsCount}개</span>
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
