/**
 * AIMS UIX-3 Document Content Search Modal
 * @since 2025-12-09
 *
 * 🍎 문서 내용 검색 모달 컴포넌트
 * - 고객의 문서 내용(OCR 텍스트) 키워드 검색
 * - AND 모드 기본, 검색어 하이라이트 표시
 * - 검색 결과에서 문서 뷰어로 바로 이동
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import Modal from '@/shared/ui/Modal'
import { SearchService } from '@/services/searchService'
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
  /** 문서 뷰어 열기 핸들러 */
  onOpenDocument?: (documentId: string) => void
}

export const DocumentContentSearchModal: React.FC<DocumentContentSearchModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  onOpenDocument
}) => {
  // 🍎 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // 🍎 검색 입력 ref
  const inputRef = useRef<HTMLInputElement>(null)

  // 🍎 모달 열릴 때 입력창 포커스
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // 🍎 모달 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setResults([])
      setError(null)
      setHasSearched(false)
    }
  }, [isOpen])

  // 🍎 검색 실행
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError('검색어를 입력해 주세요.')
      return
    }

    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const response = await SearchService.searchDocuments({
        query: searchQuery.trim(),
        search_mode: 'keyword',
        mode: 'AND',
        customer_id: customerId
      })

      setResults(response.search_results || [])
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

  // 🍎 텍스트 스니펫 추출 (검색어 하이라이트)
  const getTextSnippet = (item: SearchResultItem): string => {
    const fullText = (item as any).ocr?.full_text ||
                     (item as any).meta?.full_text ||
                     (item as any).text?.full_text ||
                     ''

    if (!fullText) return '텍스트를 찾을 수 없습니다.'

    // 검색어 위치 찾기
    const keywords = searchQuery.trim().toLowerCase().split(/\s+/)
    let bestIndex = 0
    let bestScore = -1

    // 가장 많은 키워드가 포함된 위치 찾기
    for (let i = 0; i < fullText.length - 100; i += 50) {
      const chunk = fullText.substring(i, i + 200).toLowerCase()
      const score = keywords.filter(kw => chunk.includes(kw)).length
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    // 스니펫 추출 (최대 150자)
    const start = Math.max(0, bestIndex - 20)
    const end = Math.min(fullText.length, start + 150)
    let snippet = fullText.substring(start, end)

    // 앞뒤 말줄임
    if (start > 0) snippet = '...' + snippet
    if (end < fullText.length) snippet = snippet + '...'

    return snippet
  }

  // 🍎 검색어 하이라이트
  const highlightKeywords = (text: string): React.ReactNode => {
    if (!searchQuery.trim()) return text

    const keywords = searchQuery.trim().split(/\s+/)
    const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, index) => {
      const isMatch = keywords.some(kw => part.toLowerCase() === kw.toLowerCase())
      return isMatch ? (
        <mark key={index} className="doc-search-highlight">{part}</mark>
      ) : (
        <span key={index}>{part}</span>
      )
    })
  }

  // 🍎 문서 열기
  const handleOpenDocument = useCallback((docId: string) => {
    if (onOpenDocument) {
      onOpenDocument(docId)
      onClose()
    }
  }, [onOpenDocument, onClose])

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      size="lg"
      showHeader={false}
      backdropClosable={true}
      className="doc-content-search-modal"
    >
      {/* 🍎 Header */}
      <div className="doc-content-search-modal__header">
        <h2 className="doc-content-search-modal__title">
          <SFSymbol
            name="doc.text.magnifyingglass"
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>문서 내용 검색</span>
        </h2>
        <button
          className="doc-content-search-modal__close"
          onClick={onClose}
          aria-label="닫기"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* 🍎 고객 정보 */}
      <div className="doc-content-search-modal__customer-info">
        <span className="doc-content-search-modal__customer-label">검색 대상:</span>
        <span className="doc-content-search-modal__customer-name">{customerName}</span>
        <span className="doc-content-search-modal__customer-badge">자동 선택</span>
      </div>

      {/* 🍎 검색 입력 */}
      <div className="doc-content-search-modal__search-bar">
        <div className="doc-content-search-modal__search-input-wrapper">
          <SFSymbol
            name="magnifyingglass"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
            className="doc-content-search-modal__search-icon"
          />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색어 입력 (예: 보험료, 갱신)"
            className="doc-content-search-modal__search-input"
            disabled={isLoading}
          />
          {searchQuery && (
            <button
              type="button"
              className="doc-content-search-modal__search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="검색어 지우기"
            >
              <SFSymbol
                name="xmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.REGULAR}
              />
            </button>
          )}
        </div>
        <button
          type="button"
          className="doc-content-search-modal__search-btn"
          onClick={() => void handleSearch()}
          disabled={isLoading || !searchQuery.trim()}
        >
          {isLoading ? (
            <SFSymbol
              name="arrow.clockwise"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              animation={SFSymbolAnimation.ROTATE}
            />
          ) : '검색'}
        </button>
      </div>

      {/* 🍎 검색 옵션 안내 */}
      <div className="doc-content-search-modal__options">
        <span className="doc-content-search-modal__option-badge">AND 검색</span>
        <span className="doc-content-search-modal__option-hint">모든 키워드가 포함된 문서를 검색합니다</span>
      </div>

      {/* 🍎 Content */}
      <div className="doc-content-search-modal__content">
        {/* 에러 표시 */}
        {error && (
          <div className="doc-content-search-modal__error">
            <SFSymbol
              name="exclamationmark.triangle.fill"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>{error}</span>
          </div>
        )}

        {/* 로딩 표시 */}
        {isLoading && (
          <div className="doc-content-search-modal__loading">
            <SFSymbol
              name="arrow.clockwise"
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.MEDIUM}
              animation={SFSymbolAnimation.ROTATE}
            />
            <span>문서를 검색하는 중...</span>
          </div>
        )}

        {/* 초기 상태 */}
        {!isLoading && !hasSearched && !error && (
          <div className="doc-content-search-modal__initial">
            <SFSymbol
              name="doc.text.magnifyingglass"
              size={SFSymbolSize.LARGE_TITLE}
              weight={SFSymbolWeight.LIGHT}
              className="doc-content-search-modal__initial-icon"
            />
            <p className="doc-content-search-modal__initial-text">
              검색어를 입력하고 Enter를 누르세요
            </p>
            <p className="doc-content-search-modal__initial-hint">
              문서 내용(OCR 텍스트)에서 키워드를 검색합니다
            </p>
          </div>
        )}

        {/* 검색 결과 없음 */}
        {!isLoading && hasSearched && !error && results.length === 0 && (
          <div className="doc-content-search-modal__empty">
            <SFSymbol
              name="doc.text"
              size={SFSymbolSize.TITLE_1}
              weight={SFSymbolWeight.LIGHT}
            />
            <span>검색 결과가 없습니다</span>
            <p className="doc-content-search-modal__empty-hint">
              다른 검색어로 시도해 보세요
            </p>
          </div>
        )}

        {/* 검색 결과 목록 */}
        {!isLoading && results.length > 0 && (
          <>
            <div className="doc-content-search-modal__results-header">
              검색 결과 <strong>{results.length}건</strong>
            </div>
            <div className="doc-content-search-modal__results">
              {results.map((item, index) => (
                <div key={getDocumentId(item) || index} className="doc-search-result-item">
                  <div className="doc-search-result-item__header">
                    <div className="doc-search-result-item__icon">
                      <SFSymbol
                        name="doc.fill"
                        size={SFSymbolSize.BODY}
                        weight={SFSymbolWeight.MEDIUM}
                      />
                    </div>
                    <span className="doc-search-result-item__filename">
                      {getFileName(item)}
                    </span>
                  </div>
                  <div className="doc-search-result-item__snippet">
                    {highlightKeywords(getTextSnippet(item))}
                  </div>
                  <div className="doc-search-result-item__actions">
                    {onOpenDocument && (
                      <button
                        type="button"
                        className="doc-search-result-item__action-btn"
                        onClick={() => handleOpenDocument(getDocumentId(item))}
                      >
                        <SFSymbol
                          name="eye"
                          size={SFSymbolSize.CAPTION_1}
                          weight={SFSymbolWeight.MEDIUM}
                        />
                        <span>문서 보기</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default DocumentContentSearchModal
