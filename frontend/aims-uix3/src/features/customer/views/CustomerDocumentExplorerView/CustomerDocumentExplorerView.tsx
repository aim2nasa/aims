/**
 * CustomerDocumentExplorerView - CenterPane 고객별 문서 탐색기
 * 2단 트리: 대분류(9) -> 소분류(45) -> 문서
 * 탭: [내 문서] / [관계자 문서](법인) 또는 [가족 문서](개인)
 * @see docs/DOCUMENT_TAXONOMY.md - 관계인 문서 뷰 (UI 탭) 섹션
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { CenterPaneView } from '@/components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import { Tooltip } from '@/shared/ui'
import { useCustomerDocumentsController } from '@/features/customer/controllers/useCustomerDocumentsController'
import { RelationshipService, type Relationship } from '@/services/relationshipService'
import { DocumentService, type CustomerDocumentItem } from '@/services/DocumentService'
import {
  DOCUMENT_CATEGORIES,
  getCategoryForType,
  getDocumentTypeLabel,
} from '@/shared/constants/documentCategories'
import { formatDateTimeCompact } from '@/shared/lib/timeUtils'
import { DocumentUtils } from '@/entities/document/model'
import { DocumentSummaryModal } from '@/components/DocumentViews/DocumentStatusView/components/DocumentSummaryModal'
import { DocumentFullTextModal } from '@/components/DocumentViews/DocumentStatusView/components/DocumentFullTextModal'
import { CustomerDocumentPreviewModal } from '@/features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal'
import DownloadHelper from '../../../../utils/downloadHelper'
import type { Document } from '@/types/documentStatus'
import type { Customer } from '@/entities/customer/model'
import './CustomerDocumentExplorerView.css'

interface CustomerDocumentExplorerViewProps {
  visible: boolean
  customerId: string | null
  customerName: string | null
  customerType?: '개인' | '법인'
  onClose: () => void
  onCollapse: () => void
}

/** 소분류 그룹 */
interface SubTypeGroup {
  typeValue: string
  label: string
  documents: CustomerDocumentItem[]
}

/** 대분류 그룹 */
interface CategoryGroup {
  value: string
  label: string
  icon: string
  color: string
  subTypes: SubTypeGroup[]
  totalCount: number
}

/** 관계자/가족 그룹 */
interface RelatedPersonGroup {
  customerId: string
  name: string
  relationshipType: string
  relationshipLabel: string
  icon: string
  documents: CustomerDocumentItem[]
  categoryGroups: CategoryGroup[]
  totalCount: number
}

type TabType = 'my' | 'related'

/** 관계 유형 -> 아이콘 매핑 */
const RELATIONSHIP_ICONS: Record<string, string> = {
  ceo: '\uD83D\uDC54',       // 넥타이
  executive: '\uD83C\uDFAF', // 타겟
  employee: '\uD83D\uDC64',  // 사람
  spouse: '\u2764\uFE0F',    // 하트
  parent: '\uD83D\uDC68\u200D\uD83D\uDC69', // 부모
  child: '\uD83D\uDC76',     // 아기
}

/** 관계 유형 -> 한글 레이블 */
const RELATIONSHIP_LABELS: Record<string, string> = {
  ceo: '대표',
  executive: '임원',
  employee: '직원',
  spouse: '배우자',
  parent: '부모',
  child: '자녀',
  shareholder: '주주',
  director: '이사',
}

/** CustomerDocumentItem → Document 변환 (모달에서 _id로 API 조회하므로 최소 필드만) */
function customerDocToDocument(doc: CustomerDocumentItem): Document {
  return {
    _id: doc._id,
    originalName: doc.originalName,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    status: doc.status as Document['status'],
    fileSize: doc.fileSize,
  }
}

/**
 * 문서에서 실질적 document_type 값을 추출
 * - isAnnualReport/isCustomerReview 플래그도 반영
 */
function getEffectiveType(doc: CustomerDocumentItem): string {
  if (doc.document_type) return doc.document_type
  if (doc.isAnnualReport) return 'annual_report'
  return ''
}

/** 문서 목록을 2단 카테고리 트리로 변환 */
function buildCategoryGroups(documents: CustomerDocumentItem[]): CategoryGroup[] {
  if (!documents || documents.length === 0) return []

  // 1단계: document_type별로 문서 그룹화
  const typeGroups = new Map<string, CustomerDocumentItem[]>()
  for (const doc of documents) {
    const docType = getEffectiveType(doc) || 'unspecified'
    if (!typeGroups.has(docType)) typeGroups.set(docType, [])
    typeGroups.get(docType)!.push(doc)
  }

  // 2단계: 대분류별로 소분류 그룹을 모음
  const categoryMap = new Map<string, SubTypeGroup[]>()
  for (const [docType, docs] of typeGroups) {
    const cat = getCategoryForType(docType)
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push({
      typeValue: docType,
      label: getDocumentTypeLabel(docType),
      documents: docs,
    })
  }

  // 3단계: DOCUMENT_CATEGORIES 순서대로 정렬, 소분류는 건수 내림차순
  return DOCUMENT_CATEGORIES
    .filter(cat => categoryMap.has(cat.value))
    .map(cat => {
      const subTypes = categoryMap.get(cat.value)!
      subTypes.sort((a, b) => b.documents.length - a.documents.length)
      return {
        value: cat.value,
        label: cat.label,
        icon: cat.icon,
        color: cat.color,
        subTypes,
        totalCount: subTypes.reduce((sum, st) => sum + st.documents.length, 0),
      }
    })
}

/** 관계자 정보에서 이름 추출 */
function getRelatedCustomerName(customer: string | Customer): string {
  if (typeof customer === 'string') return customer
  return customer.personal_info?.name || '이름 없음'
}

/** 관계자 정보에서 ID 추출 */
function getRelatedCustomerId(customer: string | Customer): string {
  if (typeof customer === 'string') return customer
  return customer._id
}

export const CustomerDocumentExplorerView: React.FC<CustomerDocumentExplorerViewProps> = ({
  visible,
  customerId,
  customerName,
  customerType = '개인',
  onClose,
  onCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('my')
  // 펼침 상태: "cat:insurance" 또는 "st:insurance/annual_report" 형식
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set())

  // 모달 상태
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [activeModal, setActiveModal] = useState<'summary' | 'fulltext' | null>(null)

  // 관계자 문서 탭 상태
  const [relatedGroups, setRelatedGroups] = useState<RelatedPersonGroup[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedError, setRelatedError] = useState<string | null>(null)

  const {
    documents,
    isLoading,
    error,
    previewState,
    previewTarget,
    openPreview,
    closePreview,
    retryPreview,
  } = useCustomerDocumentsController(visible ? customerId : null)

  // 2단 트리 구성: 대분류 -> 소분류 -> 문서
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    return buildCategoryGroups(documents)
  }, [documents])

  // 관계자/가족 문서 로드
  useEffect(() => {
    if (!visible || !customerId || activeTab !== 'related') return

    let cancelled = false

    const loadRelatedDocuments = async () => {
      setRelatedLoading(true)
      setRelatedError(null)

      try {
        // 1. 관계 목록 조회
        const relationships = await RelationshipService.getCustomerRelationships(customerId)

        if (cancelled) return

        // 2. 각 관계자의 문서 조회 (중복 제거)
        const seenIds = new Set<string>()
        const groups: RelatedPersonGroup[] = []

        for (const rel of relationships) {
          // 관계에서 상대방 고객 정보 추출
          const fromId = getRelatedCustomerId(rel.from_customer)
          const toId = getRelatedCustomerId(rel.related_customer)
          const isFromMe = fromId === customerId
          const relatedCustomer = isFromMe ? rel.related_customer : rel.from_customer
          const relatedId = isFromMe ? toId : fromId

          // 중복 방지
          if (seenIds.has(relatedId)) continue
          seenIds.add(relatedId)

          // 관계 유형 결정
          const relType = rel.relationship_info?.relationship_type || 'employee'
          const relLabel = rel.display_relationship_label || RELATIONSHIP_LABELS[relType] || relType
          const relIcon = RELATIONSHIP_ICONS[relType] || '\uD83D\uDC64'

          try {
            // 관계자의 문서 조회
            const result = await DocumentService.getCustomerDocuments(relatedId)
            if (cancelled) return

            if (result.documents.length > 0) {
              groups.push({
                customerId: relatedId,
                name: getRelatedCustomerName(relatedCustomer),
                relationshipType: relType,
                relationshipLabel: relLabel,
                icon: relIcon,
                documents: result.documents,
                categoryGroups: buildCategoryGroups(result.documents),
                totalCount: result.documents.length,
              })
            }
          } catch {
            // 개별 관계자 문서 조회 실패는 무시하고 계속 진행
          }
        }

        if (!cancelled) {
          setRelatedGroups(groups)
        }
      } catch {
        if (!cancelled) {
          setRelatedError('관계자 문서를 불러올 수 없습니다')
        }
      } finally {
        if (!cancelled) {
          setRelatedLoading(false)
        }
      }
    }

    loadRelatedDocuments()
    return () => { cancelled = true }
  }, [visible, customerId, activeTab])

  const toggleNode = useCallback((nodeKey: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeKey)) {
        next.delete(nodeKey)
      } else {
        next.add(nodeKey)
      }
      return next
    })
  }, [])

  // 전체 펼침: 대분류만 (소분류는 접힌 상태)
  const toggleAll = useCallback(() => {
    if (activeTab === 'my') {
      setExpandedNodes(prev => {
        const catKeys = categoryGroups.map(g => `cat:${g.value}`)
        const allCatsExpanded = catKeys.every(k => prev.has(k))
        if (allCatsExpanded) {
          return new Set()
        }
        return new Set(catKeys)
      })
    } else {
      setExpandedNodes(prev => {
        const personKeys = relatedGroups.map(g => `person:${g.customerId}`)
        const allExpanded = personKeys.every(k => prev.has(k))
        if (allExpanded) {
          return new Set()
        }
        return new Set(personKeys)
      })
    }
  }, [categoryGroups, relatedGroups, activeTab])

  const handleDocClick = useCallback((doc: CustomerDocumentItem) => {
    void openPreview(doc)
  }, [openPreview])

  const handleSummaryClick = useCallback((doc: CustomerDocumentItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocument(customerDocToDocument(doc))
    setActiveModal('summary')
  }, [])

  const handleFullTextClick = useCallback((doc: CustomerDocumentItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocument(customerDocToDocument(doc))
    setActiveModal('fulltext')
  }, [])

  const handleModalClose = useCallback(() => {
    setActiveModal(null)
    setSelectedDocument(null)
  }, [])

  const handleDownload = useCallback(async () => {
    const preview = previewState.data
    if (!preview?.rawDetail) return
    await DownloadHelper.downloadDocument({
      _id: preview.id,
      ...(preview.rawDetail as Record<string, unknown>)
    })
  }, [previewState.data])

  const allExpanded = activeTab === 'my'
    ? categoryGroups.length > 0 && categoryGroups.every(g => expandedNodes.has(`cat:${g.value}`))
    : relatedGroups.length > 0 && relatedGroups.every(g => expandedNodes.has(`person:${g.customerId}`))

  const relatedTabLabel = customerType === '법인' ? '관계자 문서' : '가족 문서'

  if (!visible) return null

  /** 카테고리 트리 렌더링 (내 문서 / 관계자 내부 공통) */
  const renderCategoryTree = (groups: CategoryGroup[], prefix: string = '') => (
    <>
      {groups.map(group => {
        const catKey = `${prefix}cat:${group.value}`
        const isCatExpanded = expandedNodes.has(catKey)

        return (
          <div key={catKey} className="cde-category" style={{ '--cde-cat-color': group.color } as React.CSSProperties}>
            {/* 대분류 헤더 */}
            <button
              type="button"
              className="cde-category__header"
              onClick={() => toggleNode(catKey)}
              aria-expanded={isCatExpanded}
            >
              <SFSymbol
                name={isCatExpanded ? 'chevron.down' : 'chevron.right'}
                size={SFSymbolSize.CAPTION_2}
                weight={SFSymbolWeight.SEMIBOLD}
                color={group.color}
                decorative={true}
              />
              <SFSymbol
                name="folder"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                color={group.color}
                decorative={true}
              />
              <span className="cde-category__label">{group.label}</span>
              <span className="cde-category__count">({group.totalCount}건)</span>
            </button>

            {/* 소분류 목록 */}
            {isCatExpanded && (
              <div className="cde-subtypes">
                {group.subTypes.map(subType => {
                  const stKey = `${prefix}st:${group.value}/${subType.typeValue}`
                  const isStExpanded = expandedNodes.has(stKey)

                  return (
                    <div key={stKey} className="cde-subtype">
                      {/* 소분류 헤더 */}
                      <button
                        type="button"
                        className="cde-subtype__header"
                        onClick={() => toggleNode(stKey)}
                        aria-expanded={isStExpanded}
                      >
                        <SFSymbol
                          name={isStExpanded ? 'chevron.down' : 'chevron.right'}
                          size={SFSymbolSize.CAPTION_2}
                          weight={SFSymbolWeight.MEDIUM}
                          color={group.color}
                          decorative={true}
                        />
                        <SFSymbol
                          name="folder"
                          size={SFSymbolSize.CAPTION_2}
                          weight={SFSymbolWeight.MEDIUM}
                          color={group.color}
                          decorative={true}
                        />
                        <span className="cde-subtype__label">{subType.label}</span>
                        <span className="cde-subtype__count">({subType.documents.length}건)</span>
                      </button>

                      {/* 문서 목록 */}
                      {isStExpanded && (
                        <div className="cde-subtype__docs">
                          {subType.documents.map(doc => {
                            const fileIcon = DocumentUtils.getFileIcon(doc.mimeType, doc.originalName)
                            const fileClass = DocumentUtils.getFileTypeClass(doc.mimeType, doc.originalName)
                            return (
                              <div
                                key={doc._id}
                                className="cde-doc-row"
                                onClick={() => handleDocClick(doc)}
                              >
                                <span className={`cde-doc-row__icon ${fileClass}`}>
                                  <SFSymbol
                                    name={fileIcon}
                                    size={SFSymbolSize.CAPTION_2}
                                    weight={SFSymbolWeight.MEDIUM}
                                    decorative={true}
                                  />
                                </span>
                                <span className="cde-doc-row__name" title={doc.originalName}>
                                  {doc.originalName}
                                </span>
                                <span className="cde-doc-row__date">
                                  {doc.linkedAt ? formatDateTimeCompact(doc.linkedAt) : '-'}
                                </span>
                                <span className="cde-doc-row__actions">
                                  <Tooltip content="요약">
                                    <button
                                      type="button"
                                      className="cde-doc-row__action-btn"
                                      onClick={(e) => handleSummaryClick(doc, e)}
                                      aria-label="요약 보기"
                                    >
                                      <SFSymbol name="text.quote" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="전체 텍스트">
                                    <button
                                      type="button"
                                      className="cde-doc-row__action-btn"
                                      onClick={(e) => handleFullTextClick(doc, e)}
                                      aria-label="전체 텍스트 보기"
                                    >
                                      <SFSymbol name="doc.plaintext" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                                    </button>
                                  </Tooltip>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )

  /** 관계자/가족 문서 탭 콘텐츠 */
  const renderRelatedTab = () => {
    if (relatedLoading) {
      return (
        <div className="cde-state">
          <SFSymbol name="arrow.clockwise" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
          <span>{relatedTabLabel}을 불러오는 중...</span>
        </div>
      )
    }

    if (relatedError) {
      return (
        <div className="cde-state cde-state--error">
          <SFSymbol name="exclamationmark" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
          <span>{relatedError}</span>
        </div>
      )
    }

    if (relatedGroups.length === 0) {
      return (
        <div className="cde-state">
          <SFSymbol name="person.2" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
          <span>{customerType === '법인' ? '관계자가 없거나 관계자 문서가 없습니다' : '가족이 없거나 가족 문서가 없습니다'}</span>
        </div>
      )
    }

    const totalDocs = relatedGroups.reduce((sum, g) => sum + g.totalCount, 0)

    return (
      <div className="cde-tree">
        <div className="cde-summary">
          {relatedGroups.length}명 · 총 <strong>{totalDocs}</strong>건
        </div>

        {relatedGroups.map(person => {
          const personKey = `person:${person.customerId}`
          const isPersonExpanded = expandedNodes.has(personKey)

          return (
            <div key={person.customerId} className="cde-person">
              {/* 관계자 헤더 */}
              <button
                type="button"
                className="cde-person__header"
                onClick={() => toggleNode(personKey)}
                aria-expanded={isPersonExpanded}
              >
                <SFSymbol
                  name={isPersonExpanded ? 'chevron.down' : 'chevron.right'}
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.SEMIBOLD}
                  decorative={true}
                />
                <span className="cde-person__icon">{person.icon}</span>
                <span className="cde-person__name">{person.name}</span>
                <span className="cde-person__relation">({person.relationshipLabel})</span>
                <span className="cde-person__count">{person.totalCount}건</span>
              </button>

              {/* 관계자 내 카테고리 트리 */}
              {isPersonExpanded && (
                <div className="cde-person__content">
                  {renderCategoryTree(person.categoryGroups, `p${person.customerId}:`)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <CenterPaneView
      visible={visible}
      title={`${customerName || '고객'} 문서 탐색기`}
      titleIcon={
        <SFSymbol
          name="folder"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          decorative={true}
        />
      }
      titleAccessory={
        <div className="cde-header-actions">
          <Tooltip content={allExpanded ? '모두 접기' : '모두 펼치기'}>
            <button
              type="button"
              className="cde-header-btn"
              onClick={toggleAll}
              aria-label={allExpanded ? '모두 접기' : '모두 펼치기'}
            >
              <SFSymbol
                name={allExpanded ? 'chevron.up' : 'chevron.down'}
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
            </button>
          </Tooltip>
          <Tooltip content="간략 뷰로 축소">
            <button
              type="button"
              className="cde-header-btn"
              onClick={onCollapse}
              aria-label="간략 뷰로 축소"
            >
              <SFSymbol
                name="xmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                decorative={true}
              />
            </button>
          </Tooltip>
        </div>
      }
      onClose={onClose}
      className="customer-document-explorer"
    >
      {/* 탭 헤더 */}
      <div className="cde-tabs">
        <button
          type="button"
          className={`cde-tabs__tab ${activeTab === 'my' ? 'cde-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('my')}
        >
          내 문서
        </button>
        <button
          type="button"
          className={`cde-tabs__tab ${activeTab === 'related' ? 'cde-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('related')}
        >
          {relatedTabLabel}
        </button>
      </div>

      {/* 내 문서 탭 */}
      {activeTab === 'my' && (
        <>
          {isLoading && (
            <div className="cde-state">
              <SFSymbol name="arrow.clockwise" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
              <span>문서를 불러오는 중...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="cde-state cde-state--error">
              <SFSymbol name="exclamationmark" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
              <span>문서를 불러올 수 없습니다</span>
            </div>
          )}

          {!isLoading && !error && categoryGroups.length === 0 && (
            <div className="cde-state">
              <SFSymbol name="doc" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
              <span>문서가 없습니다</span>
            </div>
          )}

          {!isLoading && !error && categoryGroups.length > 0 && (
            <div className="cde-tree">
              <div className="cde-summary">
                총 <strong>{documents.length}</strong>건 · {categoryGroups.length}개 분류
              </div>
              {renderCategoryTree(categoryGroups)}
            </div>
          )}
        </>
      )}

      {/* 관계자/가족 문서 탭 */}
      {activeTab === 'related' && renderRelatedTab()}

      {/* 문서 프리뷰 모달 */}
      <CustomerDocumentPreviewModal
        visible={previewState.isOpen}
        isLoading={previewState.isLoading}
        error={previewState.error}
        document={previewState.data}
        onClose={closePreview}
        {...(previewTarget ? { onRetry: () => { void retryPreview() } } : {})}
        {...(previewState.data?.rawDetail ? { onDownload: handleDownload } : {})}
      />

      {/* 요약 / 전체 텍스트 모달 */}
      <DocumentSummaryModal
        visible={activeModal === 'summary'}
        onClose={handleModalClose}
        document={selectedDocument}
      />
      <DocumentFullTextModal
        visible={activeModal === 'fulltext'}
        onClose={handleModalClose}
        document={selectedDocument}
      />
    </CenterPaneView>
  )
}

export default CustomerDocumentExplorerView
