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
import { DocumentContentSearchModal } from '@/features/customer/components/DocumentContentSearchModal'
import { SummaryIcon, DocumentIcon } from '@/components/DocumentViews/components/DocumentActionIcons'
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
  /** 문서 클릭 시 RightPane 프리뷰 (App에서 handleDocumentClick 전달) */
  onDocumentClick?: (documentId: string) => void
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
  onDocumentClick,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('my')
  // 펼침 상태: "cat:insurance" 또는 "st:insurance/annual_report" 형식
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set())
  // 파일명 모드: localStorage로 전역 동기화 (전체문서보기와 동일 키)
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })
  // 파일명 검색
  const [searchTerm, setSearchTerm] = useState('')

  // 모달 상태
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [activeModal, setActiveModal] = useState<'summary' | 'fulltext' | null>(null)
  const [isContentSearchOpen, setIsContentSearchOpen] = useState(false)

  // 관계자 문서 탭 상태
  const [relatedGroups, setRelatedGroups] = useState<RelatedPersonGroup[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedError, setRelatedError] = useState<string | null>(null)

  const {
    documents,
    isLoading,
    error,
  } = useCustomerDocumentsController(visible ? customerId : null)

  // 검색어로 문서 필터링
  const filteredDocuments = useMemo(() => {
    if (!searchTerm.trim()) return documents
    const term = searchTerm.trim().toLowerCase()
    return documents.filter(doc =>
      doc.originalName?.toLowerCase().includes(term) ||
      doc.displayName?.toLowerCase().includes(term)
    )
  }, [documents, searchTerm])

  // 2단 트리 구성: 대분류 -> 소분류 -> 문서
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    return buildCategoryGroups(filteredDocuments)
  }, [filteredDocuments])

  // 초기 진입 시 대분류 모두 펼치기 / 검색 시 매칭 노드 자동 펼침
  useEffect(() => {
    if (categoryGroups.length > 0) {
      if (searchTerm.trim()) {
        // 검색 중: 대분류 + 소분류 모두 펼침
        const allKeys = new Set<string>()
        for (const g of categoryGroups) {
          allKeys.add(`cat:${g.value}`)
          for (const st of g.subTypes) {
            allKeys.add(`st:${g.value}/${st.typeValue}`)
          }
        }
        setExpandedNodes(allKeys)
      } else {
        setExpandedNodes(prev => {
          // 이미 노드가 있으면 사용자가 조작한 상태이므로 유지
          if (prev.size > 0) return prev
          return new Set(categoryGroups.map(g => `cat:${g.value}`))
        })
      }
    }
  }, [categoryGroups, searchTerm])

  // 관계자 문서 검색 필터링
  const filteredRelatedGroups = useMemo<RelatedPersonGroup[]>(() => {
    if (!searchTerm.trim()) return relatedGroups
    const term = searchTerm.trim().toLowerCase()
    return relatedGroups.map(person => {
      const filtered = person.documents.filter(doc =>
        doc.originalName?.toLowerCase().includes(term) ||
        doc.displayName?.toLowerCase().includes(term)
      )
      if (filtered.length === 0) return null
      return {
        ...person,
        documents: filtered,
        categoryGroups: buildCategoryGroups(filtered),
        totalCount: filtered.length,
      }
    }).filter(Boolean) as RelatedPersonGroup[]
  }, [relatedGroups, searchTerm])

  // 관계자 탭 검색 시 자동 확장
  useEffect(() => {
    if (activeTab !== 'related' || !searchTerm.trim()) return
    if (filteredRelatedGroups.length === 0) return

    const allKeys = new Set<string>()
    for (const person of filteredRelatedGroups) {
      allKeys.add(`person:${person.customerId}`)
      const prefix = `p${person.customerId}:`
      for (const g of person.categoryGroups) {
        allKeys.add(`${prefix}cat:${g.value}`)
        for (const st of g.subTypes) {
          allKeys.add(`${prefix}st:${g.value}/${st.typeValue}`)
        }
      }
    }
    setExpandedNodes(allKeys)
  }, [filteredRelatedGroups, searchTerm, activeTab])

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
            // 관계자의 문서 조회 (includeRelated: 법인에서 업로드한 AR/CRS도 포함)
            const result = await DocumentService.getCustomerDocuments(relatedId, { includeRelated: true })
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
          // 관계자 탭 진입 시 관계자 + 대분류까지 자동 펼치기
          if (groups.length > 0) {
            setExpandedNodes(prev => {
              const personKeys = groups.map(g => `person:${g.customerId}`)
              const hasPersonKeys = personKeys.some(k => prev.has(k))
              if (hasPersonKeys) return prev
              const next = new Set(prev)
              for (const g of groups) {
                next.add(`person:${g.customerId}`)
                for (const cat of g.categoryGroups) {
                  next.add(`p${g.customerId}:cat:${cat.value}`)
                }
              }
              return next
            })
          }
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
    if (onDocumentClick && doc._id) {
      onDocumentClick(doc._id)
    }
  }, [onDocumentClick])

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
              <span className="cde-category__chevron">
                <SFSymbol
                  name={isCatExpanded ? 'chevron.down' : 'chevron.right'}
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.SEMIBOLD}
                  color={group.color}
                  decorative={true}
                />
              </span>
              <span className="cde-category__icon">
                <SFSymbol
                  name={group.icon}
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  color={group.color}
                  decorative={true}
                />
              </span>
              <span className="cde-category__label">{group.label}</span>
              <span className="cde-category__count">{group.totalCount}</span>
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
                        <span className="cde-subtype__chevron">
                          <SFSymbol
                            name={isStExpanded ? 'chevron.down' : 'chevron.right'}
                            size={SFSymbolSize.CAPTION_2}
                            weight={SFSymbolWeight.MEDIUM}
                            color={group.color}
                            decorative={true}
                          />
                        </span>
                        <span className="cde-subtype__icon">
                          <SFSymbol
                            name="folder"
                            size={SFSymbolSize.CAPTION_2}
                            weight={SFSymbolWeight.MEDIUM}
                            color={group.color}
                            decorative={true}
                          />
                        </span>
                        <span className="cde-subtype__label">{subType.label}</span>
                        <span className="cde-subtype__count">{subType.documents.length}</span>
                      </button>

                      {/* 문서 목록 */}
                      {isStExpanded && (
                        <div className="cde-subtype__docs">
                          {subType.documents.map(doc => {
                            const fileIcon = DocumentUtils.getFileIcon(doc.mimeType, doc.originalName)
                            const fileClass = DocumentUtils.getFileTypeClass(doc.mimeType, doc.originalName)
                            const fileExt = doc.mimeType ? DocumentUtils.getFileExtension(doc.mimeType) : '-'
                            const fileSize = doc.fileSize ? DocumentUtils.formatFileSize(doc.fileSize) : '-'
                            const hasDisplay = Boolean(doc.displayName)
                            const showName = filenameMode === 'display' && hasDisplay
                              ? doc.displayName!
                              : doc.originalName
                            const altName = filenameMode === 'display' && hasDisplay
                              ? `원본: ${doc.originalName}`
                              : (hasDisplay ? `별칭: ${doc.displayName}` : '')
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
                                <span className="cde-doc-row__name-cell">
                                  {altName ? (
                                    <Tooltip content={altName}>
                                      <span className="cde-doc-row__name">{showName}</span>
                                    </Tooltip>
                                  ) : (
                                    <span className="cde-doc-row__name" title={doc.originalName}>{showName}</span>
                                  )}
                                  {doc.relatedCustomerId && !prefix && (
                                    <Tooltip content={`${relatedGroups.find(g => g.customerId === doc.relatedCustomerId)?.name || '관계자'}에게 링크됨`}>
                                      <span className="cde-doc-row__origin-badge">
                                        <SFSymbol name="link" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                                      </span>
                                    </Tooltip>
                                  )}
                                  {doc.relatedCustomerId && prefix && (
                                    <Tooltip content={`원본: ${customerName} ${group.label} > ${subType.label}`}>
                                      <span className="cde-doc-row__linked-badge">
                                        <SFSymbol name="arrow.up.right.square" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                                      </span>
                                    </Tooltip>
                                  )}
                                </span>
                                <span className="cde-doc-row__type">{fileExt}</span>
                                <span className="cde-doc-row__size">{fileSize}</span>
                                <span className="cde-doc-row__date">
                                  {doc.linkedAt ? formatDateTimeCompact(doc.linkedAt) : '-'}
                                </span>
                                <span className="cde-doc-row__actions">
                                  <Tooltip content="요약 보기">
                                    <button
                                      type="button"
                                      className="cde-doc-row__action-btn"
                                      onClick={(e) => handleSummaryClick(doc, e)}
                                      aria-label="요약 보기"
                                    >
                                      <SummaryIcon />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="전체 텍스트 보기">
                                    <button
                                      type="button"
                                      className="cde-doc-row__action-btn"
                                      onClick={(e) => handleFullTextClick(doc, e)}
                                      aria-label="전체 텍스트 보기"
                                    >
                                      <DocumentIcon />
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
    const filteredTotalDocs = filteredRelatedGroups.reduce((sum, g) => sum + g.totalCount, 0)

    return (
      <div className="cde-tree">
        <div className="cde-summary">
          <span>
            {searchTerm.trim()
              ? <>검색 결과 <strong>{filteredTotalDocs}</strong>건 / 전체 {totalDocs}건</>
              : <>{relatedGroups.length}명 · 총 <strong>{totalDocs}</strong>건</>
            }
          </span>
          <div className="cde-summary__actions">
            <div className="cde-search__input-wrap">
              <SFSymbol name="magnifyingglass" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} color="var(--color-primary-500)" className="cde-search__icon" decorative={true} />
              <input
                type="text"
                className="cde-search__input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="파일명 검색"
              />
              {searchTerm && (
                <button type="button" className="cde-search__clear" onClick={() => setSearchTerm('')} aria-label="지우기">
                  <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                </button>
              )}
            </div>
            {customerId && (
              <button
                type="button"
                className="cde-expand-all-btn"
                onClick={() => setIsContentSearchOpen(true)}
                aria-label="내용 검색"
              >
                <SFSymbol
                  name="doc.text"
                  size={SFSymbolSize.CAPTION_2}
                  weight={SFSymbolWeight.MEDIUM}
                  color="var(--color-success-600)"
                  decorative={true}
                />
                <span>내용 검색</span>
              </button>
            )}
            <button
              type="button"
              className="cde-expand-all-btn"
              onClick={toggleAll}
              aria-label={allExpanded ? '모두 접기' : '모두 펼치기'}
            >
              <SFSymbol
                name={allExpanded ? 'chevron.up' : 'chevron.down'}
                size={SFSymbolSize.CAPTION_2}
                weight={SFSymbolWeight.MEDIUM}
                color="var(--color-text-secondary)"
                decorative={true}
              />
              <span>{allExpanded ? '모두 접기' : '모두 펼치기'}</span>
            </button>
          </div>
        </div>

        {/* 검색 결과 없음 */}
        {filteredRelatedGroups.length === 0 && searchTerm.trim() && (
          <div className="cde-state">
            <SFSymbol name="magnifyingglass" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
            <span>"{searchTerm.trim()}" 검색 결과가 없습니다</span>
          </div>
        )}

        {filteredRelatedGroups.map(person => {
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
                <span className="cde-person__chevron">
                  <SFSymbol
                    name={isPersonExpanded ? 'chevron.down' : 'chevron.right'}
                    size={SFSymbolSize.CAPTION_2}
                    weight={SFSymbolWeight.SEMIBOLD}
                    decorative={true}
                  />
                </span>
                <span className="cde-person__icon">{person.icon}</span>
                <span className="cde-person__name">{person.name}</span>
                <span className="cde-person__relation">{person.relationshipLabel}</span>
                <span className="cde-person__count">{person.totalCount}</span>
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
      title={`${customerName || '고객'} 문서 분류함`}
      titleIcon={
        <SFSymbol
          name="doc"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          decorative={true}
        />
      }
      titleAccessory={
        <button
          type="button"
          className="cde-back-btn"
          onClick={onCollapse}
          aria-label="돌아가기"
        >
          <SFSymbol
            name="chevron.left"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            color="var(--color-primary-500)"
            decorative={true}
          />
          <span>돌아가기</span>
        </button>
      }
      onClose={onClose}
      className="customer-document-explorer"
    >
      {/* 탭 헤더 */}
      <div className="cde-tabs">
        <div className="cde-tabs__segment">
          <button
            type="button"
            className={`cde-tabs__tab ${activeTab === 'my' ? 'cde-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('my')}
          >
            <SFSymbol name="doc" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} color="var(--color-primary-500)" decorative={true} />
            내 문서
          </button>
          <button
            type="button"
            className={`cde-tabs__tab ${activeTab === 'related' ? 'cde-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('related')}
          >
            <SFSymbol name="person.2" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
            {relatedTabLabel}
          </button>
        </div>
        <Tooltip content={filenameMode === 'display' ? '원본 파일명 보기' : '별칭 보기'}>
          <button
            type="button"
            className="cde-filename-toggle"
            onClick={() => setFilenameMode(prev => {
              const next = prev === 'display' ? 'original' : 'display'
              localStorage.setItem('aims-filename-mode', next)
              return next
            })}
            aria-label={filenameMode === 'display' ? '원본 파일명 보기' : '별칭 보기'}
          >
            {filenameMode === 'display' ? '별칭' : '원본'}
          </button>
        </Tooltip>
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

          {!isLoading && !error && documents.length === 0 && (
            <div className="cde-state">
              <SFSymbol name="doc" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
              <span>문서가 없습니다</span>
            </div>
          )}

          {!isLoading && !error && documents.length > 0 && (
            <div className="cde-tree">
              {/* 요약 + 검색 도구 바 */}
              <div className="cde-summary">
                <span>
                  {searchTerm.trim()
                    ? <>검색 결과 <strong>{filteredDocuments.length}</strong>건 / 전체 {documents.length}건</>
                    : <>총 <strong>{documents.length}</strong>건 · {categoryGroups.length}개 분류</>
                  }
                </span>
                <div className="cde-summary__actions">
                  <div className="cde-search__input-wrap">
                    <SFSymbol name="magnifyingglass" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} color="var(--color-primary-500)" className="cde-search__icon" decorative={true} />
                    <input
                      type="text"
                      className="cde-search__input"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="파일명 검색"
                    />
                    {searchTerm && (
                      <button type="button" className="cde-search__clear" onClick={() => setSearchTerm('')} aria-label="지우기">
                        <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                      </button>
                    )}
                  </div>
                  {customerId && (
                    <button
                      type="button"
                      className="cde-expand-all-btn"
                      onClick={() => setIsContentSearchOpen(true)}
                      aria-label="내용 검색"
                    >
                      <SFSymbol
                        name="doc.text"
                        size={SFSymbolSize.CAPTION_2}
                        weight={SFSymbolWeight.MEDIUM}
                        color="var(--color-success-600)"
                        decorative={true}
                      />
                      <span>내용 검색</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="cde-expand-all-btn"
                    onClick={toggleAll}
                    aria-label={allExpanded ? '모두 접기' : '모두 펼치기'}
                  >
                    <SFSymbol
                      name={allExpanded ? 'chevron.up' : 'chevron.down'}
                      size={SFSymbolSize.CAPTION_2}
                      weight={SFSymbolWeight.MEDIUM}
                      color="var(--color-text-secondary)"
                      decorative={true}
                    />
                    <span>{allExpanded ? '모두 접기' : '모두 펼치기'}</span>
                  </button>
                </div>
              </div>

              {/* 검색 결과 없음 */}
              {categoryGroups.length === 0 && searchTerm.trim() && (
                <div className="cde-state">
                  <SFSymbol name="magnifyingglass" size={SFSymbolSize.BODY} weight={SFSymbolWeight.MEDIUM} decorative={true} />
                  <span>"{searchTerm.trim()}" 검색 결과가 없습니다</span>
                </div>
              )}

              {/* 트리 */}
              {renderCategoryTree(categoryGroups)}
            </div>
          )}
        </>
      )}

      {/* 관계자/가족 문서 탭 */}
      {activeTab === 'related' && renderRelatedTab()}

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
      {customerId && (
        <DocumentContentSearchModal
          isOpen={isContentSearchOpen}
          onClose={() => setIsContentSearchOpen(false)}
          customerId={customerId}
          customerName={customerName || '고객'}
          customerType={customerType}
        />
      )}
    </CenterPaneView>
  )
}

export default CustomerDocumentExplorerView
