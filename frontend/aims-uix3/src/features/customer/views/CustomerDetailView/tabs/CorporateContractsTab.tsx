/**
 * AIMS UIX-3 Customer Detail - Corporate Contracts Tab
 * @since 2026-02-14
 *
 * 🍎 법인 관계 구성원 전체 보험 계약 통합 조회
 * - 개인고객: 관계된 법인의 모든 구성원 계약 표시
 * - 법인고객: 관계된 모든 개인/법인의 계약 표시
 * - 증권번호 기준 중복 제거 (우선순위: AR > CRS > 수동)
 * - 관계 뱃지, 정렬, 검색 지원 (페이지네이션 없이 전체 스크롤)
 */

import React, { useCallback, useState, useMemo, useEffect } from 'react'
import type { Customer } from '@/entities/customer/model'
import type { Contract } from '@/entities/contract/model'
import { ContractService } from '@/services/contractService'
import { CustomerService } from '@/services/customerService'
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
import './CorporateContractsTab.css'

// ==================== 타입 정의 ====================

interface CorporateContractsTabProps {
  customer: Customer
  /** 외부에서 전달받는 검색어 */
  searchTerm?: string
  /** 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void
  /** 법인 계약 수 변경 콜백 */
  onCorporateContractCountChange?: (count: number) => void
  /** 탭 클릭 시 데이터 새로고침 트리거 */
  refreshTrigger?: number
}

/** 통합 법인 계약 타입 */
interface CorporateContract {
  policyNumber: string       // 증권번호 (유일 키)
  productName: string        // 보험상품
  holderName: string         // 계약자
  insuredName: string        // 피보험자
  contractDate: string       // 계약일
  status: string             // 계약상태
  premium: number            // 보험료
  coverageAmount: number     // 가입금액 (만원)
  memberName: string         // 데이터 출처 구성원명
  memberRelationship: string // 관계 (대표이사/직원/임원 등)
  source: 'ar' | 'crs' | 'manual'
}

// ==================== 상수 ====================

// 🍎 컬럼 리사이즈 설정 (9칼럼)
const CORPORATE_CONTRACTS_COLUMNS: ColumnConfig[] = [
  { id: 'relation', minWidth: 50, maxWidth: 80 },
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
  '본인': 'cc-relation-badge--본인',
  '대표이사': 'cc-relation-badge--대표이사',
  '임원': 'cc-relation-badge--임원',
  '직원': 'cc-relation-badge--직원',
  '주주': 'cc-relation-badge--주주',
  '이사': 'cc-relation-badge--이사',
  '회사': 'cc-relation-badge--회사',
  '고용주': 'cc-relation-badge--고용주',
}

// 관계 타입 → 한글 라벨 매핑
const CORP_RELATION_TYPE_LABELS: Record<string, string> = {
  'ceo': '대표이사',
  'executive': '임원',
  'employee': '직원',
  'shareholder': '주주',
  'director': '이사',
  'company': '회사',
  'employer': '고용주',
}

// ==================== 컴포넌트 ====================

export const CorporateContractsTab: React.FC<CorporateContractsTabProps> = ({
  customer,
  searchTerm: externalSearchTerm,
  onSearchChange,
  onCorporateContractCountChange,
  refreshTrigger
}) => {
  // 🍎 상태
  const [corporateContracts, setCorporateContracts] = useState<CorporateContract[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [corporateMemberNames, setCorporateMemberNames] = useState<Set<string>>(new Set())

  // 🍎 검색어 (외부/내부)
  const [internalSearchTerm, setInternalSearchTerm] = useState('')
  const searchTerm = externalSearchTerm ?? internalSearchTerm
  const _setSearchTerm = onSearchChange ?? setInternalSearchTerm

  // 🍎 정렬
  const [sortField, setSortField] = useState<SortField>('policyNumber')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // 🍎 칼럼 기본 폭
  const ccDefaultWidths = useMemo(() => ({
    relation: 60,
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
    columnWidths: ccColumnWidths,
    getResizeHandleProps: getCcResizeHandleProps,
    isResizing: isCcResizing,
  } = useColumnResize({
    columns: CORPORATE_CONTRACTS_COLUMNS,
    storageKey: 'corporate-contracts-tab',
    defaultWidths: ccDefaultWidths,
  })

  // ==================== 데이터 로드 ====================

  const loadCorporateContracts = useCallback(async () => {
    if (!customer?._id) return

    setIsLoading(true)
    setError(null)

    try {
      // Step 1: 관계 데이터 로드 → 가족 이름 수집 + 명시적 법인 관계 수집
      const relationships = await RelationshipService.getCustomerRelationships(customer._id)

      // 🍎 가족 구성원 이름 Set (본인 포함) — 법인계약 판별 시 제외 대상
      const familyNames = new Set<string>()
      const selfName = customer.personal_info?.name
      if (selfName) familyNames.add(selfName)

      const familyRelations = relationships.filter(
        (rel: Relationship) => rel.relationship_info.relationship_category === 'family'
      )
      for (const rel of familyRelations) {
        const relatedCustomer = rel.related_customer as Customer
        const fromCustomer = rel.from_customer as Customer
        if (typeof relatedCustomer === 'object' && relatedCustomer.personal_info?.name) {
          familyNames.add(relatedCustomer.personal_info.name)
        }
        if (typeof fromCustomer === 'object' && fromCustomer.personal_info?.name) {
          familyNames.add(fromCustomer.personal_info.name)
        }
      }

      // 🍎 명시적 법인 관계: corpName → relationship label (있으면 관계 라벨 사용)
      const corporateRelations = relationships.filter(
        (rel: Relationship) => rel.relationship_info.relationship_category === 'corporate'
      )
      const explicitCorpMap = new Map<string, string>()
      for (const rel of corporateRelations) {
        const relatedCustomer = rel.related_customer as Customer
        const fromCustomer = rel.from_customer as Customer
        const relLabel = rel.display_relationship_label
          || CORP_RELATION_TYPE_LABELS[rel.relationship_info.relationship_type]
          || rel.relationship_info.relationship_type
          || '법인관계'

        if (typeof relatedCustomer === 'object' && relatedCustomer._id && relatedCustomer._id !== customer._id) {
          const name = relatedCustomer.personal_info?.name
          if (name && !explicitCorpMap.has(name)) explicitCorpMap.set(name, relLabel)
        }
        if (typeof fromCustomer === 'object' && fromCustomer._id && fromCustomer._id !== customer._id) {
          const name = fromCustomer.personal_info?.name
          if (name && !explicitCorpMap.has(name)) explicitCorpMap.set(name, relLabel)
        }
      }

      // ===== 법인/개인 분기 =====
      const isCorpCustomer = customer.insurance_info?.customer_type === '법인'
      const userId = UserContextService.getContext().identifierValue

      if (isCorpCustomer && selfName) {
        // =====================================================
        // 🏢 법인 고객 경로: 관련 개인들의 계약에서 이 법인이 계약자/피보험자인 것
        // =====================================================

        // (A) 명시적 법인 관계에서 관련 개인 수집
        const uniqueRelated = new Map<string, { name: string; relLabel: string }>()
        for (const rel of corporateRelations) {
          const relatedCustomer = rel.related_customer as Customer
          const fromCustomer = rel.from_customer as Customer
          const relLabel = rel.display_relationship_label
            || CORP_RELATION_TYPE_LABELS[rel.relationship_info.relationship_type]
            || rel.relationship_info.relationship_type
            || '법인관계'

          if (typeof relatedCustomer === 'object' && relatedCustomer._id && relatedCustomer._id !== customer._id) {
            if (!uniqueRelated.has(relatedCustomer._id)) {
              uniqueRelated.set(relatedCustomer._id, { name: relatedCustomer.personal_info?.name || '', relLabel })
            }
          }
          if (typeof fromCustomer === 'object' && fromCustomer._id && fromCustomer._id !== customer._id) {
            if (!uniqueRelated.has(fromCustomer._id)) {
              uniqueRelated.set(fromCustomer._id, { name: fromCustomer.personal_info?.name || '', relLabel })
            }
          }
        }

        // (B) 암시적 감지: AR/CRS/수동계약에서 이 법인명이 계약자/피보험자인 고객 검색
        const implicitCustomers = await CustomerService.findCustomersByContractParty(selfName)
        for (const c of implicitCustomers) {
          if (c._id !== customer._id && !uniqueRelated.has(c._id)) {
            uniqueRelated.set(c._id, { name: c.name, relLabel: '법인' })
          }
        }

        // (C) name→relLabel 조회 테이블 (본인 데이터에서 상대방 관계 파악용)
        const nameToRelLabel = new Map<string, string>()
        for (const [, info] of uniqueRelated) {
          if (info.name) nameToRelLabel.set(info.name, info.relLabel)
        }

        // 본인 데이터에서 상대방의 관계 라벨 결정
        const resolveRelLabel = (baseLabel: string, isSelfData: boolean, holder: string, insured: string): string => {
          if (!isSelfData) return baseLabel
          const otherParty = holder !== selfName ? holder : (insured !== selfName ? insured : '')
          if (otherParty && nameToRelLabel.has(otherParty)) return nameToRelLabel.get(otherParty)!
          if (otherParty) return '법인'
          return baseLabel
        }

        // 자기 자신 + 관련 고객들의 계약 병렬 로드
        const allCustomerIds = [customer._id, ...uniqueRelated.keys()]
        const loadResults = await Promise.all(
          allCustomerIds.map(async (custId) => {
            const [ar, crs, manual] = await Promise.allSettled([
              AnnualReportApi.getAnnualReports(custId, userId, 50),
              CustomerReviewApi.getCustomerReviews(custId, 100),
              ContractService.getContractsByCustomer(custId),
            ])
            return { custId, ar, crs, manual }
          })
        )

        const seenPolicies = new Map<string, CorporateContract>()
        const discoveredMembers = new Set<string>()

        // selfName(법인명)이 계약자 or 피보험자인지 체크
        const isSelfInvolved = (holder: string, insured: string): boolean =>
          holder === selfName || insured === selfName

        for (const { custId, ar, crs, manual } of loadResults) {
          const isSelf = custId === customer._id
          const relInfo = uniqueRelated.get(custId)
          const relLabel = isSelf ? '본인' : (relInfo?.relLabel || '법인관계')
          const memberName = isSelf ? selfName : (relInfo?.name || '')

          // --- AR (최우선) ---
          if (ar.status === 'fulfilled') {
            const arResponse = ar.value as { success?: boolean; data?: { reports: AnnualReport[] } }
            if (arResponse.success && arResponse.data) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const completedReports = (arResponse.data.reports as any[])
                .filter(r => r.status === 'completed')
                .map(r => ({ report_id: r.report_id || r.file_id || '', issue_date: r.issue_date || '', customer_name: r.customer_name || '', contracts: r.contracts || [], status: r.status || 'completed' })) as AnnualReport[]

              for (const h of groupContractsByPolicyNumber(completedReports)) {
                if (!isSelfInvolved(h.holder || '', h.insured || '') || seenPolicies.has(h.policyNumber)) continue
                discoveredMembers.add(memberName)
                seenPolicies.set(h.policyNumber, {
                  policyNumber: h.policyNumber, productName: h.productName || '-',
                  holderName: h.holder || '-', insuredName: h.insured || '-',
                  contractDate: h.contractDate || '-', status: h.latestSnapshot.status || '-',
                  premium: h.latestSnapshot.premium || 0, coverageAmount: h.latestSnapshot.coverageAmount || 0,
                  memberName, memberRelationship: resolveRelLabel(relLabel, isSelf, h.holder || '', h.insured || ''), source: 'ar',
                })
              }
            }
          }

          // --- CRS ---
          if (crs.status === 'fulfilled') {
            const crsResponse = crs.value as { success?: boolean; data?: { reviews: CustomerReview[] } }
            if (crsResponse.success && crsResponse.data) {
              for (const review of crsResponse.data.reviews) {
                const pn = review.contract_info?.policy_number
                if (!pn || seenPolicies.has(pn)) continue
                if (!isSelfInvolved(review.contractor_name || '', review.insured_name || '')) continue
                discoveredMembers.add(memberName)
                seenPolicies.set(pn, {
                  policyNumber: pn, productName: review.product_name || '-',
                  holderName: review.contractor_name || '-', insuredName: review.insured_name || '-',
                  contractDate: review.contract_info?.contract_date || '-', status: '-',
                  premium: 0, coverageAmount: review.contract_info?.insured_amount ? Math.round(review.contract_info.insured_amount / 10000) : 0,
                  memberName, memberRelationship: resolveRelLabel(relLabel, isSelf, review.contractor_name || '', review.insured_name || ''), source: 'crs',
                })
              }
            }
          }

          // --- 수동 계약 ---
          if (manual.status === 'fulfilled') {
            const contracts = manual.value as Contract[]
            if (Array.isArray(contracts)) {
              for (const c of contracts) {
                if (!c.policy_number || seenPolicies.has(c.policy_number)) continue
                if (!isSelfInvolved(c.customer_name || '', c.insured_person || '')) continue
                discoveredMembers.add(memberName)
                seenPolicies.set(c.policy_number, {
                  policyNumber: c.policy_number, productName: c.product_name || '-',
                  holderName: c.customer_name || '-', insuredName: c.insured_person || '-',
                  contractDate: c.contract_date || '-', status: c.payment_status || '-',
                  premium: c.premium || 0, coverageAmount: 0,
                  memberName, memberRelationship: resolveRelLabel(relLabel, isSelf, c.customer_name || '', c.insured_person || ''), source: 'manual',
                })
              }
            }
          }
        }

        setMemberCount(discoveredMembers.size)
        setCorporateMemberNames(new Set([selfName]))

        const merged = Array.from(seenPolicies.values())
        setCorporateContracts(merged)
        onCorporateContractCountChange?.(merged.length)
        return
      }

      // =====================================================
      // 👤 개인 고객 경로: 현재 고객의 계약에서 법인명 매칭
      // =====================================================

      // Step 2: 현재 고객의 AR / CRS / 수동 계약을 병렬 로드
      const [arResult, crsResult, manualResult] = await Promise.allSettled([
        AnnualReportApi.getAnnualReports(customer._id, userId, 50),
        CustomerReviewApi.getCustomerReviews(customer._id, 100),
        ContractService.getContractsByCustomer(customer._id),
      ])

      // Step 3: 계약에서 본인/가족이 아닌 계약자/피보험자 이름 후보 수집
      const candidateNames = new Set<string>()

      const collectCandidates = (holderName: string, insuredName: string) => {
        if (holderName && holderName !== '-' && !familyNames.has(holderName)) {
          candidateNames.add(holderName)
        }
        if (insuredName && insuredName !== '-' && !familyNames.has(insuredName)) {
          candidateNames.add(insuredName)
        }
      }

      // AR에서 후보 수집
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let arHistories: any[] = []
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

          arHistories = groupContractsByPolicyNumber(completedReports)
          for (const h of arHistories) collectCandidates(h.holder || '', h.insured || '')
        }
      }

      // CRS에서 후보 수집
      let crsReviews: CustomerReview[] = []
      if (crsResult.status === 'fulfilled') {
        const crsResponse = crsResult.value as { success?: boolean; data?: { reviews: CustomerReview[] } }
        if (crsResponse.success && crsResponse.data) {
          crsReviews = crsResponse.data.reviews
          for (const r of crsReviews) collectCandidates(r.contractor_name || '', r.insured_name || '')
        }
      }

      // 수동 계약에서 후보 수집
      let manualContracts: Contract[] = []
      if (manualResult.status === 'fulfilled') {
        const contracts = manualResult.value as Contract[]
        if (Array.isArray(contracts)) {
          manualContracts = contracts
          for (const c of manualContracts) collectCandidates(c.customer_name || '', c.insured_person || '')
        }
      }

      // Step 4: 후보 이름을 DB에서 검증 → 실제 법인 고객만 확인
      const confirmedCorpMap = new Map<string, string>(explicitCorpMap)
      const namesToVerify = Array.from(candidateNames).filter(n => !confirmedCorpMap.has(n))

      if (namesToVerify.length > 0) {
        const verifyResults = await Promise.allSettled(
          namesToVerify.map(name => CustomerService.checkDuplicateName(name))
        )
        for (let i = 0; i < namesToVerify.length; i++) {
          const result = verifyResults[i]
          if (result.status === 'fulfilled' && result.value.exists && result.value.customer?.customer_type === '법인') {
            confirmedCorpMap.set(namesToVerify[i], '법인')
          }
        }
      }

      // 법인으로 확정된 이름이 없으면 빈 결과
      if (confirmedCorpMap.size === 0) {
        setCorporateContracts([])
        setMemberCount(0)
        setCorporateMemberNames(new Set())
        onCorporateContractCountChange?.(0)
        return
      }

      const confirmedCorpNames = new Set(confirmedCorpMap.keys())

      const findConfirmedCorp = (holderName: string, insuredName: string): { corpName: string; relationship: string } | null => {
        if (holderName && confirmedCorpNames.has(holderName)) {
          return { corpName: holderName, relationship: confirmedCorpMap.get(holderName)! }
        }
        if (insuredName && confirmedCorpNames.has(insuredName)) {
          return { corpName: insuredName, relationship: confirmedCorpMap.get(insuredName)! }
        }
        return null
      }

      // Step 5: 확정된 법인명으로 계약 필터링 & 중복 제거
      const seenPolicies = new Map<string, CorporateContract>()
      const discoveredCorpNames = new Set<string>()

      for (const history of arHistories) {
        const match = findConfirmedCorp(history.holder || '', history.insured || '')
        if (!match || seenPolicies.has(history.policyNumber)) continue
        discoveredCorpNames.add(match.corpName)
        seenPolicies.set(history.policyNumber, {
          policyNumber: history.policyNumber, productName: history.productName || '-',
          holderName: history.holder || '-', insuredName: history.insured || '-',
          contractDate: history.contractDate || '-', status: history.latestSnapshot.status || '-',
          premium: history.latestSnapshot.premium || 0, coverageAmount: history.latestSnapshot.coverageAmount || 0,
          memberName: match.corpName, memberRelationship: match.relationship, source: 'ar',
        })
      }

      for (const review of crsReviews) {
        const pn = review.contract_info?.policy_number
        if (!pn || seenPolicies.has(pn)) continue
        const match = findConfirmedCorp(review.contractor_name || '', review.insured_name || '')
        if (!match) continue
        discoveredCorpNames.add(match.corpName)
        seenPolicies.set(pn, {
          policyNumber: pn, productName: review.product_name || '-',
          holderName: review.contractor_name || '-', insuredName: review.insured_name || '-',
          contractDate: review.contract_info?.contract_date || '-', status: '-',
          premium: 0, coverageAmount: review.contract_info?.insured_amount ? Math.round(review.contract_info.insured_amount / 10000) : 0,
          memberName: match.corpName, memberRelationship: match.relationship, source: 'crs',
        })
      }

      for (const contract of manualContracts) {
        if (!contract.policy_number || seenPolicies.has(contract.policy_number)) continue
        const match = findConfirmedCorp(contract.customer_name || '', contract.insured_person || '')
        if (!match) continue
        discoveredCorpNames.add(match.corpName)
        seenPolicies.set(contract.policy_number, {
          policyNumber: contract.policy_number, productName: contract.product_name || '-',
          holderName: contract.customer_name || '-', insuredName: contract.insured_person || '-',
          contractDate: contract.contract_date || '-', status: contract.payment_status || '-',
          premium: contract.premium || 0, coverageAmount: 0,
          memberName: match.corpName, memberRelationship: match.relationship, source: 'manual',
        })
      }

      setMemberCount(discoveredCorpNames.size)
      setCorporateMemberNames(discoveredCorpNames)

      const merged = Array.from(seenPolicies.values())
      setCorporateContracts(merged)
      onCorporateContractCountChange?.(merged.length)
    } catch (err) {
      console.error('[CorporateContractsTab] 법인 계약 로드 실패:', err)
      errorReporter.reportApiError(err as Error, {
        component: 'CorporateContractsTab.loadCorporateContracts',
        payload: { customerId: customer._id }
      })
      setError(err instanceof Error ? err.message : '법인 계약 정보를 불러올 수 없습니다.')
      onCorporateContractCountChange?.(0)
    } finally {
      setIsLoading(false)
    }
  }, [customer?._id, onCorporateContractCountChange])

  // 🍎 마운트 시 로드
  useEffect(() => {
    loadCorporateContracts()
  }, [loadCorporateContracts])

  // 🍎 탭 클릭 시 데이터 새로고침
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      void loadCorporateContracts()
    }
  }, [refreshTrigger, loadCorporateContracts])

  // ==================== 검색 & 정렬 ====================

  // 검색 필터링
  const filteredContracts = useMemo(() => {
    if (!searchTerm) return corporateContracts
    const term = searchTerm.toLowerCase()
    return corporateContracts.filter(c =>
      c.productName.toLowerCase().includes(term) ||
      c.policyNumber.toLowerCase().includes(term) ||
      c.holderName.toLowerCase().includes(term) ||
      c.insuredName.toLowerCase().includes(term) ||
      c.memberName.toLowerCase().includes(term)
    )
  }, [corporateContracts, searchTerm])

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
      return <span className="cc-sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
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
    const badgeClass = RELATION_BADGE_CLASS[relationship] || 'cc-relation-badge--default'
    return <span className={`cc-relation-badge ${badgeClass}`}>{relationship}</span>
  }

  // ==================== 렌더링 ====================

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="corporate-contracts">
        <div className="corporate-contracts__state">
          <SFSymbol
            name="arrow.trianglehead.2.clockwise"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
            animation={SFSymbolAnimation.ROTATE}
          />
          <span className="corporate-contracts__loading-text">
            법인 관계 구성원의 계약을 조회하는 중...
          </span>
        </div>
      </div>
    )
  }

  // 에러 상태
  if (error) {
    return (
      <div className="corporate-contracts">
        <div className="corporate-contracts__state corporate-contracts__state--error">
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

  // 빈 상태: 법인 계약 없음
  if (corporateContracts.length === 0) {
    return (
      <div className="corporate-contracts">
        <div className="corporate-contracts__state">
          <SFSymbol
            name="doc.text.magnifyingglass"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>법인(제3자) 계약이 없습니다.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="corporate-contracts">
      {/* 🍎 요약 헤더 */}
      <div className="corporate-contracts__summary">
        <span>
          법인 <strong>{memberCount}</strong>곳 · 계약 <strong>{filteredContracts.length}</strong>건
        </span>
      </div>

      {/* 🍎 테이블 */}
      <div
        className={`corporate-contracts__table-section${isCcResizing ? ' is-resizing' : ''}`}
        style={{
          '--cc-relation-width': `${ccColumnWidths['relation'] || ccDefaultWidths.relation}px`,
          '--cc-policy-width': `${ccColumnWidths['policy'] || ccDefaultWidths.policy}px`,
          '--cc-product-width': `${ccColumnWidths['product'] || ccDefaultWidths.product}px`,
          '--cc-holder-width': `${ccColumnWidths['holder'] || ccDefaultWidths.holder}px`,
          '--cc-insured-width': `${ccColumnWidths['insured'] || ccDefaultWidths.insured}px`,
          '--cc-date-width': `${ccColumnWidths['date'] || ccDefaultWidths.date}px`,
          '--cc-status-width': `${ccColumnWidths['status'] || ccDefaultWidths.status}px`,
          '--cc-amount-width': `${ccColumnWidths['amount'] || ccDefaultWidths.amount}px`,
          '--cc-premium-width': `${ccColumnWidths['premium'] || ccDefaultWidths.premium}px`,
        } as React.CSSProperties}
      >
        {/* 헤더 */}
        <div className="corporate-contracts-header">
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('memberRelationship')}
            role="button"
            tabIndex={0}
          >
            <span>관계</span>
            {renderSortIndicator('memberRelationship')}
            <div {...getCcResizeHandleProps('relation')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('policyNumber')}
            role="button"
            tabIndex={0}
          >
            <span>증권번호</span>
            {renderSortIndicator('policyNumber')}
            <div {...getCcResizeHandleProps('policy')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('productName')}
            role="button"
            tabIndex={0}
          >
            <span>보험상품</span>
            {renderSortIndicator('productName')}
            <div {...getCcResizeHandleProps('product')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('holderName')}
            role="button"
            tabIndex={0}
          >
            <span>계약자</span>
            {renderSortIndicator('holderName')}
            <div {...getCcResizeHandleProps('holder')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('insuredName')}
            role="button"
            tabIndex={0}
          >
            <span>피보험자</span>
            {renderSortIndicator('insuredName')}
            <div {...getCcResizeHandleProps('insured')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('contractDate')}
            role="button"
            tabIndex={0}
          >
            <span>계약일</span>
            {renderSortIndicator('contractDate')}
            <div {...getCcResizeHandleProps('date')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('status')}
            role="button"
            tabIndex={0}
          >
            <span>상태</span>
            {renderSortIndicator('status')}
            <div {...getCcResizeHandleProps('status')} />
          </div>
          <div
            className="resizable-header header-sortable"
            onClick={() => handleSort('coverageAmount')}
            role="button"
            tabIndex={0}
          >
            <span>가입금액</span>
            {renderSortIndicator('coverageAmount')}
            <div {...getCcResizeHandleProps('amount')} />
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
        <div className="corporate-contracts-list">
          {sortedContracts.map((contract) => (
            <div key={contract.policyNumber} className="corporate-contracts-row">
              <span className="cc-relation">
                {renderRelationBadge(contract.memberRelationship)}
              </span>
              <span className="cc-policy">{contract.policyNumber}</span>
              <span className="cc-product" title={contract.productName}>{contract.productName}</span>
              <span className={`cc-holder${corporateMemberNames.has(contract.holderName) ? ' cc-holder--corp' : ''}`}>
                {contract.holderName}
              </span>
              <span className={`cc-insured${corporateMemberNames.has(contract.insuredName) ? ' cc-insured--corp' : ''}`}>
                {contract.insuredName}
              </span>
              <span className="cc-date">{formatDate(contract.contractDate)}</span>
              <span className={`cc-status cc-status--${contract.status}`}>{contract.status}</span>
              <span className="cc-amount">{formatAmount(contract.coverageAmount)}</span>
              <span className="cc-premium">{formatPremium(contract.premium)}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
