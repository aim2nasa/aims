/**
 * DocumentSearchView Component
 * @since 1.0.0
 *
 * 🍎 iOS Spotlight Search 스타일 문서 검색 View
 * DocumentLibrary와 완벽한 디자인 일관성
 * Search.py 기능을 React + iOS 네이티브 스타일로 구현
 */

import React, { useState, useCallback } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { useDocumentSearch } from '@/contexts/useDocumentSearch'
import { SearchService } from '@/services/searchService'
import type { SearchResultItem, SearchMode, KeywordMode } from '@/entities/search'
import { DocumentUtils, DocumentProcessingModule } from '@/entities/document'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Dropdown, Tooltip, type DropdownOption } from '@/shared/ui'
import {
  DocumentIcon,
  EyeIcon,
  LinkIcon,
  SummaryIcon
} from '../components/DocumentActionIcons'
import RefreshButton from '../../RefreshButton/RefreshButton'
import FullTextModal from './FullTextModal'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import { CustomerService } from '@/services/customerService'
import { DocumentService } from '@/services/DocumentService'
import type { CustomerSearchResponse } from '@/entities/customer'
import type { DocumentCustomerRelation, Document } from '../../../types/documentStatus'
import './DocumentSearchView.css'

interface DocumentSearchViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 문서 클릭 핸들러 (RightPane 프리뷰) */
  onDocumentClick?: (documentId: string) => void
}

/**
 * DocumentSearchView React 컴포넌트
 *
 * iOS Spotlight 스타일의 검색 UI를 제공합니다.
 * Progressive Disclosure 원칙에 따라 필요한 옵션만 단계적으로 표시됩니다.
 *
 * @example
 * ```tsx
 * <DocumentSearchView
 *   visible={isVisible}
 *   onClose={handleClose}
 *   onDocumentClick={handleDocumentClick}
 * />
 * ```
 */
// 검색 모드 옵션 정의
const SEARCH_MODE_OPTIONS: DropdownOption[] = [
  { value: 'keyword', label: '키워드 검색' },
  { value: 'semantic', label: 'AI 검색 (실험적)' },
]

// 키워드 모드 옵션 정의
const KEYWORD_MODE_OPTIONS: DropdownOption[] = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
]

export const DocumentSearchView: React.FC<DocumentSearchViewProps> = ({
  visible,
  onClose,
  onDocumentClick
}) => {
  const {
    query,
    searchMode,
    keywordMode,
    results,
    answer,
    isLoading,
    error,
    lastSearchMode,
    handleSearch,
    handleQueryChange,
    handleSearchModeChange,
    handleKeywordModeChange,
  } = useDocumentSearch()

  // Full Text 모달 상태 (기존 - 검색 결과용)
  const [isFullTextModalVisible, setIsFullTextModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<{
    name: string
    fullText: string
  } | null>(null)

  // 🍎 새로운 모달 상태 관리 (DocumentLibrary와 동일한 구조)
  const [selectedDocumentForDetail, setSelectedDocumentForDetail] = useState<SearchResultItem | null>(null)
  const [isDetailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocumentForSummary, setSelectedDocumentForSummary] = useState<SearchResultItem | null>(null)
  const [isSummaryModalVisible, setSummaryModalVisible] = useState(false)
  const [selectedDocumentForFullTextNew, setSelectedDocumentForFullTextNew] = useState<SearchResultItem | null>(null)
  const [isFullTextModalVisibleNew, setFullTextModalVisibleNew] = useState(false)
  const [selectedDocumentForLink, setSelectedDocumentForLink] = useState<SearchResultItem | null>(null)
  const [isLinkModalVisible, setLinkModalVisible] = useState(false)

  /**
   * Enter 키 입력 핸들러
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  /**
   * 문서 클릭 핸들러
   */
  const handleItemClick = (item: SearchResultItem) => {
    const docId = SearchService.getDocumentId(item)
    if (docId && onDocumentClick) {
      onDocumentClick(docId)
    }
  }

  /**
   * Full Text 모달 닫기 핸들러 (기존 - 더 이상 사용하지 않음)
   */
  const handleCloseFullTextModal = () => {
    setIsFullTextModalVisible(false)
    setSelectedDocument(null)
  }

  /**
   * 🍎 새로운 모달 핸들러들 (DocumentLibrary와 동일)
   */
  const handleDetailClick = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForDetail(document)
    setDetailModalVisible(true)
  }, [])

  const handleDetailModalClose = useCallback(() => {
    setDetailModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForDetail(null)
    }, 300)
  }, [])

  const handleSummaryClickInternal = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForSummary(document)
    setSummaryModalVisible(true)
  }, [])

  const handleSummaryModalClose = useCallback(() => {
    setSummaryModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForSummary(null)
    }, 300)
  }, [])

  const handleFullTextClickInternal = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForFullTextNew(document)
    setFullTextModalVisibleNew(true)
  }, [])

  const handleFullTextModalCloseNew = useCallback(() => {
    setFullTextModalVisibleNew(false)
    setTimeout(() => {
      setSelectedDocumentForFullTextNew(null)
    }, 300)
  }, [])

  const handleLinkClickInternal = useCallback((document: SearchResultItem) => {
    setSelectedDocumentForLink(document)
    setLinkModalVisible(true)
  }, [])

  const handleLinkModalClose = useCallback(() => {
    setLinkModalVisible(false)
    setTimeout(() => {
      setSelectedDocumentForLink(null)
    }, 300)
  }, [])

  /**
   * 🍎 고객 검색 핸들러
   */
  const searchCustomers = useCallback(
    async (searchTerm: string, page: number = 1, limit: number = 20): Promise<CustomerSearchResponse> => {
      return CustomerService.searchCustomers(searchTerm, { page, limit })
    },
    []
  )

  /**
   * 🍎 고객별 문서 조회 핸들러
   */
  const fetchCustomerDocuments = useCallback(async (customerId: string) => {
    return DocumentService.getCustomerDocuments(customerId)
  }, [])

  /**
   * 🍎 문서-고객 연결 핸들러
   */
  const linkDocumentToCustomer = useCallback(
    async (params: {
      customerId: string
      documentId: string
      relationshipType: string
      notes?: string
    }): Promise<DocumentCustomerRelation | undefined> => {
      const { customerId, documentId, relationshipType, notes } = params

      await DocumentService.linkDocumentToCustomer(customerId, {
        document_id: documentId,
        relationship_type: relationshipType,
        ...(notes ? { notes } : {}),
      })

      // 검색 결과 새로고침은 필요시 추가
      return undefined
    },
    []
  )

  /**
   * 유사도 점수를 5단계로 분류
   */
  const getSimilarityLevel = (score: number): {
    icon: string
    label: string
    color: string
  } => {
    if (score >= 0.85) {
      return { icon: '🟢', label: '매우 높음', color: 'excellent' }
    } else if (score >= 0.70) {
      return { icon: '🟢', label: '높음', color: 'high' }
    } else if (score >= 0.50) {
      return { icon: '🟡', label: '보통', color: 'medium' }
    } else if (score >= 0.30) {
      return { icon: '🟠', label: '낮음', color: 'low' }
    } else {
      return { icon: '🔴', label: '매우 낮음', color: 'very-low' }
    }
  }

  return (
    <CenterPaneView
      visible={visible}
      title="문서 검색"
      titleIcon={<SFSymbol name="magnifyingglass" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} style={{ color: 'var(--color-icon-doc-search)' }} />}
      onClose={onClose}
      marginTop={6}
      marginBottom={6}
      marginLeft={6}
      marginRight={6}
      className="document-search-view"
    >
      <div className="document-search-container">
        {/* 🍎 iOS Spotlight 검색바 - 한 줄 레이아웃 */}
        <div className="search-bar-wrapper">
          {/* A: 검색 입력 필드 (flex-grow) */}
          <div className="search-input-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="search-input"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="문서 검색"
              aria-label="문서 검색"
            />
          </div>

          {/* B: 검색 모드 드롭다운 */}
          <Dropdown
            value={searchMode}
            options={SEARCH_MODE_OPTIONS}
            onChange={(value) => handleSearchModeChange(value as SearchMode)}
            aria-label="검색 모드 선택"
            width={135}
          />

          {/* 🍎 Progressive Disclosure: 키워드 검색 시 드롭다운으로 AND/OR 선택 */}
          {searchMode === 'keyword' && (
            <Dropdown
              value={keywordMode}
              options={KEYWORD_MODE_OPTIONS}
              onChange={(value) => handleKeywordModeChange(value as KeywordMode)}
              aria-label="키워드 모드 선택"
              width={75}
            />
          )}

          {/* 검색 버튼 */}
          <button
            className="search-button"
            onClick={handleSearch}
            disabled={isLoading}
            aria-label={isLoading ? '검색 중' : '검색 실행'}
          >
            {isLoading ? '검색 중...' : '검색'}
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="search-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {/* 검색 결과 영역 */}
        <div className="search-results-section">
          {isLoading ? (
            <div className="search-loading" role="status" aria-live="polite">
              검색 중입니다. 잠시만 기다려 주세요...
            </div>
          ) : results.length > 0 ? (
            <>
              {/* AI 답변 (시맨틱 검색시) */}
              {answer && (
                <div className="search-answer">
                  <h3 className="answer-title">AI 답변</h3>
                  <p className="answer-content">{answer}</p>
                </div>
              )}

              {/* 검색 결과 헤더 */}
              <div className="search-results-header">
                <div className="results-header-text">
                  {lastSearchMode === 'semantic' ? (
                    <p>주어진 검색어와 유사도가 높은 상위 {results.length}개의 문서를 보여드립니다.</p>
                  ) : (
                    <>
                      <p>총 {results.length}건의 결과가 발견되었습니다.</p>
                      <p className="results-divider">--- 검색 결과 ---</p>
                    </>
                  )}
                </div>
                <RefreshButton
                  onClick={async () => {
                    if (query) {
                      await handleSearch();
                    }
                  }}
                  loading={isLoading}
                  tooltip="검색 새로고침"
                  size="small"
                  disabled={!query}
                />
              </div>

              {/* 🍎 유사도 점수 범례 (시맨틱 검색일 때만 표시) */}
              {searchMode === 'semantic' && results.length > 0 && (
                <div className="similarity-legend">
                  <div className="legend-title">유사도 점수:</div>
                  <div className="legend-items">
                    <div className="legend-item">
                      <span className="legend-icon">🟢</span>
                      <span className="legend-label">매우 높음 (≥0.85)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🟢</span>
                      <span className="legend-label">높음 (≥0.70)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🟡</span>
                      <span className="legend-label">보통 (≥0.50)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🟠</span>
                      <span className="legend-label">낮음 (≥0.30)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon">🔴</span>
                      <span className="legend-label">매우 낮음 (&lt;0.30)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 🍎 iOS Table View 스타일 결과 리스트 */}
              <div className="search-results-table" role="list">
                {results.map((item, index) => {
                  const originalName = SearchService.getOriginalName(item)
                  const summary = SearchService.getSummary(item)
                  const confidence = SearchService.getOCRConfidence(item)
                  const score = 'score' in item ? item.score : null
                  const mimeType = SearchService.getMimeType(item)

                  // 🍎 문서 처리 상태 정보 추출
                  const status = DocumentProcessingModule.getProcessingStatus(item as Document)
                  const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(item as Document)
                  const canLink = linkStatus.canLink
                  const linkTooltip = linkStatus.isLinked ? '이미 고객과 연결됨' : '고객에게 연결'

                  return (
                    <div
                      key={index}
                      className="search-result-row"
                      onClick={() => handleItemClick(item)}
                      role="listitem"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleItemClick(item)
                        }
                      }}
                      aria-label={`문서: ${originalName}`}
                    >
                      {/* Leading: 인덱스 */}
                      <div className="row-leading">
                        <span className="row-index">[{index + 1}]</span>
                      </div>

                      {/* Content: 아이콘 + 제목 + 요약 */}
                      <div className="row-content">
                        <div className="row-title-wrapper">
                          {/* 🍎 파일 타입 아이콘 */}
                          <div className="document-icon-wrapper">
                            <div className={`document-icon ${DocumentUtils.getFileTypeClass(mimeType, originalName)}`}>
                              <SFSymbol
                                name={DocumentUtils.getFileIcon(mimeType, originalName)}
                                size={SFSymbolSize.CAPTION_1}
                                weight={SFSymbolWeight.REGULAR}
                                decorative={true}
                              />
                            </div>
                            {/* 🍎 AR BADGE: Annual Report 표시 */}
                            {('is_annual_report' in item && item.is_annual_report) ? (
                              <Tooltip content="Annual Report">
                                <div className="document-ar-badge">
                                  AR
                                </div>
                              </Tooltip>
                            ) : null}
                          </div>
                          <span className="row-title">{originalName}</span>
                        </div>
                        <div className="row-subtitle">{summary}</div>
                      </div>

                      {/* Trailing: 액션 버튼들 + 점수 + 화살표 */}
                      <div className="row-trailing">
                        {/* 🍎 문서 처리 상태 아이콘 */}
                        <Tooltip content={status.label}>
                          <div className={`status-icon status-${status.status}`}>
                            {status.icon}
                          </div>
                        </Tooltip>

                        {/* 🍎 상세 보기 버튼 */}
                        <Tooltip content="상세 보기">
                          <button
                            className="action-button action-button--detail"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDetailClick(item)
                        }}
                        aria-label="상세 보기"
                      >
                        <EyeIcon />
                      </button>
                    </Tooltip>

                    {/* 🍎 요약 보기 버튼 */}
                    <Tooltip content="요약 보기">
                          <button
                            className="action-button action-button--summary"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSummaryClickInternal(item)
                        }}
                        aria-label="요약 보기"
                      >
                        <SummaryIcon />
                      </button>
                    </Tooltip>

                    {/* 🍎 전체 텍스트 보기 버튼 */}
                    <Tooltip content="전체 텍스트 보기">
                          <button
                            className="action-button action-button--full"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFullTextClickInternal(item)
                        }}
                        aria-label="전체 텍스트 보기"
                      >
                        <DocumentIcon />
                      </button>
                    </Tooltip>

                    {/* 🍎 고객에게 연결 버튼 */}
                    <Tooltip content={linkTooltip}>
                          <button
                            className="action-button action-button--link"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (canLink) {
                                handleLinkClickInternal(item)
                              }
                            }}
                          aria-label={linkTooltip}
                          aria-disabled={!canLink}
                          data-disabled={!canLink}
                          tabIndex={canLink ? 0 : -1}
                      >
                        <LinkIcon />
                      </button>
                    </Tooltip>

                        {/* 유사도 아이콘 (시맨틱 검색 시) */}
                        {score !== null && (
                          <div
                            className={`similarity-indicator similarity-${getSimilarityLevel(score).color}`}
                            title={`유사도: ${score.toFixed(4)} (${getSimilarityLevel(score).label})`}
                            aria-label={`유사도 ${getSimilarityLevel(score).label}`}
                          >
                            {getSimilarityLevel(score).icon}
                          </div>
                        )}
                        {/* OCR 신뢰도 (키워드 검색 시) */}
                        {confidence && !score && (
                          <div className="row-detail">
                            인식률: {confidence}
                          </div>
                        )}
                        <span className="row-chevron" aria-hidden="true">›</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            !isLoading && (
              <div className="search-empty" role="status">
                검색을 실행하면 결과가 표시됩니다.
              </div>
            )
          )}
        </div>
      </div>

      {/* Full Text 모달 (기존 - 더 이상 사용하지 않음) */}
      {selectedDocument && (
        <FullTextModal
          visible={isFullTextModalVisible}
          onClose={handleCloseFullTextModal}
          documentName={selectedDocument.name}
          fullText={selectedDocument.fullText}
        />
      )}

      {/* 🍎 새로운 모달들 (DocumentLibrary와 동일) */}
      <DocumentDetailModal
        visible={isDetailModalVisible}
        onClose={handleDetailModalClose}
        document={selectedDocumentForDetail}
      />
      <DocumentSummaryModal
        visible={isSummaryModalVisible}
        onClose={handleSummaryModalClose}
        document={selectedDocumentForSummary}
      />
      <DocumentFullTextModal
        visible={isFullTextModalVisibleNew}
        onClose={handleFullTextModalCloseNew}
        document={selectedDocumentForFullTextNew}
      />
      <DocumentLinkModal
        visible={isLinkModalVisible}
        onClose={handleLinkModalClose}
        document={selectedDocumentForLink}
        onSearchCustomers={searchCustomers}
        onFetchCustomerDocuments={fetchCustomerDocuments}
        onLink={linkDocumentToCustomer}
      />
    </CenterPaneView>
  )
}

export default DocumentSearchView
