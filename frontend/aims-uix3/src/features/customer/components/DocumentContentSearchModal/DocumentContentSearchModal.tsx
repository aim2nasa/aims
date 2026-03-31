/**
 * AIMS UIX-3 Document Content Search Modal
 * @since 2025-12-09
 *
 * 🍎 문서 내용 검색 모달 컴포넌트 (2-pane 레이아웃)
 * - 왼쪽: 검색창 + 간결한 결과 목록
 * - 오른쪽: 문서 미리보기
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import DraggableModal from '@/shared/ui/DraggableModal'
import { SearchService } from '@/services/searchService'
import { resolveFileUrl, resolvePdfUrl } from '../../../../utils/documentTransformers'
import type { SearchResultItem } from '@/entities/search'
import SFSymbol, { SFSymbolSize, SFSymbolWeight, SFSymbolAnimation } from '../../../../components/SFSymbol'
import { FilenameModeToggle } from '@/shared/ui/FilenameModeToggle'
import { errorReporter } from '@/shared/lib/errorReporter'
import { getAuthToken, getCurrentUserId } from '@/shared/lib/api'
import './DocumentContentSearchModal.css'

interface DocumentContentSearchModalProps {
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 고객 ID */
  customerId: string
  /** 고객 이름 */
  customerName: string
  /** 고객 유형 (개인/법인) */
  customerType?: '개인' | '법인'
  /** 초기 검색어 (간편 문서검색에서 전달) */
  initialQuery?: string
}

export const DocumentContentSearchModal: React.FC<DocumentContentSearchModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerType = '개인',
  initialQuery = ''
}) => {
  // 🍎 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SearchResultItem | null>(null)
  const [infoTab, setInfoTab] = useState<'summary' | 'snippet'>('summary')
  const [leftPanelWidth, setLeftPanelWidth] = useState(320)
  // 🍎 파일명 표시 모드 (별칭/원본)
  const [filenameMode, setFilenameMode] = useState<'display' | 'original'>(() => {
    if (typeof window === 'undefined') return 'display'
    return (localStorage.getItem('aims-filename-mode') as 'display' | 'original') ?? 'display'
  })
  // 🍎 프리뷰 관련 상태
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<'pdf' | 'image' | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // 🍎 검색 입력 ref
  const inputRef = useRef<HTMLInputElement>(null)
  // 🍎 자동 검색 플래그 (초기 검색어로 자동 검색 여부)
  const shouldAutoSearch = useRef(false)
  // 🍎 리사이즈 관련 ref
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)

  // 🍎 모달 열릴 때 입력창 포커스 및 초기 검색어 설정
  useEffect(() => {
    if (isOpen) {
      // 초기 검색어가 있으면 설정하고 자동 검색 플래그 설정
      if (initialQuery.trim()) {
        setSearchQuery(initialQuery)
        shouldAutoSearch.current = true
      }
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, initialQuery])

  // 🍎 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setResults([])
      setError(null)
      setHasSearched(false)
      setSelectedItem(null)
      setPreviewUrl(null)
      setPreviewType(null)
      shouldAutoSearch.current = false
    }
  }, [isOpen])

  // 🍎 선택된 문서가 변경되면 프리뷰 정보 자동 로드
  const selectedItemRef = useRef<SearchResultItem | null>(null)

  // 🍎 초기 검색어로 자동 검색 실행
  useEffect(() => {
    if (shouldAutoSearch.current && searchQuery.trim() && isOpen) {
      shouldAutoSearch.current = false
      // 검색 실행 (비동기)
      const autoSearch = async () => {
        setIsLoading(true)
        setError(null)
        setHasSearched(true)
        setSelectedItem(null)
        setPreviewUrl(null)
        setPreviewType(null)

        try {
          const response = await SearchService.searchDocuments({
            query: searchQuery.trim(),
            search_mode: 'keyword',
            mode: 'AND',
            customer_id: customerId
          })

          setResults(response.search_results || [])
          if (response.search_results && response.search_results.length > 0) {
            const firstItem = response.search_results[0]
            setSelectedItem(firstItem)
            selectedItemRef.current = firstItem
          }
        } catch (err) {
          console.error('[DocumentContentSearchModal] 자동 검색 실패:', err)
          errorReporter.reportApiError(err as Error, { component: 'DocumentContentSearchModal.autoSearch' })
          setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
          setResults([])
        } finally {
          setIsLoading(false)
        }
      }
      void autoSearch()
    }
  }, [searchQuery, isOpen, customerId])

  // 🍎 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !splitContainerRef.current) return

      const containerRect = splitContainerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left

      // 최소 200px, 최대 500px로 제한
      const clampedWidth = Math.max(200, Math.min(500, newWidth))
      setLeftPanelWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // 🍎 검색 실행
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError('검색어를 입력해 주세요.')
      return
    }

    setIsLoading(true)
    setError(null)
    setHasSearched(true)
    setSelectedItem(null)
    setPreviewUrl(null)
    setPreviewType(null)

    try {
      const response = await SearchService.searchDocuments({
        query: searchQuery.trim(),
        search_mode: 'keyword',
        mode: 'AND',
        customer_id: customerId
      })

      setResults(response.search_results || [])
      // 첫 번째 결과 자동 선택
      if (response.search_results && response.search_results.length > 0) {
        const firstItem = response.search_results[0]
        setSelectedItem(firstItem)
        selectedItemRef.current = firstItem
      }
    } catch (err) {
      console.error('[DocumentContentSearchModal] 검색 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'DocumentContentSearchModal.handleSearch' })
      setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, customerId])

  // 🍎 Enter 키 검색
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleSearch()
    }
  }, [handleSearch])

  // 🍎 파일명 추출 (원본)
  const getFileName = (item: SearchResultItem): string => {
    return SearchService.getOriginalName(item) || '이름 없음'
  }

  // 🍎 표시 파일명 (별칭 우선, 없으면 원본)
  const getShowName = (item: SearchResultItem): string => {
    return SearchService.getDisplayName(item) || getFileName(item)
  }

  // 🍎 문서 ID 추출
  const getDocumentId = (item: SearchResultItem): string => {
    return SearchService.getDocumentId(item)
  }

  // 🍎 MIME 타입 추출
  const getMimeType = (item: SearchResultItem): string => {
    return SearchService.getMimeType(item) || ''
  }

  // 🍎 파일 타입 배지 정보
  const getFileTypeBadge = (item: SearchResultItem): { label: string; className: string } => {
    const mimeType = getMimeType(item)
    const fileName = getFileName(item).toLowerCase()

    if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
      return { label: 'PDF', className: 'doc-search-badge--pdf' }
    }
    if (mimeType.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)) {
      return { label: '이미지', className: 'doc-search-badge--image' }
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || fileName.match(/\.(xlsx|xls)$/)) {
      return { label: 'Excel', className: 'doc-search-badge--excel' }
    }
    if (mimeType.includes('word') || fileName.match(/\.(docx|doc)$/)) {
      return { label: 'Word', className: 'doc-search-badge--word' }
    }
    return { label: '문서', className: 'doc-search-badge--other' }
  }

  // 🍎 파일 URL 생성
  // PDF: 메타데이터 수정 프록시 경유 (tars.giize.com/pdf/...)
  // 기타: 일반 파일 서버 (tars.giize.com/files/...)
  const getFileUrl = (item: SearchResultItem): string | null => {
    const filePath = SearchService.getFilePath(item)
    if (!filePath) return null

    // PDF 파일은 프록시 경유 (한글 깨짐 방지)
    if (isPdf(item)) {
      const originalName = getFileName(item)
      return resolvePdfUrl(filePath, originalName) || null
    }

    return resolveFileUrl(filePath) || null
  }

  // 🍎 PDF 여부 확인
  const isPdf = (item: SearchResultItem): boolean => {
    const mimeType = getMimeType(item)
    const fileName = getFileName(item).toLowerCase()
    return mimeType.includes('pdf') || fileName.endsWith('.pdf')
  }

  // 🍎 이미지 여부 확인
  const isImage = (item: SearchResultItem): boolean => {
    const mimeType = getMimeType(item)
    const fileName = getFileName(item).toLowerCase()
    return mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/.test(fileName)
  }

  // 🍎 프리뷰 가능 여부 (PDF/이미지/변환된 PDF)
  const canPreview = (item: SearchResultItem): boolean => {
    return isPdf(item) || isImage(item)
  }

  // 🍎 프리뷰 정보 가져오기 (PDF 변환 파일 포함)
  const fetchPreviewInfo = useCallback(async (item: SearchResultItem) => {
    const docId = getDocumentId(item)
    if (!docId) {
      setPreviewUrl(null)
      setPreviewType(null)
      return
    }

    // PDF나 이미지는 바로 프리뷰 가능
    if (isPdf(item)) {
      const url = getFileUrl(item)
      setPreviewUrl(url)
      setPreviewType('pdf')
      return
    }

    if (isImage(item)) {
      const filePath = SearchService.getFilePath(item)
      const url = filePath ? resolveFileUrl(filePath) : null
      setPreviewUrl(url || null)
      setPreviewType('image')
      return
    }

    // 그 외 파일은 API에서 변환된 PDF 경로 조회
    setIsLoadingPreview(true)
    try {
      const userId = getCurrentUserId() || 'tester'
      // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
      const token = getAuthToken()

      const response = await fetch(`/api/documents/${docId}/status`, {
        headers: {
          'x-user-id': userId,
          ...(token && { Authorization: `Bearer ${token}` })
        }
      })

      if (!response.ok) {
        setPreviewUrl(null)
        setPreviewType(null)
        return
      }

      const data = await response.json()
      if (data.success && data.data?.computed) {
        const { previewFilePath, canPreview: canPrev } = data.data.computed

        if (canPrev && previewFilePath) {
          // 변환된 PDF 경로가 있으면 PDF 프록시 URL로 변환
          const ext = (previewFilePath.split('.').pop() || '').toLowerCase()
          if (ext === 'pdf') {
            const originalName = getFileName(item)
            const url = resolvePdfUrl(previewFilePath, originalName)
            setPreviewUrl(url || null)
            setPreviewType('pdf')
          } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
            const url = resolveFileUrl(previewFilePath)
            setPreviewUrl(url || null)
            setPreviewType('image')
          } else {
            setPreviewUrl(null)
            setPreviewType(null)
          }
        } else {
          setPreviewUrl(null)
          setPreviewType(null)
        }
      } else {
        setPreviewUrl(null)
        setPreviewType(null)
      }
    } catch (err) {
      console.error('[DocumentContentSearchModal] 프리뷰 정보 조회 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'DocumentContentSearchModal.fetchPreviewInfo' })
      setPreviewUrl(null)
      setPreviewType(null)
    } finally {
      setIsLoadingPreview(false)
    }
  }, [])

  // 🍎 문서 선택 핸들러
  const handleSelectItem = useCallback((item: SearchResultItem) => {
    setSelectedItem(item)
    void fetchPreviewInfo(item)
  }, [fetchPreviewInfo])

  // 🍎 검색 결과에서 첫 번째 문서 자동 선택 시 프리뷰 로드
  useEffect(() => {
    if (selectedItemRef.current && selectedItem === selectedItemRef.current) {
      void fetchPreviewInfo(selectedItemRef.current)
      selectedItemRef.current = null
    }
  }, [selectedItem, fetchPreviewInfo])

  // 🍎 요약 텍스트 추출
  const getSummary = (item: SearchResultItem): string => {
    return SearchService.getSummary(item)
  }

  // 🍎 텍스트 스니펫 추출
  const getTextSnippet = (item: SearchResultItem): string => {
    const fullText = (item as any).ocr?.full_text ||
                     (item as any).meta?.full_text ||
                     (item as any).text?.full_text ||
                     ''

    if (!fullText) return '텍스트를 찾을 수 없습니다.'

    const keywords = searchQuery.trim().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return fullText.substring(0, 150) + '...'

    // 첫 번째 키워드 기준으로 앞뒤 context 추출
    const searchLower = fullText.toLowerCase()
    const keywordLower = keywords[0].toLowerCase()
    const idx = searchLower.indexOf(keywordLower)

    if (idx === -1) return fullText.substring(0, 150) + '...'

    const start = Math.max(0, idx - 50)
    const end = Math.min(fullText.length, idx + keywordLower.length + 100)
    let snippet = fullText.substring(start, end)

    if (start > 0) snippet = '...' + snippet
    if (end < fullText.length) snippet = snippet + '...'

    return snippet
  }

  // 🍎 키워드 하이라이트
  const highlightKeywords = (text: string): React.ReactNode => {
    const keywords = searchQuery.trim().split(/\s+/).filter(k => k.length > 0)
    if (keywords.length === 0) return text

    const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(pattern)

    return parts.map((part, index) => {
      const isMatch = keywords.some(kw => part.toLowerCase() === kw.toLowerCase())
      return isMatch ? (
        <mark key={index} className="doc-search-highlight">{part}</mark>
      ) : (
        <span key={index}>{part}</span>
      )
    })
  }

  // 🍎 모달 타이틀 구성
  const modalTitle = (
    <div className="doc-search-modal-title">
      <SFSymbol
        name="doc.text.magnifyingglass"
        size={SFSymbolSize.BODY}
        weight={SFSymbolWeight.MEDIUM}
      />
      <span>간편 문서 검색</span>
      <span className="doc-search-modal-title__customer">
        {customerType === '법인' ? (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
            <circle cx="10" cy="10" r="10" opacity="0.2" />
            <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
            <circle cx="10" cy="10" r="10" opacity="0.2" />
            <circle cx="10" cy="7" r="3" />
            <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
          </svg>
        )}
        {customerName}
      </span>
    </div>
  )

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title={modalTitle}
      backdropClosable={false}
      initialWidth={1100}
      initialHeight={600}
      minWidth={800}
      minHeight={400}
      className="doc-content-search-modal"
    >
      {/* 🍎 2-Pane 레이아웃 (리사이즈 가능) */}
      <div
        ref={splitContainerRef}
        className="doc-search-split"
        style={{ gridTemplateColumns: `${leftPanelWidth}px 6px 1fr` }}
      >
        {/* 🍎 왼쪽: 검색 + 결과 목록 */}
        <div className="doc-search-left">

          {/* 검색창 */}
          <div className="doc-search-left__search">
            <div className="doc-search-left__search-input-wrap">
              <SFSymbol
                name="magnifyingglass"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
                className="doc-search-left__search-icon"
              />
              <input
                ref={inputRef}
                type="text"
                className="doc-search-left__search-input"
                placeholder="검색어 입력..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="doc-search-left__search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="검색어 지우기"
                >
                  <SFSymbol
                    name="xmark.circle.fill"
                    size={SFSymbolSize.CAPTION_2}
                    weight={SFSymbolWeight.REGULAR}
                  />
                </button>
              )}
            </div>
            <button
              type="button"
              className="doc-search-left__search-btn"
              onClick={() => void handleSearch()}
              disabled={isLoading || !searchQuery.trim()}
            >
              {isLoading ? (
                <SFSymbol
                  name="arrow.trianglehead.2.clockwise"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  animation={SFSymbolAnimation.ROTATE}
                />
              ) : '검색'}
            </button>
          </div>

          {/* 결과 영역 */}
          <div className="doc-search-left__results">
            {/* 에러 */}
            {error && (
              <div className="doc-search-left__error">
                <SFSymbol name="exclamationmark.triangle" size={SFSymbolSize.CAPTION_1} />
                <span>{error}</span>
              </div>
            )}

            {/* 로딩 */}
            {isLoading && (
              <div className="doc-search-left__loading">
                <SFSymbol
                  name="arrow.trianglehead.2.clockwise"
                  size={SFSymbolSize.TITLE_3}
                  animation={SFSymbolAnimation.ROTATE}
                />
                <span>검색 중...</span>
              </div>
            )}

            {/* 초기 상태 */}
            {!isLoading && !hasSearched && !error && (
              <div className="doc-search-left__empty">
                <SFSymbol
                  name="magnifyingglass"
                  size={SFSymbolSize.TITLE_2}
                  weight={SFSymbolWeight.LIGHT}
                />
                <p>검색어를 입력하세요</p>
              </div>
            )}

            {/* 결과 없음 */}
            {!isLoading && hasSearched && results.length === 0 && !error && (
              <div className="doc-search-left__empty">
                <SFSymbol
                  name="doc.questionmark"
                  size={SFSymbolSize.TITLE_2}
                  weight={SFSymbolWeight.LIGHT}
                />
                <p>검색 결과가 없습니다</p>
              </div>
            )}

            {/* 결과 목록 */}
            {!isLoading && results.length > 0 && (
              <>
                <div className="doc-search-left__results-count">
                  <span>{results.length}건</span>
                  <FilenameModeToggle filenameMode={filenameMode} onModeChange={(next) => {
                    setFilenameMode(next)
                    localStorage.setItem('aims-filename-mode', next)
                  }} />
                </div>
                <div className="doc-search-left__results-list">
                  {results.map((item, index) => {
                    const badge = getFileTypeBadge(item)
                    const isSelected = selectedItem && getDocumentId(item) === getDocumentId(selectedItem)

                    return (
                      <button
                        key={getDocumentId(item) || index}
                        type="button"
                        className={`doc-search-item ${isSelected ? 'doc-search-item--selected' : ''}`}
                        onClick={() => handleSelectItem(item)}
                        title={filenameMode === 'display' ? `원본: ${getFileName(item)}` : (SearchService.getDisplayName(item) ? `별칭: ${SearchService.getDisplayName(item)}` : '')}
                      >
                        <span className={`doc-search-item__badge ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="doc-search-item__name">
                          {filenameMode === 'display' ? getShowName(item) : getFileName(item)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 🍎 리사이즈 핸들 */}
        <div
          className="doc-search-resize-handle"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="패널 크기 조절"
        />

        {/* 🍎 오른쪽: 문서 정보 + PDF 미리보기 */}
        <div className="doc-search-right">
          {!selectedItem ? (
            <div className="doc-search-right__empty">
              <SFSymbol
                name="doc.richtext"
                size={SFSymbolSize.LARGE_TITLE}
                weight={SFSymbolWeight.ULTRALIGHT}
              />
              <p>문서를 선택하면<br />상세 정보가 표시됩니다</p>
            </div>
          ) : (
            <>
              {/* 문서 헤더 */}
              <div className="doc-search-right__header">
                <span className={`doc-search-right__badge ${getFileTypeBadge(selectedItem).className}`}>
                  {getFileTypeBadge(selectedItem).label}
                </span>
                <div className="doc-search-right__title" title={filenameMode === 'display' ? `원본: ${getFileName(selectedItem)}` : (SearchService.getDisplayName(selectedItem) ? `별칭: ${SearchService.getDisplayName(selectedItem)}` : '')}>
                  {filenameMode === 'display' ? getShowName(selectedItem) : getFileName(selectedItem)}
                </div>
                {getFileUrl(selectedItem) && (
                  <a
                    href={getFileUrl(selectedItem) || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="doc-search-right__open-btn"
                  >
                    <SFSymbol
                      name="arrow.up.right.square"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                    <span>열기</span>
                  </a>
                )}
              </div>

              {/* 🍎 탭 형식 요약/검색어 위치 */}
              <div className={`doc-search-right__info${(previewUrl && previewType) ? ' doc-search-right__info--with-preview' : ''}`}>
                {/* 탭 헤더 */}
                <div className="doc-search-right__tabs">
                  <button
                    type="button"
                    className={`doc-search-right__tab${infoTab === 'summary' ? ' doc-search-right__tab--active' : ''}`}
                    onClick={() => setInfoTab('summary')}
                  >
                    요약
                  </button>
                  <button
                    type="button"
                    className={`doc-search-right__tab${infoTab === 'snippet' ? ' doc-search-right__tab--active' : ''}`}
                    onClick={() => setInfoTab('snippet')}
                  >
                    검색어 위치
                  </button>
                </div>

                {/* 탭 콘텐츠 */}
                <div className="doc-search-right__tab-content">
                  {infoTab === 'summary' ? (
                    <p className="doc-search-right__text">{getSummary(selectedItem)}</p>
                  ) : (
                    <p className="doc-search-right__text">{highlightKeywords(getTextSnippet(selectedItem))}</p>
                  )}
                </div>
              </div>

              {/* 🍎 문서 미리보기 (PDF/이미지/변환된 PDF) */}
              {isLoadingPreview && (
                <div className="doc-search-right__preview doc-search-right__preview--loading">
                  <SFSymbol
                    name="arrow.trianglehead.2.clockwise"
                    size={SFSymbolSize.TITLE_2}
                    animation={SFSymbolAnimation.ROTATE}
                  />
                  <span>프리뷰 로딩 중...</span>
                </div>
              )}
              {!isLoadingPreview && previewUrl && previewType === 'pdf' && (
                <div className="doc-search-right__preview">
                  <iframe
                    src={previewUrl}
                    className="doc-search-right__preview-iframe"
                    title={getFileName(selectedItem)}
                  />
                </div>
              )}
              {!isLoadingPreview && previewUrl && previewType === 'image' && (
                <div className="doc-search-right__preview doc-search-right__preview--image">
                  <img
                    src={previewUrl}
                    alt={getFileName(selectedItem)}
                    className="doc-search-right__preview-image"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </DraggableModal>
  )
}

export default DocumentContentSearchModal
