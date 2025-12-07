/**
 * QuickActionsView Component
 * @since 1.0.0
 *
 * 빠른 작업 대시보드
 * 고객 관리, 계약 관리, 문서 관리로 빠르게 이동할 수 있는 허브 페이지
 */

import React, { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import { StatCard } from '@/shared/ui/StatCard'
import { getCustomers } from '@/services/customerService'
import { getDocumentStatistics } from '@/services/DocumentService'
import { ContractService } from '@/services/contractService'
import './QuickActionsView.css'

interface QuickActionsViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 메뉴 네비게이션 핸들러 */
  onNavigate?: (menuKey: string) => void
}

/**
 * QuickActionsView React 컴포넌트
 *
 * 빠른 작업 대시보드 - 주요 기능으로 빠르게 이동
 */
export const QuickActionsView: React.FC<QuickActionsViewProps> = ({
  visible,
  onClose,
  onNavigate,
}) => {
  const queryClient = useQueryClient()

  // 데이터 변경 이벤트 리스너 (고객, 계약, 문서 변경 시 쿼리 캐시 무효화)
  useEffect(() => {
    const handleCustomerChange = () => {
      if (import.meta.env.DEV) {
        console.log('[QuickActionsView] customerChanged 이벤트 수신 - 고객 데이터 새로고침')
      }
      queryClient.invalidateQueries({ queryKey: ['allCustomers'] })
    }

    const handleContractChange = () => {
      if (import.meta.env.DEV) {
        console.log('[QuickActionsView] contractChanged 이벤트 수신 - 계약 데이터 새로고침')
      }
      queryClient.invalidateQueries({ queryKey: ['contracts-list'] })
    }

    const handleDocumentChange = () => {
      if (import.meta.env.DEV) {
        console.log('[QuickActionsView] documentChanged 이벤트 수신 - 문서 데이터 새로고침')
      }
      queryClient.invalidateQueries({ queryKey: ['documentStatistics'] })
    }

    window.addEventListener('customerChanged', handleCustomerChange)
    window.addEventListener('contractChanged', handleContractChange)
    window.addEventListener('documentChanged', handleDocumentChange)

    return () => {
      window.removeEventListener('customerChanged', handleCustomerChange)
      window.removeEventListener('contractChanged', handleContractChange)
      window.removeEventListener('documentChanged', handleDocumentChange)
    }
  }, [queryClient])

  // 고객 통계 조회
  const {
    data: customersData,
    isLoading: isCustomersLoading,
  } = useQuery({
    queryKey: ['allCustomers'],
    queryFn: () => getCustomers({ limit: 1000 }),
  })

  // 문서 통계 조회
  const {
    data: documentStats,
    isLoading: isDocumentsLoading,
  } = useQuery({
    queryKey: ['documentStatistics'],
    queryFn: getDocumentStatistics,
  })

  // 계약 통계 조회
  const {
    data: contractsData,
    isLoading: isContractsLoading,
  } = useQuery({
    queryKey: ['contracts-list', { limit: 1 }],
    queryFn: () => ContractService.getContracts({ limit: 1 }),
  })

  // 통계 계산
  const stats = useMemo(() => ({
    totalCustomers: customersData?.customers?.length ?? 0,
    totalDocuments: documentStats?.total ?? 0,
    totalContracts: contractsData?.total ?? 0,
  }), [customersData, documentStats, contractsData])

  return (
    <CenterPaneView
      visible={visible}
      title="빠른 작업"
      titleIcon={
        <span className="menu-icon-orange">
          <SFSymbol
            name="bolt-fill"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="quick-actions-view"
    >
      <div className="quick-actions-view__content">
        {/* 빠른 액션 섹션 */}
        <section className="quick-actions-view__section">
          <h2 className="quick-actions-view__section-title">
            <SFSymbol
              name="bolt-fill"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              style={{ color: 'var(--color-ios-orange)' }}
            />
            빠른 액션
          </h2>
          <div className="quick-actions-view__action-cards">
            <button
              type="button"
              className="quick-actions-view__action-card"
              onClick={() => onNavigate?.('customers-register')}
            >
              <span className="menu-icon-green">
                <SFSymbol
                  name="person-fill-badge-plus"
                  size={SFSymbolSize.CALLOUT}
                  weight={SFSymbolWeight.MEDIUM}
                />
              </span>
              <span className="action-card-title">새 고객 등록</span>
              <span className="action-card-description">한명의 신규 고객을 등록합니다</span>
            </button>

            <button
              type="button"
              className="quick-actions-view__action-card"
              onClick={() => onNavigate?.('documents-register')}
            >
              <span className="menu-icon-orange">
                <SFSymbol
                  name="doc-badge-plus"
                  size={SFSymbolSize.CALLOUT}
                  weight={SFSymbolWeight.MEDIUM}
                />
              </span>
              <span className="action-card-title">새 문서 등록</span>
              <span className="action-card-description">한명의 고객에 대한 문서들을 등록합니다</span>
            </button>

            <button
              type="button"
              className="quick-actions-view__action-card"
              onClick={() => onNavigate?.('contracts-import')}
            >
              <span className="menu-icon-blue">
                <SFSymbol
                  name="arrow-right-square"
                  size={SFSymbolSize.CALLOUT}
                  weight={SFSymbolWeight.MEDIUM}
                />
              </span>
              <span className="action-card-title">고객·계약 일괄등록</span>
              <span className="action-card-description">엑셀 파일에서 고객과 계약을 일괄 등록합니다</span>
            </button>
          </div>
        </section>

        {/* 통계 섹션 */}
        <section className="quick-actions-view__section">
          <h2 className="quick-actions-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <rect x="2" y="12" width="4" height="6" rx="1" fill="var(--color-primary-500)"/>
              <rect x="8" y="7" width="4" height="11" rx="1" fill="var(--color-primary-500)"/>
              <rect x="14" y="3" width="4" height="15" rx="1" fill="var(--color-primary-500)"/>
            </svg>
            현황 요약
          </h2>
          <div className="quick-actions-view__stats-grid">
            <StatCard
              title="전체 고객"
              value={stats.totalCustomers}
              icon={<SFSymbol name="person.3.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
              color="primary"
              isLoading={isCustomersLoading}
            />
            <StatCard
              title="전체 계약"
              value={stats.totalContracts}
              icon={<SFSymbol name="briefcase-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isContractsLoading}
            />
            <StatCard
              title="전체 문서"
              value={stats.totalDocuments}
              icon={<SFSymbol name="doc" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
              color="warning"
              isLoading={isDocumentsLoading}
            />
          </div>
        </section>

        {/* 관리 메뉴 섹션 */}
        <section className="quick-actions-view__section">
          <h2 className="quick-actions-view__section-title">
            <span className="menu-icon-purple">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/>
                <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor"/>
                <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor"/>
                <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor"/>
              </svg>
            </span>
            관리 메뉴
          </h2>
          <div className="quick-actions-view__menu-cards">
            {/* 고객 관리 */}
            <button
              type="button"
              className="quick-actions-view__menu-card"
              onClick={() => onNavigate?.('customers')}
            >
              <div className="menu-card-header">
                <span className="menu-icon-cyan">
                  <SFSymbol
                    name="person"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
                <span className="menu-card-title">고객 관리</span>
              </div>
              <p className="menu-card-description">
                고객 정보를 조회하고 관리합니다. 지역별, 관계별 분류 기능을 제공합니다.
              </p>
              <div className="menu-card-actions">
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('customers-all') }}
                >
                  전체 보기
                </button>
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('customers-regional') }}
                >
                  지역별
                </button>
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('customers-relationship') }}
                >
                  관계별
                </button>
              </div>
            </button>

            {/* 계약 관리 */}
            <button
              type="button"
              className="quick-actions-view__menu-card"
              onClick={() => onNavigate?.('contracts')}
            >
              <div className="menu-card-header">
                <span className="menu-icon-blue">
                  <SFSymbol
                    name="briefcase-fill"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
                <span className="menu-card-title">계약 관리</span>
              </div>
              <p className="menu-card-description">
                보험 계약을 조회하고 관리합니다. 엑셀 파일에서 계약 정보를 가져올 수 있습니다.
              </p>
              <div className="menu-card-actions">
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('contracts-all') }}
                >
                  전체 보기
                </button>
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('contracts-import') }}
                >
                  가져오기
                </button>
              </div>
            </button>

            {/* 문서 관리 */}
            <button
              type="button"
              className="quick-actions-view__menu-card"
              onClick={() => onNavigate?.('documents')}
            >
              <div className="menu-card-header">
                <span className="menu-icon-orange">
                  <SFSymbol
                    name="doc"
                    size={SFSymbolSize.CALLOUT}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </span>
                <span className="menu-card-title">문서 관리</span>
              </div>
              <p className="menu-card-description">
                문서를 조회하고 검색합니다. OCR 처리와 태그 분류 기능을 제공합니다.
              </p>
              <div className="menu-card-actions">
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('documents-library') }}
                >
                  전체 보기
                </button>
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('documents-search') }}
                >
                  검색
                </button>
                <button
                  type="button"
                  className="menu-card-action"
                  onClick={(e) => { e.stopPropagation(); onNavigate?.('documents-register') }}
                >
                  등록
                </button>
              </div>
            </button>
          </div>
        </section>
      </div>
    </CenterPaneView>
  )
}

export default QuickActionsView
