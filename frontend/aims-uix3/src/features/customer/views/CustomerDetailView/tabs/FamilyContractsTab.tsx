/**
 * AIMS UIX-3 Customer Detail - Family Contracts Tab
 * @since 2026-02-14
 *
 * 🍎 개인 고객의 가족 구성원 전체 보험 계약 통합 조회
 * - 본인 + 가족관계(배우자, 자녀 등) 구성원의 AR/CRS/수동 계약을 병합
 * - 증권번호 기준 중복 제거 (우선순위: AR > CRS > 수동)
 * - 관계 뱃지, 정렬, 검색 지원 (페이지네이션 없이 전체 스크롤)
 */

import React, { useCallback, useState, useMemo, useEffect } from 'react'
import type { Customer } from '@/entities/customer/model'
import type { Contract } from '@/entities/contract/model'
import { ContractService } from '@/services/contractService'
import {
  AnnualReportApi,
  type AnnualReport,
  groupContractsByPolicyNumber,
} from '@/features/customer/api/annualReportApi'
import {
  CustomerReviewApi,
  type CustomerReview,
} from '@/features/customer/api/customerReviewApi'
import { RelationshipService, type Relationship } from '@/services/relationshipService'
import { UserContextService } from '../../../../../components/DocumentViews/DocumentRegistrationView/services/userContextService'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { errorReporter } from '@/shared/lib/errorReporter'
import { useColumnResize, type ColumnConfig } from '@/hooks/useColumnResize'
import { formatDate } from '@/shared/lib/timeUtils'
import './FamilyContractsTab.css'

// ==================== 타입 정의 ====================

interface FamilyContractsTabProps {
  customer: Customer
  /** 외부에서 전달받는 검색어 */
  searchTerm?: string
  /** 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void
  /** 가족 계약 수 변경 콜백 */
  onFamilyContractCountChange?: (count: number) => void
  /** 탭 클릭 시 데이터 새로고침 트리거 */
  refreshTrigger?: number
}

/** 통합 가족 계약 타입 */
interface FamilyContract {
  policyNumber: string       // 증권번호 (유일 키)
  productName: string        // 보험상품
  holderName: string         // 계약자
  insuredName: string        // 피보험자
  contractDate: string       // 계약일
  status: string             // 계약상태
  premium: number            // 보험료
  coverageAmount: number     // 가입금액 (만원)
  memberName: string         // 데이터 출처 가족 구성원명
  memberRelationship: string // 관계 (본인/배우자/자녀 등)
  source: 'ar' | 'crs' | 'manual'
}

// ==================== 상수 ====================

// 🍎 컬럼 리사이즈 설정 (9칼럼)
const FAMILY_CONTRACTS_COLUMNS: ColumnConfig[] = [
  { id: 'relation', minWidth: 50, maxWidth: 70 },
  { id: 'policy', minWidth: 83, maxWidth: 130 },
  { id: 'product', minWidth: 110, maxWidth: 440 },
  { id: 'holder', minWidth: 44, maxWidth: 77 },
  { id: 'insured', minWidth: 44, maxWidth: 77 },
  { id: 'date', minWidth: 72, maxWidth: 88 },
  { id: 'status', minWidth: 42, maxWidth: 61 },
  { id: 'amount', minWidth: 55, maxWidth: 83 },
  { id: 'premium', minWidth: 66, maxWidth: 105 },
]

// 정렬 필드 타입
type SortField = 'memberRelationship' | 'policyNumber' | 'productName' | 'holderName' | 'insuredName' | 'contractDate' | 'status' | 'coverageAmount' | 'premium'
type SortDirection = 'asc' | 'desc'

// 관계 뱃지 CSS 클래스 매핑
const RELATION_BADGE_CLASS: Record<string, string> = {
  '본인': 'fc-relation-badge--본인',
  '배우자': 'fc-relation-badge--배우자',
  '자녀': 'fc-relation-badge--자녀',
  '부모': 'fc-relation-badge--부모',
}

// 관계 타입 → 한글 라벨 매핑
const RELATION_TYPE_LABELS: Record<string, string> = {
  'spouse': '배우자',
  'child': '자녀',
  'parent': '부모',
  'sibling': '형제자매',
  'uncle_aunt': '삼촌/이모',
  'nephew_niece': '조카',
  'cousin': '사촌',
  'in_law': '인척',
  'grandparent': '조부모',
  'grandchild': '손자녀',
}

// ==================== 컴포넌트 ====================

export const FamilyContractsTab: React.FC<FamilyContractsTabProps> = ({
  customer,
  searchTerm: externalSearchTerm,
  onSearchChange,
  onFamilyContractCountChange,
  refreshTrigger
}) => {
  // 🍎 상태
  const [familyContracts, setFamilyContracts] = useState<FamilyContract[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [familyMemberNames, setFamilyMemberNames] = useState<Set<string>>(new Set())

  // 🍎 검색어 (외부/내부)
  const [internalSearchTerm, setInternalSearchTerm] = useState('')
  const searchTerm = externalSearchTerm ?? internalSearchTerm
  const _setSearchTerm = onSearchChange ?? setInternalSearchTerm

  // 🍎 정렬
  const [sortField, setSortField] = useState<SortField>('policyNumber')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // 🍎 칼럼 기본 폭
  const fcDefaultWidths = useMemo(() => ({
    relation: 55,
    policy: 94,
    product: 198,
    holder: 50,
    insured: 50,
    date: 75,
    status: 46,
    amount: 61,
    premium: 83,
  }), [])

  // 🍎 칼럼 리사이즈
  const {
    columnWidths: fcColumnWidths,
    getResizeHandleProps: getFcResizeHandleProps,
    isResizing: isFcResizing,
  } = useColumnResize({
    columns: FAMILY_CONTRACTS_COLUMNS,
    storageKey: 'family-contracts-tab',
    defaultWidths: fcDefaultWidths,
  })

  // ==================== 데이터 로드 ====================

  const loadFamilyContracts = useCallback(async () => {
    if (!customer?._id) return

    setIsLoading(true)
    setError(null)

    try {
      // Step 1: 가족 관계 로드
      const relationships = await RelationshipService.getCustomerRelationships(customer._id)
      const familyRelations = relationships.filter(
        (rel: Relationship) => rel.relationship_info.relationship_category === 'family'
      )

      // 가족 구성원 맵: ID → { name, relationship }
      const familyMembers = new Map<string, { name: string; relationship: string }>()

      // 본인 추가
      const selfName = customer.personal_info?.name || '-'
      familyMembers.set(customer._id, { name: selfName, relationship: '본인' })

      // 가족 구성원 추가
      for (const rel of familyRelations) {
        const relatedCustomer = rel.related_customer as Customer
        const fromCustomer = rel.from_customer as Customer

        // 관계 라벨 결정
        const relLabel = rel.display_relationship_label
          || RELATION_TYPE_LABELS[rel.relationship_info.relationship_type]
          || rel.relationship_info.relationship_type
          || '가족'

        if (typeof relatedCustomer === 'object' && relatedCustomer._id && relatedCustomer._id !== customer._id) {
          if (!familyMembers.has(relatedCustomer._id)) {
            familyMembers.set(relatedCustomer._id, {
              name: relatedCustomer.personal_info?.name || '-',
              relationship: relLabel
            })
          }
        }
        if (typeof fromCustomer === 'object' && fromCustomer._id && fromCustomer._id !== customer._id) {
          if (!familyMembers.has(fromCustomer._id)) {
            familyMembers.set(fromCustomer._id, {
              name: fromCustomer.personal_info?.name || '-',
              relationship: relLabel
            })
          }
        }
      }

      setMemberCount(familyMembers.size)

      // 구성원 이름 Set 저장 (계약자/피보험자 강조용)
      const nameSet = new Set<string>()
      familyMembers.forEach(m => { if (m.name !== '-') nameSet.add(m.name) })
      setFamilyMemberNames(nameSet)

      // Step 2: 각 구성원별 AR / CRS / 수동 계약 병렬 로드
      const userId = UserContextService.getContext().identifierValue
      const memberIds = Array.from(familyMembers.keys())

      const results = await Promise.allSettled(
        memberIds.flatMap(memberId => [
          AnnualReportApi.getAnnualReports(memberId, userId, 50),
          CustomerReviewApi.getCustomerReviews(memberId, 100),
          ContractService.getContractsByCustomer(memberId),
        ])
      )

      // Step 3: 병합 & 중복 제거
      const seenPolicies = new Map<string, FamilyContract>()

      for (let i = 0; i < memberIds.length; i++) {
        const memberId = memberIds[i]
        const memberInfo = familyMembers.get(memberId)!
        const baseIdx = i * 3

        // --- AR 결과 (최우선) ---
        const arResult = results[baseIdx]
        if (arResult.status === 'fulfilled') {
          const arResponse = arResult.value as { success?: boolean; data?: { reports: AnnualReport[] } }
          if (arResponse.success && arResponse.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const completedReports = (arResponse.data.reports as any[])
              .filter(r => r.status === 'completed')
              .map(r => ({
                report_id: r.report_id || r.file_id || '',
                issue_date: r.issue_date || '',
                customer_name: r.customer_name || '',
                contracts: r.contracts || [],
                status: r.status || 'completed',
              })) as AnnualReport[]

            const histories = groupContractsByPolicyNumber(completedReports)

            for (const history of histories) {
              if (!seenPolicies.has(history.policyNumber)) {
                seenPolicies.set(history.policyNumber, {
                  policyNumber: history.policyNumber,
                  productName: history.productName || '-',
                  holderName: history.holder || '-',
                  insuredName: history.insured || '-',
                  contractDate: history.contractDate || '-',
                  status: history.latestSnapshot.status || '-',
                  premium: history.latestSnapshot.premium || 0,
                  coverageAmount: history.latestSnapshot.coverageAmount || 0,
                  memberName: memberInfo.name,
                  memberRelationship: memberInfo.relationship,
                  source: 'ar',
                })
              }
            }
          }
        }

        // --- CRS 결과 ---
        const crsResult = results[baseIdx + 1]
        if (crsResult.status === 'fulfilled') {
          const crsResponse = crsResult.value as { success?: boolean; data?: { reviews: CustomerReview[] } }
          if (crsResponse.success && crsResponse.data) {
            for (const review of crsResponse.data.reviews) {
              const pn = review.contract_info?.policy_number
              if (!pn || seenPolicies.has(pn)) continue

              seenPolicies.set(pn, {
                policyNumber: pn,
                productName: review.product_name || '-',
                holderName: review.contractor_name || '-',
                insuredName: review.insured_name || '-',
                contractDate: review.contract_info?.contract_date || '-',
                status: '-',
                premium: 0,
                coverageAmount: review.contract_info?.insured_amount ? Math.round(review.contract_info.insured_amount / 10000) : 0,
                memberName: memberInfo.name,
                memberRelationship: memberInfo.relationship,
                source: 'crs',
              })
            }
          }
        }

        // --- 수동 계약 결과 ---
        const manualResult = results[baseIdx + 2]
        if (manualResult.status === 'fulfilled') {
          const contracts = manualResult.value as Contract[]
          if (Array.isArray(contracts)) {
            for (const contract of contracts) {
              if (!contract.policy_number || seenPolicies.has(contract.policy_number)) continue

              seenPolicies.set(contract.policy_number, {
                policyNumber: contract.policy_number,
                productName: contract.product_name || '-',
                holderName: contract.customer_name || '-',
                insuredName: contract.insured_person || '-',
                contractDate: contract.contract_date || '-',
                status: contract.payment_status || '-',
                premium: contract.premium || 0,
                coverageAmount: 0,
                memberName: memberInfo.name,
                memberRelationship: memberInfo.relationship,
                source: 'manual',
              })
            }
          }
        }
      }

      const merged = Array.from(seenPolicies.values())
      setFamilyContracts(merged)
      onFamilyContractCountChange?.(merged.length)
    } catch (err) {
      console.error('[FamilyContractsTab] 가족 계약 로드 실패:', err)
      errorReporter.reportApiError(err as Error, {
        component: 'FamilyContractsTab.loadFamilyContracts',
        payload: { customerId: customer._id }
      })
      setError(err instanceof Error ? err.message : '가족 계약 정보를 불러올 수 없습니다.')
      onFamilyContractCountChange?.(0)
    } finally {
      setIsLoading(false)
    }
  }, [customer?._id, onFamilyContractCountChange])

  // 🍎 마운트 시 로드
  useEffect(() => {
    loadFamilyContracts()
  }, [loadFamilyContracts])

  // 🍎 탭 클릭 시 데이터 새로고침
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      void loadFamilyContracts()
    }
  }, [refreshTrigger, loadFamilyContracts])

  // ==================== 검색 & 정렬 ====================

  // 검색 필터링
  const filteredContracts = useMemo(() => {
    if (!searchTerm) return familyContracts
    const term = searchTerm.toLowerCase()
    return familyContracts.filter(c =>
      c.productName.toLowerCase().includes(term) ||
      c.policyNumber.toLowerCase().includes(term) ||
      c.holderName.toLowerCase().includes(term) ||
      c.insuredName.toLowerCase().includes(term) ||
      c.memberName.toLowerCase().includes(term)
    )
  }, [familyContracts, searchTerm])

  // 정렬
  const sortedContracts = useMemo(() => {
    const sorted = [...filteredContracts]
    sorted.sort((a, b) => {
      let valA: string | number = ''
      let valB: string | number = ''

      switch (sortField) {
        case 'memberRelationship':
          valA = a.memberRelationship
          valB = b.memberRelationship
          break
        case 'policyNumber':
          valA = a.policyNumber
          valB = b.policyNumber
          break
        case 'productName':
          valA = a.productName
          valB = b.productName
          break
        case 'holderName':
          valA = a.holderName
          valB = b.holderName
          break
        case 'insuredName':
          valA = a.insuredName
          valB = b.insuredName
          break
        case 'contractDate':
          valA = a.contractDate
          valB = b.contractDate
          break
        case 'status':
          valA = a.status
          valB = b.status
          break
        case 'coverageAmount':
          valA = a.coverageAmount
          valB = b.coverageAmount
          break
        case 'premium':
          valA = a.premium
          valB = b.premium
          break
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA
      }
      const cmp = String(valA).localeCompare(String(valB))
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredContracts, sortField, sortDirection])

  // 정렬 토글 핸들러
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }, [sortField])

  // 정렬 인디케이터
  const renderSortIndicator = useCallback((field: SortField) => {
    if (sortField === field) {
      return <span className="fc-sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
    }
    return null
  }, [sortField, sortDirection])

  // 금액 포맷
  const formatAmount = (amount: number): string => {
    if (!amount) return '-'
    return amount.toLocaleString()
  }

  const formatPremium = (premium: number): string => {
    if (!premium) return '-'
    return premium.toLocaleString()
  }

  // 관계 뱃지 렌더링
  const renderRelationBadge = (relationship: string) => {
    const badgeClass = RELATION_BADGE_CLASS[relationship] || 'fc-relation-badge--default'
    return <span className={`fc-relation-badge ${badgeClass}`}>{relationship}</span>
  }

  // ==================== 렌더링 ====================

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="family-contracts">
        <div className="family-contracts__state">
          <SFSymbol
            name="arrow.trianglehead.2.clockwise"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
            animation={SFSymbolAnimation.ROTATE}
          />
          <span className="family-contracts__loading-text">
            가족 구성원의 계약을 조회하는 중...
          </span>
        </div>
      </div>
    )
  }

  // 에러 상태
  if (error) {
    return (
      <div className="family-contracts">
        <div className="family-contracts__state family-contracts__state--error">
          <SFSymbol
            name="exclamationmark.triangle"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // 빈 상태: 가족 관계 없음
  if (memberCount <= 1 && familyContracts.length === 0) {
    return (
      <div className="family-contracts">
        <div className="family-contracts__state">
          <SFSymbol
            name="person.2"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>등록된 가족 관계가 없습니다.</span>
          <span className="family-contracts__loading-text">
            가족 구성원을 추가하면 가족 계약을 조회할 수 있습니다.
          </span>
        </div>
      </div>
    )
  }

  // 빈 상태: 계약 없음
  if (familyContracts.length === 0) {
    return (
      <div className="family-contracts">
        <div className="family-contracts__state">
          <SFSymbol
            name="doc.text.magnifyingglass"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>가족 구성원의 보험 계약이 없습니다.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="family-contracts">
      {/* 🍎 요약 헤더 */}
      <div className="family-contracts__summary">
        <span>
          가족 <strong>{memberCount}</strong>명 · 계약 <strong>{filteredContracts.length}</strong>건
        </span>
      </div>

      {/* 🍎 테이블 */}
      <div
        className={`family-contracts__table-section${isFcResizing ? ' is-resizing' : ''}`}
        style={{
          '--fc-relation-width': `${fcColumnWidths['relation'] || fcDefaultWidths.relation}px`,
          '--fc-policy-width': `${fcColumnWidths['policy'] || fcDefaultWidths.policy}px`,
          '--fc-product-width': `${fcColumnWidths['product'] || fcDefaultWidths.product}px`,
          '--fc-holder-width': `${fcColumnWidths['holder'] || fcDefaultWidths.holder}px`,
          '--fc-insured-width': `${fcColumnWidths['insured'] || fcDefaultWidths.insured}px`,
          '--fc-date-width': `${fcColumnWidths['date'] || fcDefaultWidths.date}px`,
          '--fc-status-width': `${fcColumnWidths['status'] || fcDefaultWidths.status}px`,
          '--fc-amount-width': `${fcColumnWidths['amount'] || fcDefaultWidths.amount}px`,
          '--fc-premium-width': `${fcColumnWidths['premium'] || fcDefaultWidths.premium}px`,
        } as React.CSSProperties}
      >
        {/* 헤더 */}
        <div className="family-contracts-header">
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('memberRelationship')}
            role="button"
            tabIndex={0}
          >
            <span>관계</span>
            {renderSortIndicator('memberRelationship')}
            <div {...getFcResizeHandleProps('relation')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('policyNumber')}
            role="button"
            tabIndex={0}
          >
            <span>증권번호</span>
            {renderSortIndicator('policyNumber')}
            <div {...getFcResizeHandleProps('policy')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('productName')}
            role="button"
            tabIndex={0}
          >
            <span>보험상품</span>
            {renderSortIndicator('productName')}
            <div {...getFcResizeHandleProps('product')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('holderName')}
            role="button"
            tabIndex={0}
          >
            <span>계약자</span>
            {renderSortIndicator('holderName')}
            <div {...getFcResizeHandleProps('holder')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('insuredName')}
            role="button"
            tabIndex={0}
          >
            <span>피보험자</span>
            {renderSortIndicator('insuredName')}
            <div {...getFcResizeHandleProps('insured')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('contractDate')}
            role="button"
            tabIndex={0}
          >
            <span>계약일</span>
            {renderSortIndicator('contractDate')}
            <div {...getFcResizeHandleProps('date')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('status')}
            role="button"
            tabIndex={0}
          >
            <span>상태</span>
            {renderSortIndicator('status')}
            <div {...getFcResizeHandleProps('status')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('coverageAmount')}
            role="button"
            tabIndex={0}
          >
            <span>가입금액</span>
            {renderSortIndicator('coverageAmount')}
            <div {...getFcResizeHandleProps('amount')} />
          </div>
          <div
            className="header-sortable"
            onClick={() => handleSort('premium')}
            role="button"
            tabIndex={0}
          >
            <span>보험료</span>
            {renderSortIndicator('premium')}
          </div>
        </div>

        {/* 리스트 */}
        <div className="family-contracts-list">
          {sortedContracts.map((contract) => (
            <div key={contract.policyNumber} className="family-contracts-row">
              <span className="fc-relation">
                {renderRelationBadge(contract.memberRelationship)}
              </span>
              <span className="fc-policy">{contract.policyNumber}</span>
              <span className="fc-product" title={contract.productName}>{contract.productName}</span>
              <span className={`fc-holder${familyMemberNames.has(contract.holderName) ? ' fc-holder--family' : ''}`}>
                {contract.holderName}
              </span>
              <span className={`fc-insured${familyMemberNames.has(contract.insuredName) ? ' fc-insured--family' : ''}`}>
                {contract.insuredName}
              </span>
              <span className="fc-date">{formatDate(contract.contractDate)}</span>
              <span className={`fc-status fc-status--${contract.status}`}>{contract.status}</span>
              <span className="fc-amount">{formatAmount(contract.coverageAmount)}</span>
              <span className="fc-premium">{formatPremium(contract.premium)}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
