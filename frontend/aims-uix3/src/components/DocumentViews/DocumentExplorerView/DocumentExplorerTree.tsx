/**
 * DocumentExplorerTree
 * @description 문서 탐색기 트리 렌더링 컴포넌트
 *
 * 키보드 네비게이션:
 * - ↑↓: 이전/다음 노드로 이동
 * - Enter: 프리뷰 열기 (싱글클릭)
 * - Space: 모달 프리뷰 (더블클릭)
 * - ←: 폴더 접기 / 부모로 이동
 * - →: 폴더 펼치기 / 자식으로 이동
 * - Home/End: 처음/마지막으로 이동
 */

import React, { useCallback, useRef, useMemo, useEffect, useLayoutEffect, useState, useReducer } from 'react'
// flushSync 제거 — 마우스 이벤트마다 동기 렌더링 강제하면 저사양 PC에서 프리징 발생
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import { DocumentUtils, DocumentProcessingModule } from '@/entities/document'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { SummaryIcon, DocumentIcon } from '../components/DocumentActionIcons'
// InlineRenameInput 제거 — 부모 뷰에서 RenameModal로 대체
import type { Document } from '@/types/documentStatus'
import type { DocumentTreeNode, DocumentGroupBy, DocumentSortBy, SortDirection } from './types/documentExplorer'
import { SORT_BY_LABELS } from './types/documentExplorer'
import { useDocumentExplorerKeyboard } from './hooks/useDocumentExplorerKeyboard'
import { getDocumentDate } from './utils/treeBuilders'
import { HoverPreview } from './components/HoverPreview'
import { useLayoutStore } from '@/shared/store/useLayoutStore'
import { Tooltip } from '@/shared/ui/Tooltip'
import { FilenameModeToggle } from '@/shared/ui/FilenameModeToggle'
import { highlightText } from '@/shared/lib/highlightText'
import { formatDateTime as formatDateTimeKST, formatDate as formatDateKST } from '@/shared/lib/timeUtils'

export interface DocumentExplorerTreeProps {
  nodes: DocumentTreeNode[]
  expandedKeys: Set<string>
  selectedDocumentId: string | null
  groupBy: DocumentGroupBy
  onToggleNode: (key: string) => void
  onDocumentClick: (document: Document) => void
  onDocumentDoubleClick: (document: Document) => void
  onCustomerClick?: (customerName: string) => void
  sortBy?: DocumentSortBy
  sortDirection?: SortDirection
  /** 검색어 (하이라이트용) */
  searchTerm?: string
  /** 썸네일 미리보기 활성화 여부 */
  thumbnailEnabled?: boolean
  /** 파일명 표시 모드 */
  filenameMode?: 'display' | 'original'
  onFilenameModeChange?: (mode: 'display' | 'original') => void
  /** 요약 보기 핸들러 */
  onSummaryClick?: (document: Document) => void
  /** 전체 텍스트 보기 핸들러 */
  onFullTextClick?: (document: Document) => void
  /** 이름변경 클릭 핸들러 */
  onRenameClick?: (document: Document) => void
  /** 삭제 클릭 핸들러 */
  onDeleteClick?: (document: Document) => void
  /** 컨텍스트 메뉴 핸들러 (우클릭) */
  onDocumentContextMenu?: (document: Document, e: React.MouseEvent) => void
  /** 현재 이름변경 중인 문서 ID */
  renamingDocumentId?: string | null
  /** 이름변경 확인 */
  onRenameConfirm?: (documentId: string, newName: string) => void
  /** 이름변경 취소 */
  onRenameCancel?: () => void
  /** 편집 모드 활성 여부 (체크박스 표시) */
  isEditMode?: boolean
  /** 별칭 모드 여부 (이미 별칭이 있는 문서 체크박스 숨김) */
  isAliasMode?: boolean
  /** 선택된 문서 ID 집합 */
  selectedDocumentIds?: Set<string>
  /** 문서 선택/해제 */
  onSelectDocument?: (documentId: string) => void
  /** 고객 노드 컨텍스트 메뉴 (고객 상세 이동) */
  onCustomerContextMenu?: (customerId: string, customerName: string, e: React.MouseEvent, customerType?: '개인' | '법인') => void
  /** 고객 상세 보기 (미니 카드 "상세" 버튼) */
  onCustomerDetailClick?: (customerId: string, customerName: string) => void
  /** 고객 문서 분류함 열기 (미니 카드 "분류함" 버튼) */
  onCustomerExplorerClick?: (customerId: string, customerName: string, customerType?: '개인' | '법인') => void
  /** 전체 정보 보기 (URL 네비게이션) */
  onOpenFullDetail?: (customerId: string) => void
  /** 고객 하위 폴더 모두 펼치기/접기 */
  onToggleExpandCustomer?: (customerNodeKey: string) => void
  /** 문서유형 변경 핸들러 */
  onDocTypeChange?: (documentId: string, newType: string) => void
  /** 문서유형 변경 중인 문서 ID */
  updatingDocTypeId?: string | null
  /** 정렬 기준 변경 (컬럼 헤더 클릭) */
  onSortByChange?: (sortBy: DocumentSortBy) => void
  /** true이면 컬럼 헤더를 내부에서 렌더링하지 않음 (부모가 scroll container 밖에서 렌더링할 때) */
  hideColumnHeader?: boolean
  /** 고객 문서함 다운로드 핸들러 (단일 고객) */
  onDownloadCustomerDocuments?: (customerId: string, customerName: string) => void
  /** 고객 체크박스 선택 상태 */
  selectedCustomerIds?: Set<string>
  /** 고객 체크박스 토글 */
  onToggleCustomerSelect?: (customerId: string) => void
  /** 고객 선택 모드 활성 여부 */
  customerSelectMode?: boolean
  /** 에러 문서 재시도 핸들러 */
  onRetryClick?: (documentId: string) => void
}

// 더블클릭 감지를 위한 타이머
const DOUBLE_CLICK_DELAY = 250

// 날짜/시간 포맷 (MM.DD HH:mm:ss, KST) — timeUtils 기반, 연도 제거
const formatDateTime = (dateStr: string): string => {
  const full = formatDateTimeKST(dateStr)
  // formatDateTimeKST 반환값: "YYYY.MM.DD HH:mm:ss" 또는 에러 문자열
  if (!full || full === '-' || full === '잘못된 시간') return ''
  // "YYYY." (5자) 제거 → "MM.DD HH:mm:ss"
  return full.slice(5)
}

// 오늘 날짜(KST) — "YYYY.MM.DD" 형식. 문서가 오늘 등록되었는지 판별에 사용
const getTodayKST = (): string => formatDateKST(new Date().toISOString())

// 문서가 오늘(KST) 등록된 문서인지 판별
const isDocumentToday = (doc: Document, todayStr: string): boolean => {
  const dateStr = getDocumentDate(doc)
  if (!dateStr) return false
  return formatDateKST(dateStr) === todayStr
}

// filenameMode에 따라 문서 표시명 결정 — 순수 함수이므로 컴포넌트 바깥에 정의
const getDocName = (doc: Document, filenameMode: 'display' | 'original'): { showName: string; altName: string; isAlias: boolean } => {
  const originalName = DocumentStatusService.extractOriginalFilename(doc)
  const hasDisplay = Boolean(doc.displayName)
  const isAlias = filenameMode === 'display' && hasDisplay
  const showName = isAlias
    ? doc.displayName!
    : originalName
  const altName = isAlias
    ? `원본: ${originalName}`
    : (hasDisplay ? `별칭: ${doc.displayName}` : '')
  return { showName, altName, isAlias }
}

// ─────────────────────────────────────────────────────────────
// DocumentNode: 문서 노드 React.memo 컴포넌트
// ─────────────────────────────────────────────────────────────

interface DocumentNodeProps {
  node: DocumentTreeNode
  level: number
  selectedDocumentId: string | null
  focusedKey: string | null
  searchTerm: string
  filenameMode: 'display' | 'original'
  onDocumentClick: (doc: Document, e: React.MouseEvent, nodeKey?: string) => void
  onDocumentMouseEnter: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseMove: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseLeave: () => void
  onCustomerBadgeClick: (e: React.MouseEvent, customerName: string) => void
  onSummaryClick?: (doc: Document) => void
  onFullTextClick?: (doc: Document) => void
  onRenameClick?: (doc: Document) => void
  onDeleteClick?: (doc: Document) => void
  onContextMenu?: (doc: Document, e: React.MouseEvent) => void
  renamingDocumentId?: string | null
  onRenameConfirm?: (documentId: string, newName: string) => void
  onRenameCancel?: () => void
  isEditMode?: boolean
  isAliasMode?: boolean
  isChecked?: boolean
  onCheckToggle?: (documentId: string) => void
  onDocTypeChange?: (documentId: string, newType: string) => void
  updatingDocTypeId?: string | null
  /** 에러 문서 재시도 핸들러 */
  onRetryClick?: (documentId: string) => void
}

const DocumentNode = React.memo<DocumentNodeProps>(({
  node,
  level,
  selectedDocumentId,
  focusedKey,
  searchTerm,
  filenameMode,
  onDocumentClick,
  onDocumentMouseEnter,
  onDocumentMouseMove,
  onDocumentMouseLeave,
  onSummaryClick,
  onFullTextClick,
  onRenameClick,
  onDeleteClick,
  onContextMenu,
  isEditMode,
  isAliasMode,
  isChecked,
  onCheckToggle,
  onRetryClick,
}) => {
  const doc = node.document

  // 검색 시 행별 파일명 모드 오버라이드 (반대쪽 모드에서 매칭 발견 시 전환용)
  const [localModeOverride, setLocalModeOverride] = useState<'display' | 'original' | null>(null)

  // 검색어 변경 시 오버라이드 초기화
  const prevSearchTermRef = useRef(searchTerm)
  if (prevSearchTermRef.current !== searchTerm) {
    prevSearchTermRef.current = searchTerm
    if (localModeOverride !== null) setLocalModeOverride(null)
  }

  // 전체 모드 변경 시에도 오버라이드 초기화
  const prevFilenameModeRef = useRef(filenameMode)
  if (prevFilenameModeRef.current !== filenameMode) {
    prevFilenameModeRef.current = filenameMode
    if (localModeOverride !== null) setLocalModeOverride(null)
  }

  const effectiveMode = localModeOverride ?? filenameMode

  // 검색 시 반대쪽 모드 매칭 감지: 현재 표시명에 매칭 없고, 반대쪽에 매칭 있을 때
  const crossModeMatch = useMemo(() => {
    if (!doc || !searchTerm) return null
    const query = searchTerm.trim().toLowerCase()
    if (!query) return null

    // 별칭이 없으면 양쪽 모드 모두 원본명을 표시하므로 전환 불필요
    if (!doc.displayName) return null

    const { showName: currentName } = getDocName(doc, effectiveMode)
    // 현재 표시명에 이미 매칭이 있으면 버튼 불필요
    if (currentName.toLowerCase().includes(query)) return null

    // 반대쪽 모드의 파일명 확인
    const oppositeMode = effectiveMode === 'display' ? 'original' : 'display'
    const { showName: oppositeName } = getDocName(doc, oppositeMode)
    if (oppositeName.toLowerCase().includes(query)) {
      return oppositeMode
    }
    return null
  }, [searchTerm, effectiveMode, doc])

  if (!doc) return null

  const docId = doc._id || doc.id || ''
  const isSelected = selectedDocumentId === docId
  const isFocused = focusedKey === node.key
  const documentDate = getDocumentDate(doc)
  const filename = DocumentStatusService.extractFilename(doc)
  const { showName, altName, isAlias } = getDocName(doc, effectiveMode)
  const fileExt = doc.mimeType ? DocumentUtils.getFileExtension(doc.mimeType) : ''
  const fileSize = DocumentUtils.formatFileSize(DocumentStatusService.extractFileSize(doc))
  const docStatus = DocumentStatusService.extractStatus(doc)
  const docProgress = doc.progress ?? 0
  const isToday = isDocumentToday(doc, getTodayKST())

  return (
    <div
      data-node-key={node.key}
      className={`doc-explorer-tree__document doc-explorer-tree__document--level-${level}${isSelected ? ' doc-explorer-tree__document--selected' : ''}${isFocused ? ' doc-explorer-tree__document--focused' : ''}${isEditMode ? ' doc-explorer-tree__document--edit' : ''}${isToday ? ' doc-explorer-tree__document--today' : ''}`}
      onClick={(e) => onDocumentClick(doc, e, node.key)}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(doc, e) } : undefined}
      role="treeitem"
      tabIndex={-1}
      aria-selected={isSelected}
    >
      {/* 편집 모드: 체크박스 (별칭 모드에서 이미 별칭이 있는 문서는 완료 표시) */}
      {isEditMode && (() => {
        const hasAlias = isAliasMode && Boolean(doc.displayName) && doc.displayNameStatus !== 'failed'
        if (hasAlias) {
          return (
            <span className="doc-explorer-tree__checkbox-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>✓</span>
            </span>
          )
        }
        return (
          <span className="doc-explorer-tree__checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              className="doc-explorer-tree__checkbox"
              checked={isChecked || false}
              onChange={() => onCheckToggle?.(docId)}
              aria-label={`${showName} 선택`}
            />
          </span>
        )
      })()}

      {/* 문서 아이콘 (확장자에 따른 아이콘) */}
      <span className={`doc-explorer-tree__doc-icon document-icon ${DocumentUtils.getFileTypeClass(doc.mimeType, filename)}`}>
        <SFSymbol
          name={DocumentUtils.getFileIcon(doc.mimeType, filename)}
          size={SFSymbolSize.CAPTION_1}
          weight={SFSymbolWeight.REGULAR}
        />
      </span>

      {/* 문서명 + hover-actions (1 grid cell) */}
      <span className="doc-explorer-tree__doc-name-cell">
        <Tooltip content={altName || showName} placement="bottom">
          <span className="doc-explorer-tree__doc-name" onDoubleClick={(e) => { e.stopPropagation(); onRenameClick?.(doc) }}>
              {isToday && <span className="doc-explorer-tree__new-file-badge">NEW</span>}
              <span
                className={`doc-explorer-tree__doc-name-text${isAlias ? ' document-name--alias' : ''}`}
                onMouseEnter={(e) => onDocumentMouseEnter(doc, e)}
                onMouseMove={(e) => onDocumentMouseMove(doc, e)}
                onMouseLeave={onDocumentMouseLeave}
              >
                {highlightText(showName, searchTerm)}
              </span>
          </span>
        </Tooltip>

        {/* 검색 크로스 모드 전환 버튼: 현재 표시명에 매칭 없고 반대쪽에서 매칭 시 표시 */}
        {crossModeMatch && (
          <Tooltip
            content={crossModeMatch === 'original'
              ? '원본 파일명에서 검색어가 발견됨 · 클릭하면 원본으로 전환'
              : '별칭에서 검색어가 발견됨 · 클릭하면 별칭으로 전환'}
            placement="bottom"
          >
            <button
              type="button"
              className={`fnm-toggle ${crossModeMatch === 'display' ? 'fnm-toggle--alias' : 'fnm-toggle--original'}`}
              style={{ marginLeft: '4px' }}
              onClick={(e) => {
                e.stopPropagation()
                setLocalModeOverride(crossModeMatch)
              }}
              aria-label={crossModeMatch === 'original' ? '원본 파일명으로 전환' : '별칭으로 전환'}
            >
              {crossModeMatch === 'display' ? '별칭' : '원본'}
            </button>
          </Tooltip>
        )}

        {/* 로컬 모드 오버라이드 중: 원래 모드로 돌아가기 버튼 */}
        {localModeOverride && !crossModeMatch && (
          <Tooltip
            content={filenameMode === 'display'
              ? '별칭으로 돌아가기'
              : '원본으로 돌아가기'}
            placement="bottom"
          >
            <button
              type="button"
              className={`fnm-toggle ${filenameMode === 'display' ? 'fnm-toggle--alias' : 'fnm-toggle--original'}`}
              style={{ marginLeft: '4px' }}
              onClick={(e) => {
                e.stopPropagation()
                setLocalModeOverride(null)
              }}
              aria-label={filenameMode === 'display' ? '별칭으로 돌아가기' : '원본으로 돌아가기'}
            >
              {filenameMode === 'display' ? '별칭' : '원본'}
            </button>
          </Tooltip>
        )}

        {/* 별칭 생성 실패 표시 */}
        {effectiveMode === 'display' && !isAlias && doc.displayNameStatus === 'failed' && (
          <Tooltip content="별칭 자동 생성에 실패했습니다. 별칭AI 버튼으로 재생성할 수 있습니다." placement="bottom">
            <span className="document-name__alias-failed">⚠</span>
          </Tooltip>
        )}

        {/* 편집/삭제 아이콘 */}
        {onRenameClick && onDeleteClick && (
          <span className="doc-explorer-tree__hover-actions" onClick={(e) => e.stopPropagation()}>
            <Tooltip content="이름 변경" placement="bottom">
              <button
                type="button"
                className="doc-explorer-tree__hover-btn doc-explorer-tree__hover-btn--rename"
                aria-label="이름 변경"
                onClick={(e) => { e.stopPropagation(); onRenameClick(doc) }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </Tooltip>
            <Tooltip content="삭제" placement="bottom">
              <button
                type="button"
                className="doc-explorer-tree__hover-btn doc-explorer-tree__hover-btn--delete"
                aria-label="삭제"
                onClick={(e) => { e.stopPropagation(); onDeleteClick(doc) }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </Tooltip>
          </span>
        )}
      </span>

      {/* 파일 타입 (JPG, PDF 등) */}
      <Tooltip content={fileExt || '-'} placement="bottom">
        <span className="doc-explorer-tree__doc-ext">
          {fileExt || '-'}
        </span>
      </Tooltip>

      {/* 파일 크기 */}
      <span className="doc-explorer-tree__doc-size">
        {fileSize}
      </span>

      {/* 날짜/시간 */}
      <Tooltip content={documentDate || '-'} placement="bottom">
        <span
          className={`doc-explorer-tree__doc-date${!documentDate ? ' doc-explorer-tree__doc-date--empty' : ''}`}
        >
          {documentDate ? formatDateTime(documentDate) : '-'}
        </span>
      </Tooltip>

      {/* 유형 배지 — DocumentUtils.getDocumentType()으로 통일 계산 */}
      <span className={`doc-explorer-tree__badge doc-explorer-tree__badge--${DocumentUtils.getDocumentType(doc)}`}>
        {DocumentUtils.getDocumentTypeLabel(doc) || 'BIN'}
      </span>

      {/* 처리 상태 — 모든 상태를 아이콘+레이블로 표시 */}
      <span className="doc-explorer-tree__doc-status">
        {docStatus === 'error' ? (
          <Tooltip content="클릭하여 재시도" placement="bottom">
            <span
              className="doc-explorer-tree__status-error"
              onClick={(e) => { e.stopPropagation(); onRetryClick?.(docId) }}
              role="button"
              tabIndex={-1}
            >
              <span className="doc-explorer-tree__status-icon doc-explorer-tree__status-icon--error">✗</span>
              <span className="doc-explorer-tree__status-label doc-explorer-tree__status-label--error">오류</span>
              <span className="doc-explorer-tree__status-retry-text">재시도</span>
            </span>
          </Tooltip>
        )
        : docStatus === 'credit_pending' ? (
          <Tooltip content="크레딧 충전 후 자동 처리됩니다" placement="bottom">
            <span className="doc-explorer-tree__status-credit">
              <span className="doc-explorer-tree__status-icon doc-explorer-tree__status-icon--credit_pending">⏸</span>
            </span>
          </Tooltip>
        )
        : docStatus === 'completed' ? (
          <Tooltip content="완료" placement="bottom">
            <span className="doc-explorer-tree__status-completed">
              <span className="doc-explorer-tree__status-icon doc-explorer-tree__status-icon--completed">✓</span>
              <span className="doc-explorer-tree__status-label doc-explorer-tree__status-label--completed">완료</span>
            </span>
          </Tooltip>
        )
        : docStatus === 'pending' || docStatus === 'embed_pending' || docStatus === 'ocr_queued' ? (
          <Tooltip content={DocumentProcessingModule.getProcessingStatus(doc).label} placement="bottom">
            <span className="doc-explorer-tree__status-pending">
              <span className="doc-explorer-tree__status-icon doc-explorer-tree__status-icon--pending">○</span>
              <span className="doc-explorer-tree__status-label">{DocumentProcessingModule.getProcessingStatus(doc).label}</span>
            </span>
          </Tooltip>
        )
        : (
          /* 처리중 상태: processing, uploading, converting, extracting, ocr_processing, classifying, embedding */
          <Tooltip content={DocumentProcessingModule.getProcessingStatus(doc).label} placement="bottom">
            <span className={`doc-explorer-tree__status-processing doc-explorer-tree__status-processing--${docStatus}`}>
              <span className="doc-explorer-tree__status-spinner" />
              {docProgress > 0 && docProgress < 100
                ? <span className="doc-explorer-tree__status-progress">{docProgress}%</span>
                : <span className="doc-explorer-tree__status-label">{DocumentProcessingModule.getProcessingStatus(doc).label}</span>
              }
            </span>
          </Tooltip>
        )
        }
      </span>

      {/* 액션 버튼 (요약/전체텍스트) -- meta.summary 또는 ocr.summary 유무로 활성/비활성 */}
      <span className="doc-explorer-tree__doc-actions">
        <Tooltip content={(typeof doc.meta === 'object' && doc.meta?.summary) || (typeof doc.ocr === 'object' && (doc.ocr as any)?.summary) ? '요약 보기' : '요약 없음'} placement="bottom">
          <button
            type="button"
            className="doc-explorer-tree__action-btn"
            aria-label="요약 보기"
            disabled={!(typeof doc.meta === 'object' && doc.meta?.summary) && !(typeof doc.ocr === 'object' && (doc.ocr as any)?.summary)}
            onClick={(e) => { e.stopPropagation(); onSummaryClick?.(doc) }}
          >
            <SummaryIcon width={13} height={13} />
          </button>
        </Tooltip>
        <Tooltip content={doc._hasMetaText || doc._hasOcrText ? '전체 텍스트 보기' : '전체 텍스트 없음'} placement="bottom">
          <button
            type="button"
            className="doc-explorer-tree__action-btn"
            aria-label="전체 텍스트 보기"
            disabled={!doc._hasMetaText && !doc._hasOcrText}
            onClick={(e) => { e.stopPropagation(); onFullTextClick?.(doc) }}
          >
            <DocumentIcon width={13} height={13} />
          </button>
        </Tooltip>
      </span>
    </div>
  )
})

DocumentNode.displayName = 'DocumentNode'

// ─────────────────────────────────────────────────────────────
// GroupNode: 그룹 노드 React.memo 컴포넌트
// ─────────────────────────────────────────────────────────────

interface GroupNodeProps {
  node: DocumentTreeNode
  level: number
  expandedKeys: Set<string>
  focusedKey: string | null
  searchTerm: string
  selectedDocumentId: string | null
  filenameMode: 'display' | 'original'
  onGroupClick: (key: string) => void
  onDocumentClick: (doc: Document, e: React.MouseEvent, nodeKey?: string) => void
  onDocumentMouseEnter: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseMove: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseLeave: () => void
  onCustomerBadgeClick: (e: React.MouseEvent, customerName: string) => void
  onSummaryClick?: (doc: Document) => void
  onFullTextClick?: (doc: Document) => void
  onRenameClick?: (doc: Document) => void
  onDeleteClick?: (doc: Document) => void
  onContextMenu?: (doc: Document, e: React.MouseEvent) => void
  renamingDocumentId?: string | null
  onRenameConfirm?: (documentId: string, newName: string) => void
  onRenameCancel?: () => void
  isEditMode?: boolean
  isAliasMode?: boolean
  selectedDocumentIds?: Set<string>
  onCheckToggle?: (documentId: string) => void
  onCustomerContextMenu?: (customerId: string, customerName: string, e: React.MouseEvent, customerType?: '개인' | '법인') => void
  onCustomerDetailClick?: (customerId: string, customerName: string) => void
  onCustomerExplorerClick?: (customerId: string, customerName: string, customerType?: '개인' | '법인') => void
  onOpenFullDetail?: (customerId: string) => void
  onToggleExpandCustomer?: (customerNodeKey: string) => void
  onDocTypeChange?: (documentId: string, newType: string) => void
  updatingDocTypeId?: string | null
  onDownloadCustomerDocuments?: (customerId: string, customerName: string) => void
  selectedCustomerIds?: Set<string>
  onToggleCustomerSelect?: (customerId: string) => void
  /** 에러 문서 재시도 핸들러 */
  onRetryClick?: (documentId: string) => void
}

const GroupNode = React.memo<GroupNodeProps>(({
  node,
  level,
  expandedKeys,
  focusedKey,
  searchTerm,
  selectedDocumentId,
  filenameMode,
  onGroupClick,
  onDocumentClick,
  onDocumentMouseEnter,
  onDocumentMouseMove,
  onDocumentMouseLeave,
  onCustomerBadgeClick,
  onSummaryClick,
  onFullTextClick,
  onRenameClick,
  onDeleteClick,
  onContextMenu,
  renamingDocumentId,
  onRenameConfirm,
  onRenameCancel,
  isEditMode,
  isAliasMode,
  selectedDocumentIds,
  onCheckToggle,
  onCustomerContextMenu,
  onCustomerDetailClick,
  onCustomerExplorerClick,
  onOpenFullDetail,
  onToggleExpandCustomer,
  onDocTypeChange,
  updatingDocTypeId,
  onDownloadCustomerDocuments,
  selectedCustomerIds,
  onToggleCustomerSelect,
  onRetryClick,
}) => {
  const isExpanded = expandedKeys.has(node.key)
  const hasChildren = node.children && node.children.length > 0
  const isSpecial = node.metadata?.isSpecial
  const isFocused = focusedKey === node.key

  // 고객 레벨 액션 메뉴 상태
  const [showActionMenu, setShowActionMenu] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!showActionMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showActionMenu])

  // 고객 노드 여부 (level 0 + customerId)
  const isCustomerNode = level === 0 && !!node.metadata?.customerId

  // 고객 노드 처리 현황: 하위 문서 중 미완료 건수 계산
  const customerProcessingInfo = useMemo(() => {
    if (!isCustomerNode || !node.children) return null
    let processingCount = 0
    let errorCount = 0
    const countDocs = (children: DocumentTreeNode[]) => {
      for (const child of children) {
        if (child.type === 'document' && child.document) {
          const st = DocumentStatusService.extractStatus(child.document)
          if (st === 'error') errorCount++
          else if (st !== 'completed') processingCount++
        }
        if (child.children) countDocs(child.children)
      }
    }
    countDocs(node.children)
    if (processingCount === 0 && errorCount === 0) return null
    return { processingCount, errorCount }
  }, [isCustomerNode, node.children])

  // 카테고리(대분류/소분류) 노드에서 오늘(KST) 등록된 문서 건수 계산
  const todayNewCount = useMemo(() => {
    // 고객 노드는 대상 아님 (대분류/소분류만)
    if (isCustomerNode || !node.children) return 0
    const today = getTodayKST()
    let count = 0
    const countNew = (children: DocumentTreeNode[]) => {
      for (const child of children) {
        if (child.type === 'document' && child.document) {
          if (isDocumentToday(child.document, today)) count++
        }
        if (child.children) countNew(child.children)
      }
    }
    countNew(node.children)
    return count
  }, [isCustomerNode, node.children])

  // 고객 하위 대분류가 펼쳐져 있는지 판단
  const isCustomerChildrenExpanded = isCustomerNode && isExpanded && node.children
    ? node.children.some(child => child.type !== 'document' && expandedKeys.has(child.key))
    : false

  return (
    <div className="doc-explorer-tree__group">
      <div
        data-node-key={node.key}
        className={`doc-explorer-tree__group-header doc-explorer-tree__group-header--level-${level}${isSpecial ? ' doc-explorer-tree__group-header--special' : ''}${isFocused ? ' doc-explorer-tree__group-header--focused' : ''}`}
        onClick={() => onGroupClick(node.key)}
        onContextMenu={node.metadata?.customerId && onCustomerContextMenu ? (e) => {
          e.preventDefault()
          e.stopPropagation()
          onCustomerContextMenu(node.metadata!.customerId!, node.label, e, node.metadata!.customerType === 'corporate' ? '법인' : '개인')
        } : undefined}
        role="treeitem"
        tabIndex={-1}
        aria-expanded={isExpanded}
        aria-selected={isFocused}
      >
        {/* 고객 노드 체크박스 (문서함 다운로드용) */}
        {isCustomerNode && onToggleCustomerSelect && node.metadata?.customerId && (
          <span className="doc-explorer-tree__customer-checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              className="doc-explorer-tree__customer-checkbox"
              checked={selectedCustomerIds?.has(node.metadata.customerId) || false}
              onChange={() => onToggleCustomerSelect(node.metadata!.customerId!)}
              aria-label={`${node.label} 선택`}
            />
          </span>
        )}

        {/* 펼치기/접기 아이콘 - 자식이 있을 때만 표시 (윈도우 탐색기 스타일) */}
        {hasChildren ? (
          <span className="doc-explorer-tree__chevron">
            <SFSymbol
              name={isExpanded ? 'chevron.down' : 'chevron.right'}
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.MEDIUM}
              decorative
            />
          </span>
        ) : (
          <span className="doc-explorer-tree__chevron-placeholder" />
        )}

        {/* 폴더/고객 아이콘 */}
        <span className="doc-explorer-tree__folder-icon">
          {isCustomerNode
            ? (node.metadata?.customerType === 'corporate'
              ? <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate"><circle cx="10" cy="10" r="10" opacity="0.2" /><path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" /></svg>
              : <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal"><circle cx="10" cy="10" r="10" opacity="0.2" /><circle cx="10" cy="7" r="3" /><path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" /></svg>)
            : <SFSymbol name="folder" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.REGULAR} decorative />}
        </span>

        {/* 그룹 라벨 + 고객 문서 수 */}
        <span className="doc-explorer-tree__group-label">
          {highlightText(node.label, searchTerm)}
          {isCustomerNode && (
            <span className="doc-explorer-tree__count-inline">
              {' · '}{node.count ?? 0}건
            </span>
          )}
          {!isCustomerNode && node.count !== undefined && (
            <span className="doc-explorer-tree__count-inline"> ({node.count}건)</span>
          )}
          {/* 카테고리 NEW 배지: 오늘 등록된 문서가 있을 때 표시 */}
          {!isCustomerNode && todayNewCount > 0 && (
            <span className="doc-explorer-tree__new-badge">+{todayNewCount}</span>
          )}
        </span>

        {/* 고객 노드: 처리 현황 배지 (미완료 문서가 있을 때만) */}
        {isCustomerNode && customerProcessingInfo && (
          <>
            {customerProcessingInfo.processingCount > 0 && (
              <span className="doc-explorer-tree__processing-badge">
                {customerProcessingInfo.processingCount} 처리중
              </span>
            )}
            {customerProcessingInfo.errorCount > 0 && (
              <span className="doc-explorer-tree__processing-badge doc-explorer-tree__processing-badge--error">
                {customerProcessingInfo.errorCount} 에러
              </span>
            )}
          </>
        )}

        {/* 고객 노드: 대분류 요약 배지 (접힌 상태에서 분류 현황을 한눈에) */}
        {!isExpanded && node.metadata?.categorySummary && node.metadata.categorySummary.length > 0 && (
          <span className="doc-explorer-tree__category-badges">
            {node.metadata.categorySummary.slice(0, 4).map((cat) => (
              <Tooltip key={cat.label} content={`${cat.label} ${cat.count}건`} placement="bottom">
                <span className="doc-explorer-tree__category-badge">
                  {cat.label.split(' ')[0]} {cat.count}
                </span>
              </Tooltip>
            ))}
            {node.metadata.categorySummary.length > 4 && (
              <Tooltip content={node.metadata.categorySummary.slice(4).map(c => `${c.label} ${c.count}건`).join(', ')} placement="bottom">
                <span className="doc-explorer-tree__category-badge doc-explorer-tree__category-badge--overflow">
                  +{node.metadata.categorySummary.length - 4}
                </span>
              </Tooltip>
            )}
          </span>
        )}

        {/* 고객 노드: 더보기 액션 버튼 (⋮) — 항상 표시 */}
        {isCustomerNode && (
          <div className="doc-explorer-tree__customer-action-wrapper" ref={actionMenuRef}>
            <Tooltip content="고객 메뉴" placement="bottom">
              <button
                type="button"
                className={`doc-explorer-tree__customer-action-trigger${showActionMenu ? ' doc-explorer-tree__customer-action-trigger--active' : ''}`}
                aria-label="고객 메뉴"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowActionMenu(prev => !prev)
                }}
              >
                <SFSymbol name="ellipsis" size={SFSymbolSize.FOOTNOTE} />
              </button>
            </Tooltip>
            {showActionMenu && (
              <div className="doc-explorer-tree__customer-action-menu">
                {/* 간편 문서 검색 (모달) */}
                {/* 하위 폴더 모두 펼치기/접기 */}
                {onToggleExpandCustomer && hasChildren && (
                  <button
                    type="button"
                    className="doc-explorer-tree__customer-action-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowActionMenu(false)
                      onToggleExpandCustomer(node.key)
                    }}
                  >
                    <span className="doc-explorer-tree__customer-action-icon">
                      <SFSymbol name="folder" size={SFSymbolSize.CAPTION_1} decorative />
                    </span>
                    <strong>{node.label}</strong> {isCustomerChildrenExpanded ? '하위 폴더 접기' : '하위 폴더 펼치기'}
                  </button>
                )}
                {/* 문서함 다운로드 */}
                {onDownloadCustomerDocuments && (
                  <button
                    type="button"
                    className="doc-explorer-tree__customer-action-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowActionMenu(false)
                      onDownloadCustomerDocuments(node.metadata!.customerId!, node.label)
                    }}
                  >
                    <span className="doc-explorer-tree__customer-action-icon">
                      <SFSymbol name="arrow.down.circle" size={SFSymbolSize.CAPTION_1} decorative />
                    </span>
                    <strong>{node.label}</strong> 문서함 다운로드
                  </button>
                )}
                {/* 구분선: 위쪽 항목이 하나라도 있을 때만 표시 */}
                {((onToggleExpandCustomer && hasChildren) || onDownloadCustomerDocuments) && (
                  <div className="doc-explorer-tree__customer-action-divider" />
                )}
                {/* 고객 문서 분류함 */}
                {onCustomerExplorerClick && (
                  <button
                    type="button"
                    className="doc-explorer-tree__customer-action-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowActionMenu(false)
                      onCustomerExplorerClick(
                        node.metadata!.customerId!,
                        node.label,
                        node.metadata!.customerType === 'corporate' ? '법인' : '개인'
                      )
                    }}
                  >
                    <span className="doc-explorer-tree__customer-action-icon">
                      <SFSymbol name="archivebox" size={SFSymbolSize.CAPTION_1} decorative />
                    </span>
                    <strong>{node.label}</strong> 문서 분류함
                  </button>
                )}
                {/* 고객 상세 보기 */}
                {onOpenFullDetail && (
                  <button
                    type="button"
                    className="doc-explorer-tree__customer-action-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowActionMenu(false)
                      onOpenFullDetail(node.metadata!.customerId!)
                    }}
                  >
                    <span className="doc-explorer-tree__customer-action-icon">
                      <SFSymbol name="doc.text" size={SFSymbolSize.CAPTION_1} decorative />
                    </span>
                    <strong>{node.label}</strong> 상세 보기
                  </button>
                )}
                {/* 고객 요약 보기 */}
                {onCustomerDetailClick && (
                  <button
                    type="button"
                    className="doc-explorer-tree__customer-action-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowActionMenu(false)
                      onCustomerDetailClick(node.metadata!.customerId!, node.label)
                    }}
                  >
                    <span className="doc-explorer-tree__customer-action-icon">
                      <SFSymbol name="person" size={SFSymbolSize.CAPTION_1} decorative />
                    </span>
                    <strong>{node.label}</strong> 요약 보기
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 자식 노드 */}
      {isExpanded && hasChildren && (
        <div className="doc-explorer-tree__children" role="group">
          {node.children!.map((child) => (
            <TreeNode
              key={child.key}
              node={child}
              level={level + 1}
              expandedKeys={expandedKeys}
              focusedKey={focusedKey}
              searchTerm={searchTerm}
              selectedDocumentId={selectedDocumentId}
              filenameMode={filenameMode}
              onGroupClick={onGroupClick}
              onDocumentClick={onDocumentClick}
              onDocumentMouseEnter={onDocumentMouseEnter}
              onDocumentMouseMove={onDocumentMouseMove}
              onDocumentMouseLeave={onDocumentMouseLeave}
              onCustomerBadgeClick={onCustomerBadgeClick}
              onSummaryClick={onSummaryClick}
              onFullTextClick={onFullTextClick}
              onRenameClick={onRenameClick}
              onDeleteClick={onDeleteClick}
              onContextMenu={onContextMenu}
              renamingDocumentId={renamingDocumentId}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              isEditMode={isEditMode}
              isAliasMode={isAliasMode}
              selectedDocumentIds={selectedDocumentIds}
              onCheckToggle={onCheckToggle}
              onCustomerContextMenu={onCustomerContextMenu}
              onCustomerDetailClick={onCustomerDetailClick}
              onCustomerExplorerClick={onCustomerExplorerClick}
              onOpenFullDetail={onOpenFullDetail}
              onToggleExpandCustomer={onToggleExpandCustomer}
              onDocTypeChange={onDocTypeChange}
              updatingDocTypeId={updatingDocTypeId}
              onDownloadCustomerDocuments={onDownloadCustomerDocuments}
              selectedCustomerIds={selectedCustomerIds}
              onToggleCustomerSelect={onToggleCustomerSelect}
              onRetryClick={onRetryClick}
            />
          ))}
        </div>
      )}
    </div>
  )
})

GroupNode.displayName = 'GroupNode'

// ─────────────────────────────────────────────────────────────
// TreeNode: 노드 타입에 따라 GroupNode/DocumentNode 분기
// ─────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: DocumentTreeNode
  level: number
  expandedKeys: Set<string>
  focusedKey: string | null
  searchTerm: string
  selectedDocumentId: string | null
  filenameMode: 'display' | 'original'
  onGroupClick: (key: string) => void
  onDocumentClick: (doc: Document, e: React.MouseEvent, nodeKey?: string) => void
  onDocumentMouseEnter: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseMove: (doc: Document, e: React.MouseEvent) => void
  onDocumentMouseLeave: () => void
  onCustomerBadgeClick: (e: React.MouseEvent, customerName: string) => void
  onSummaryClick?: (doc: Document) => void
  onFullTextClick?: (doc: Document) => void
  onRenameClick?: (doc: Document) => void
  onDeleteClick?: (doc: Document) => void
  onContextMenu?: (doc: Document, e: React.MouseEvent) => void
  renamingDocumentId?: string | null
  onRenameConfirm?: (documentId: string, newName: string) => void
  onRenameCancel?: () => void
  isEditMode?: boolean
  isAliasMode?: boolean
  selectedDocumentIds?: Set<string>
  onCheckToggle?: (documentId: string) => void
  onCustomerContextMenu?: (customerId: string, customerName: string, e: React.MouseEvent, customerType?: '개인' | '법인') => void
  onCustomerDetailClick?: (customerId: string, customerName: string) => void
  onCustomerExplorerClick?: (customerId: string, customerName: string, customerType?: '개인' | '법인') => void
  onOpenFullDetail?: (customerId: string) => void
  onToggleExpandCustomer?: (customerNodeKey: string) => void
  onDocTypeChange?: (documentId: string, newType: string) => void
  updatingDocTypeId?: string | null
  onDownloadCustomerDocuments?: (customerId: string, customerName: string) => void
  selectedCustomerIds?: Set<string>
  onToggleCustomerSelect?: (customerId: string) => void
  onRetryClick?: (documentId: string) => void
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  expandedKeys,
  focusedKey,
  searchTerm,
  selectedDocumentId,
  filenameMode,
  onGroupClick,
  onDocumentClick,
  onDocumentMouseEnter,
  onDocumentMouseMove,
  onDocumentMouseLeave,
  onCustomerBadgeClick,
  onSummaryClick,
  onFullTextClick,
  onRenameClick,
  onDeleteClick,
  onContextMenu,
  renamingDocumentId,
  onRenameConfirm,
  onRenameCancel,
  isEditMode,
  isAliasMode,
  selectedDocumentIds,
  onCheckToggle,
  onCustomerContextMenu,
  onCustomerDetailClick,
  onCustomerExplorerClick,
  onOpenFullDetail,
  onToggleExpandCustomer,
  onDocTypeChange,
  updatingDocTypeId,
  onDownloadCustomerDocuments,
  selectedCustomerIds,
  onToggleCustomerSelect,
  onRetryClick,
}) => {
  if (node.type === 'document') {
    const docId = node.document?._id || node.document?.id || ''
    return (
      <DocumentNode
        node={node}
        level={level}
        selectedDocumentId={selectedDocumentId}
        focusedKey={focusedKey}
        searchTerm={searchTerm}
        filenameMode={filenameMode}
        onDocumentClick={onDocumentClick}
        onDocumentMouseEnter={onDocumentMouseEnter}
        onDocumentMouseMove={onDocumentMouseMove}
        onDocumentMouseLeave={onDocumentMouseLeave}
        onCustomerBadgeClick={onCustomerBadgeClick}
        onSummaryClick={onSummaryClick}
        onFullTextClick={onFullTextClick}
        onRenameClick={onRenameClick}
        onDeleteClick={onDeleteClick}
        onContextMenu={onContextMenu}
        renamingDocumentId={renamingDocumentId}
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={onRenameCancel}
        isEditMode={isEditMode}
        isAliasMode={isAliasMode}
        isChecked={selectedDocumentIds?.has(docId)}
        onCheckToggle={onCheckToggle}
        onDocTypeChange={onDocTypeChange}
        updatingDocTypeId={updatingDocTypeId}
        onRetryClick={onRetryClick}
      />
    )
  }
  return (
    <GroupNode
      node={node}
      level={level}
      expandedKeys={expandedKeys}
      focusedKey={focusedKey}
      searchTerm={searchTerm}
      selectedDocumentId={selectedDocumentId}
      filenameMode={filenameMode}
      onGroupClick={onGroupClick}
      onDocumentClick={onDocumentClick}
      onDocumentMouseEnter={onDocumentMouseEnter}
      onDocumentMouseMove={onDocumentMouseMove}
      onDocumentMouseLeave={onDocumentMouseLeave}
      onCustomerBadgeClick={onCustomerBadgeClick}
      onSummaryClick={onSummaryClick}
      onFullTextClick={onFullTextClick}
      onRenameClick={onRenameClick}
      onDeleteClick={onDeleteClick}
      onContextMenu={onContextMenu}
      renamingDocumentId={renamingDocumentId}
      onRenameConfirm={onRenameConfirm}
      onRenameCancel={onRenameCancel}
      isEditMode={isEditMode}
      isAliasMode={isAliasMode}
      selectedDocumentIds={selectedDocumentIds}
      onCheckToggle={onCheckToggle}
      onCustomerContextMenu={onCustomerContextMenu}
      onCustomerDetailClick={onCustomerDetailClick}
      onCustomerExplorerClick={onCustomerExplorerClick}
      onOpenFullDetail={onOpenFullDetail}
      onToggleExpandCustomer={onToggleExpandCustomer}
      onDocTypeChange={onDocTypeChange}
      updatingDocTypeId={updatingDocTypeId}
      onDownloadCustomerDocuments={onDownloadCustomerDocuments}
      selectedCustomerIds={selectedCustomerIds}
      onToggleCustomerSelect={onToggleCustomerSelect}
      onRetryClick={onRetryClick}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// DocumentExplorerTree: 메인 트리 컴포넌트
// ─────────────────────────────────────────────────────────────

/** 컬럼 헤더 — scroll container 밖에서 렌더링해야 sticky/clipping 버그가 없음 */
export interface DocumentExplorerColumnHeaderProps {
  sortBy?: DocumentSortBy
  sortDirection?: SortDirection
  onSortByChange: (sortBy: DocumentSortBy) => void
  filenameMode?: 'display' | 'original'
  onFilenameModeChange?: (mode: 'display' | 'original') => void
  customerSelectMode?: boolean
  onToggleCustomerSelectMode?: () => void
}

export const DocumentExplorerColumnHeader: React.FC<DocumentExplorerColumnHeaderProps> = ({
  sortBy,
  sortDirection,
  onSortByChange,
  filenameMode,
  onFilenameModeChange,
  customerSelectMode = false,
  onToggleCustomerSelectMode,
}) => (
  <div className="doc-explorer-tree__column-header">
    {onToggleCustomerSelectMode ? (
      <Tooltip content={customerSelectMode ? '선택 모드 종료' : '고객을 선택하여 문서함 다운로드'}>
        <button
          type="button"
          className={`doc-explorer-tree__col-select-btn${customerSelectMode ? ' doc-explorer-tree__col-select-btn--active' : ''}`}
          onClick={onToggleCustomerSelectMode}
          aria-label={customerSelectMode ? '선택 모드 종료' : '선택 다운로드'}
        >
          {customerSelectMode ? (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="7" />
              <path d="M5 8L7 10L11 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </Tooltip>
    ) : (
      <span className="doc-explorer-tree__col-spacer" />
    )}
    <div className="doc-explorer-tree__col-filename">
      <button
        type="button"
        className={`doc-explorer-tree__col-btn${sortBy === 'name' ? ' doc-explorer-tree__col-btn--active' : ''}`}
        onClick={() => onSortByChange('name')}
        aria-label="파일명 기준 정렬"
      >
        {SORT_BY_LABELS.name}
        {sortBy === 'name' && (
          <SFSymbol
            name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
            size={SFSymbolSize.CAPTION_2}
            weight={SFSymbolWeight.MEDIUM}
            className="doc-explorer-tree__col-arrow"
            decorative
          />
        )}
      </button>
      {/* 🍎 파일명 표시 모드 토글: 원본 ↔ 별칭 */}
      {onFilenameModeChange && (
        <FilenameModeToggle filenameMode={filenameMode!} onModeChange={onFilenameModeChange} />
      )}
    </div>
    <button
      type="button"
      className={`doc-explorer-tree__col-btn doc-explorer-tree__col-btn--center${sortBy === 'ext' ? ' doc-explorer-tree__col-btn--active' : ''}`}
      onClick={() => onSortByChange('ext')}
      aria-label="형식 기준 정렬"
    >
      {SORT_BY_LABELS.ext}
      {sortBy === 'ext' && (
        <SFSymbol
          name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
          size={SFSymbolSize.CAPTION_2}
          weight={SFSymbolWeight.MEDIUM}
          className="doc-explorer-tree__col-arrow"
          decorative
        />
      )}
    </button>
    <button
      type="button"
      className={`doc-explorer-tree__col-btn doc-explorer-tree__col-btn--center${sortBy === 'size' ? ' doc-explorer-tree__col-btn--active' : ''}`}
      onClick={() => onSortByChange('size')}
      aria-label="크기 기준 정렬"
    >
      {SORT_BY_LABELS.size}
      {sortBy === 'size' && (
        <SFSymbol
          name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
          size={SFSymbolSize.CAPTION_2}
          weight={SFSymbolWeight.MEDIUM}
          className="doc-explorer-tree__col-arrow"
          decorative
        />
      )}
    </button>
    <button
      type="button"
      className={`doc-explorer-tree__col-btn doc-explorer-tree__col-btn--center${sortBy === 'date' ? ' doc-explorer-tree__col-btn--active' : ''}`}
      onClick={() => onSortByChange('date')}
      aria-label="날짜 기준 정렬"
    >
      {SORT_BY_LABELS.date}
      {sortBy === 'date' && (
        <SFSymbol
          name={sortDirection === 'asc' ? 'chevron.up' : 'chevron.down'}
          size={SFSymbolSize.CAPTION_2}
          weight={SFSymbolWeight.MEDIUM}
          className="doc-explorer-tree__col-arrow"
          decorative
        />
      )}
    </button>
    <span className="doc-explorer-tree__col-label doc-explorer-tree__col-label--center">배지</span>
    <span className="doc-explorer-tree__col-label doc-explorer-tree__col-label--center">상태</span>
    <span className="doc-explorer-tree__col-spacer" />
  </div>
)

// ─────────────────────────────────────────────────────────────

export const DocumentExplorerTree: React.FC<DocumentExplorerTreeProps> = ({
  nodes,
  expandedKeys,
  selectedDocumentId,
  groupBy: _groupBy,
  onToggleNode,
  onDocumentClick,
  onDocumentDoubleClick,
  onCustomerClick,
  sortBy = 'date',
  sortDirection = 'desc',
  searchTerm = '',
  thumbnailEnabled = true,
  filenameMode = 'display',
  onFilenameModeChange: _onFilenameModeChange,
  onSummaryClick,
  onFullTextClick,
  onRenameClick,
  onDeleteClick,
  onDocumentContextMenu,
  renamingDocumentId,
  onRenameConfirm,
  onRenameCancel,
  isEditMode = false,
  isAliasMode = false,
  selectedDocumentIds,
  onSelectDocument,
  onCustomerContextMenu,
  onCustomerDetailClick,
  onCustomerExplorerClick,
  onOpenFullDetail,
  onToggleExpandCustomer,
  onDocTypeChange,
  updatingDocTypeId,
  onSortByChange,
  hideColumnHeader = false,
  onDownloadCustomerDocuments,
  selectedCustomerIds,
  onToggleCustomerSelect,
  customerSelectMode = false,
  onRetryClick,
}) => {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickedIdRef = useRef<string | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const rightPaneVisible = useLayoutStore(s => s.rightPaneVisible)

  // ── 파일명 동적 최소 폭 측정 ──
  // doc-name 요소의 scrollWidth로 실제 렌더링 폭 측정 (overflow:hidden이어도 scrollWidth는 전체 폭 반환)
  // expandedKeys 변경(폴더 펼침/접힘) 시에도 재측정
  const prevMeasuredRef = useRef(0)
  useLayoutEffect(() => {
    const treeLayout = treeContainerRef.current?.closest('.doc-explorer-tree-layout') as HTMLElement | null
    if (!treeLayout) return

    // 숨겨진 측정용 span으로 텍스트 실제 폭 측정 (DOM 제약에 영향받지 않음)
    const nameTexts = treeLayout.querySelectorAll('.doc-explorer-tree__doc-name-text')
    if (nameTexts.length === 0) {
      treeLayout.style.removeProperty('--doc-row-min-width')
      prevMeasuredRef.current = 0
      return
    }

    // 측정용 span 생성 — 실제 폰트 스타일 복제
    const probe = document.createElement('span')
    const sampleEl = nameTexts[0] as HTMLElement
    const cs = getComputedStyle(sampleEl)
    probe.style.cssText = `
      position: absolute; top: -9999px; left: -9999px;
      white-space: nowrap; visibility: hidden; pointer-events: none;
      font: ${cs.font}; letter-spacing: ${cs.letterSpacing};
      font-feature-settings: ${cs.fontFeatureSettings};
    `
    document.body.appendChild(probe)

    let maxNameWidth = 0
    nameTexts.forEach((el) => {
      const htmlEl = el as HTMLElement
      // 별칭 접두사 "+" (CSS ::before) 포함 여부 확인
      const hasAlias = htmlEl.classList.contains('document-name--alias')
      probe.textContent = (hasAlias ? '+' : '') + (htmlEl.textContent || '')
      const w = probe.offsetWidth
      if (w > maxNameWidth) maxNameWidth = w
    })

    document.body.removeChild(probe)

    // hover-actions(41px) + 배지/링크아이콘(20px) + 서브픽셀/패딩 여유(55px) = 116px
    const nameColWidth = Math.max(maxNameWidth + 116, 180)

    if (Math.abs(nameColWidth - prevMeasuredRef.current) < 4) return
    prevMeasuredRef.current = nameColWidth

    // 고정 컬럼: 20+32+48+80+32+64+40=316px, gaps: 7×6=42px, 패딩/여유=32px → 390px
    const totalMinWidth = nameColWidth + 390
    treeLayout.style.setProperty('--doc-row-min-width', `${totalMinWidth}px`)
  }, [nodes, filenameMode, expandedKeys])

  // 호버 프리뷰 상태 (useRef로 동기적 업데이트 + forceUpdate로 즉시 렌더링)
  // useState는 비동기적이라 빠른 마우스 이동 시 batching으로 누락될 수 있음
  const [, forceHoverUpdate] = useReducer(x => x + 1, 0)
  const hoverStateRef = useRef<{
    document: Document
    position: { x: number; y: number }
  } | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  // 키보드 네비게이션 훅
  const {
    focusedKey,
    setFocusedKey,
    handleKeyDown: keyboardHandleKeyDown,
    needsScroll,
    clearNeedsScroll,
  } = useDocumentExplorerKeyboard({
    nodes,
    expandedKeys,
    selectedDocumentId,
    onToggleNode,
    onDocumentClick,
    onDocumentDoubleClick,
  })

  // 키보드 탐색 시에만 포커스 요소로 스크롤 (마우스 클릭은 스크롤 불필요)
  useEffect(() => {
    if (!needsScroll || !focusedKey || !treeContainerRef.current) return

    const focusedElement = treeContainerRef.current.querySelector(
      `[data-node-key="${focusedKey}"]`
    ) as HTMLElement

    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    clearNeedsScroll()
  }, [needsScroll, focusedKey, clearNeedsScroll])

  // 별칭↔원본 전환 시: 선택된 문서가 있으면 해당 위치로 자동 스크롤 (정렬 변경으로 인한 위치 이동 대응)
  const prevFilenameModeRef = useRef(filenameMode)
  useEffect(() => {
    if (prevFilenameModeRef.current === filenameMode) return
    prevFilenameModeRef.current = filenameMode

    if (!selectedDocumentId) return

    // 트리 재정렬 + React 재렌더링 완료 후 스크롤
    const timer = setTimeout(() => {
      const selectedElement = document.querySelector(
        `[data-node-key="doc-${selectedDocumentId}"]`
      ) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'center', behavior: 'instant' })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [filenameMode, selectedDocumentId])

  // rAF / leave 타이머 cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  // 문서 클릭 핸들러 (싱글/더블클릭 구분)
  const handleDocumentClick = useCallback(
    (doc: Document, e: React.MouseEvent, nodeKey?: string) => {
      e.stopPropagation()
      const docId = doc._id || doc.id || ''

      // 클릭 후에도 hover 유지 (리렌더링으로 인한 mouseLeave 방지)
      hoverStateRef.current = { document: doc, position: { x: e.clientX, y: e.clientY } }
      forceHoverUpdate()

      // 클릭한 노드로 포커스 이동
      if (nodeKey) {
        setFocusedKey(nodeKey)
      }

      if (clickTimerRef.current && lastClickedIdRef.current === docId) {
        // 더블클릭
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
        lastClickedIdRef.current = null
        onDocumentDoubleClick(doc)
      } else {
        // 싱글클릭 대기
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current)
        }
        lastClickedIdRef.current = docId
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null
          lastClickedIdRef.current = null
          onDocumentClick(doc)
        }, DOUBLE_CLICK_DELAY)
      }
    },
    [onDocumentClick, onDocumentDoubleClick, setFocusedKey]
  )

  // 그룹 클릭 핸들러
  const handleGroupClick = useCallback(
    (key: string) => {
      setFocusedKey(key)
      onToggleNode(key)
    },
    [onToggleNode, setFocusedKey]
  )

  // 고객명 클릭 핸들러
  const handleCustomerBadgeClick = useCallback(
    (e: React.MouseEvent, customerName: string) => {
      e.stopPropagation() // 문서 클릭 이벤트 방지
      onCustomerClick?.(customerName)
    },
    [onCustomerClick]
  )

  // 문서 호버 핸들러 (mouseEnter 시 즉시 표시)
  const handleDocumentMouseEnter = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      // Leave 타이머 취소 (문서 간 이동 시 깜빡임 방지)
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      // ref로 동기적 업데이트 + React batching으로 자연스럽게 렌더
      hoverStateRef.current = { document: doc, position: { x: e.clientX, y: e.clientY } }
      forceHoverUpdate()
    },
    []
  )

  // 마우스 이동 시 위치 업데이트 (rAF throttle로 초당 ~60회 렌더 → 1회)
  const handleDocumentMouseMove = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      // mouseEnter가 안 들어올 수 있으므로, mouseMove에서도 leave 타이머 취소
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }

      const needsImmediate = !hoverStateRef.current
      hoverStateRef.current = { document: doc, position: { x: e.clientX, y: e.clientY } }

      if (needsImmediate) {
        // hover 상태가 없으면 즉시 표시 (mouseEnter가 누락된 경우)
        forceHoverUpdate()
      } else if (!rafRef.current) {
        // 위치만 업데이트: rAF로 throttle (프레임당 최대 1회 렌더)
        rafRef.current = requestAnimationFrame(() => {
          forceHoverUpdate()
          rafRef.current = null
        })
      }
    },
    []
  )

  // mouseLeave 디바운싱 (문서 간 빠른 이동 시 경쟁 조건 방지)
  const handleDocumentMouseLeave = useCallback(() => {
    // 이미 타이머가 있으면 취소
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
    }
    // 30ms 후에 null로 설정 (다른 문서로 Enter하면 취소됨)
    leaveTimerRef.current = setTimeout(() => {
      hoverStateRef.current = null
      forceHoverUpdate()
      leaveTimerRef.current = null
    }, 30)
  }, [])


  // 빈 상태 (모든 훅 호출 이후에 체크)
  if (nodes.length === 0) {
    return (
      <div className="doc-explorer-tree__empty">
        <SFSymbol
          name="doc.text.magnifyingglass"
          size={SFSymbolSize.TITLE_1}
          weight={SFSymbolWeight.LIGHT}
          className="doc-explorer-tree__empty-icon"
        />
        <p className="doc-explorer-tree__empty-text">문서가 없습니다</p>
      </div>
    )
  }

  return (
    <>
      {/* 컬럼 헤더 — hideColumnHeader=true이면 부모가 scroll container 밖에서 직접 렌더링 */}
      {!hideColumnHeader && onSortByChange && (
        <DocumentExplorerColumnHeader
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortByChange={onSortByChange}
          filenameMode={filenameMode}
        />
      )}
      <div
        ref={treeContainerRef}
        className={`doc-explorer-tree${customerSelectMode ? ' doc-explorer-tree--selection-active' : ''}`}
        role="tree"
        tabIndex={0}
        onKeyDown={keyboardHandleKeyDown}
      >
        {nodes.map((node) => (
          <TreeNode
            key={node.key}
            node={node}
            level={0}
            expandedKeys={expandedKeys}
            focusedKey={focusedKey}
            searchTerm={searchTerm}
            selectedDocumentId={selectedDocumentId}
            filenameMode={filenameMode}
            onGroupClick={handleGroupClick}
            onDocumentClick={handleDocumentClick}
            onDocumentMouseEnter={handleDocumentMouseEnter}
            onDocumentMouseMove={handleDocumentMouseMove}
            onDocumentMouseLeave={handleDocumentMouseLeave}
            onCustomerBadgeClick={handleCustomerBadgeClick}
            onSummaryClick={onSummaryClick}
            onFullTextClick={onFullTextClick}
            onRenameClick={onRenameClick}
            onDeleteClick={onDeleteClick}
            onContextMenu={onDocumentContextMenu}
            renamingDocumentId={renamingDocumentId}
            onRenameConfirm={onRenameConfirm}
            onRenameCancel={onRenameCancel}
            isEditMode={isEditMode}
            isAliasMode={isAliasMode}
            selectedDocumentIds={selectedDocumentIds}
            onCheckToggle={onSelectDocument}
            onCustomerContextMenu={onCustomerContextMenu}
            onCustomerDetailClick={onCustomerDetailClick}
            onCustomerExplorerClick={onCustomerExplorerClick}
            onOpenFullDetail={onOpenFullDetail}
            onToggleExpandCustomer={onToggleExpandCustomer}
            onDocTypeChange={onDocTypeChange}
            updatingDocTypeId={updatingDocTypeId}
            onDownloadCustomerDocuments={onDownloadCustomerDocuments}
            selectedCustomerIds={selectedCustomerIds}
            onToggleCustomerSelect={onToggleCustomerSelect}
            onRetryClick={onRetryClick}
          />
        ))}
      </div>
      {/* 호버 시 썸네일 표시 (thumbnailEnabled일 때만) */}
      {thumbnailEnabled && (
        <HoverPreview
          document={hoverStateRef.current?.document ?? null}
          position={hoverStateRef.current?.position ?? null}
          rightPaneVisible={rightPaneVisible}
        />
      )}
    </>
  )
}
