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
import { resolveFileUrl } from '../../../../utils/documentTransformers'
import type { SearchResultItem } from '@/entities/search'
import SFSymbol, { SFSymbolSize, SFSymbolWeight, SFSymbolAnimation } from '../../../../components/SFSymbol'
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
  /** 초기 검색어 (간편 문서검색에서 전달) */
  initialQuery?: string
}

export const DocumentContentSearchModal: React.FC<DocumentContentSearchModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
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

  // 🍎 검색 입력 ref
  const inputRef = useRef<HTMLInputElement>(null)
  // 🍎 자동 검색 플래그 (초기 검색어로 자동 검색 여부)
  const shouldAutoSearch = useRef(false)

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
      shouldAutoSearch.current = false
    }
  }, [isOpen])

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

        try {
          const response = await SearchService.searchDocuments({
            query: searchQuery.trim(),
            search_mode: 'keyword',
            mode: 'AND',
            customer_id: customerId
          })

          setResults(response.search_results || [])
          if (response.search_results && response.search_results.length > 0) {
            setSelectedItem(response.search_results[0])
          }
        } catch (err) {
          console.error('[DocumentContentSearchModal] 자동 검색 실패:', err)
          setError('검색 중 오류가 발생했습니다. 다시 시도해 주세요.')
          setResults([])
        } finally {
          setIsLoading(false)
        }
      }
      void autoSearch()
    }
  }, [searchQuery, isOpen, customerId])

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
        setSelectedItem(response.search_results[0])
      }
    } catch (err) {
      console.error('[DocumentContentSearchModal] 검색 실패:', err)
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

  // 🍎 파일명 추출
  const getFileName = (item: SearchResultItem): string => {
    return SearchService.getOriginalName(item) || '이름 없음'
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

  // 🍎 파일 URL 생성 (tars.giize.com/files/...)
  const getFileUrl = (item: SearchResultItem): string | null => {
    const filePath = SearchService.getFilePath(item)
    if (!filePath) return null
    return resolveFileUrl(filePath) || null
  }

  // 🍎 PDF 여부 확인
  const isPdf = (item: SearchResultItem): boolean => {
    const mimeType = getMimeType(item)
    const fileName = getFileName(item).toLowerCase()
    return mimeType.includes('pdf') || fileName.endsWith('.pdf')
  }

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
      <span className="doc-search-modal-title__customer">{customerName}</span>
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
      {/* 🍎 2-Pane 레이아웃 */}
      <div className="doc-search-split">
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
                  {results.length}건
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
                        onClick={() => setSelectedItem(item)}
                      >
                        <span className={`doc-search-item__badge ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="doc-search-item__name">
                          {getFileName(item)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 🍎 오른쪽: 문서 정보 + PDF 미리보기 */}
        <div className="doc-search-right">
          {!selectedItem ? (
            <div className="doc-search-right__empty">
              <SFSymbol
                name="doc.richtext"
                size={SFSymbolSize.LARGETITLE}
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
                <div className="doc-search-right__title">
                  {getFileName(selectedItem)}
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
              <div className={`doc-search-right__info${isPdf(selectedItem) ? ' doc-search-right__info--with-preview' : ''}`}>
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

              {/* PDF 미리보기 */}
              {isPdf(selectedItem) && getFileUrl(selectedItem) && (
                <div className="doc-search-right__preview">
                  <iframe
                    src={getFileUrl(selectedItem) || ''}
                    className="doc-search-right__preview-iframe"
                    title={getFileName(selectedItem)}
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
