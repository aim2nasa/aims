/**
 * DocumentStatusStats Component
 * @description 문서 처리 현황 통계 카드 컴포넌트
 * @since 1.0.0
 *
 * 🍎 Apple Design Principles:
 * - Progressive Disclosure: 기본 상태는 서브틀, 호버 시 강조
 * - Clarity: 명확한 정보 전달
 * - Deference: UI가 콘텐츠를 방해하지 않음
 */

import React from 'react'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import { DocumentUtils } from '../../../../entities/document/model'
import type { Document } from '../../../../types/documentStatus'
import './DocumentStatusStats.css'

interface DocumentStatusStatsProps {
  /** 전체 문서 목록 */
  documents: Document[]
  /** 현재 활성화된 필터 */
  activeFilter: 'all' | 'completed' | 'processing' | 'error' | 'pending'
  /** 필터 변경 핸들러 */
  onFilterChange: (filter: 'all' | 'completed' | 'processing' | 'error' | 'pending') => void
}

/**
 * DocumentStatusStats React 컴포넌트
 *
 * 문서 처리 상태별 통계를 표시하는 카드 그리드
 * iOS 스타일의 Progressive Disclosure 패턴 적용
 *
 * @example
 * ```tsx
 * <DocumentStatusStats
 *   documents={documents}
 *   activeFilter="all"
 *   onFilterChange={handleFilterChange}
 * />
 * ```
 */
export const DocumentStatusStats: React.FC<DocumentStatusStatsProps> = ({
  documents,
  activeFilter,
  onFilterChange
}) => {
  // 상태별 통계 계산
  const stats = React.useMemo(() => {
    const counts = {
      all: documents.length,
      completed: 0,
      processing: 0,
      error: 0,
      pending: 0,
      txt: 0,
      ocr: 0,
      bin: 0
    }

    documents.forEach((doc) => {
      const status = DocumentStatusService.extractStatus(doc)
      if (status === 'completed') counts.completed++
      else if (status === 'processing') counts.processing++
      else if (status === 'error') counts.error++
      else if (status === 'pending') counts.pending++

      // badgeType별 카운트 (프론트엔드 SSoT: DocumentUtils.getDocumentTypeLabel)
      const badgeLabel = DocumentUtils.getDocumentTypeLabel(doc)
      if (badgeLabel === 'TXT') counts.txt++
      else if (badgeLabel === 'OCR') counts.ocr++
      else if (badgeLabel === 'BIN') counts.bin++
    })

    return counts
  }, [documents])

  /**
   * 키보드 접근성: Enter 또는 Space 키로 필터 변경
   * COMPONENT_GUIDE.md 라인 674-681 준수
   */
  const handleKeyPress = (
    event: React.KeyboardEvent,
    filterKey: 'all' | 'completed' | 'processing' | 'error' | 'pending'
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onFilterChange(filterKey)
    }
  }

  // 상태 카드 정의
  const statusCards = [
    {
      key: 'all' as const,
      label: '전체',
      count: stats.all,
      icon: '📄',
      className: 'status-card-all'
    },
    {
      key: 'completed' as const,
      label: '완료',
      count: stats.completed,
      icon: '✓',
      className: 'status-card-completed'
    },
    {
      key: 'processing' as const,
      label: '처리중',
      count: stats.processing,
      icon: '⟳',
      className: 'status-card-processing'
    },
    {
      key: 'pending' as const,
      label: '대기',
      count: stats.pending,
      icon: '⏱',
      className: 'status-card-pending'
    },
    {
      key: 'error' as const,
      label: '오류',
      count: stats.error,
      icon: '⚠',
      className: 'status-card-error'
    }
  ]

  // 뱃지 타입 카드 정의
  const badgeTypeCards = [
    {
      label: 'TXT',
      count: stats.txt,
      icon: '📝',
      className: 'badge-card-txt',
      description: 'Meta 텍스트 추출'
    },
    {
      label: 'OCR',
      count: stats.ocr,
      icon: '📷',
      className: 'badge-card-ocr',
      description: 'OCR 텍스트 추출'
    },
    {
      label: 'BIN',
      count: stats.bin,
      icon: '📦',
      className: 'badge-card-bin',
      description: '바이너리 파일'
    }
  ]

  return (
    <div className="document-status-stats-container">
      {/* 문서 상태별 통계 */}
      <div className="document-status-stats" role="group" aria-label="문서 상태별 통계">
        {statusCards.map((card) => (
          <button
            key={card.key}
            className={`status-card ${card.className} ${activeFilter === card.key ? 'status-card--active' : ''} focus-ring`}
            onClick={() => onFilterChange(card.key)}
            onKeyDown={(e) => handleKeyPress(e, card.key)}
            aria-label={`${card.label} 문서 ${card.count}개`}
            aria-pressed={activeFilter === card.key}
            tabIndex={0}
          >
            <div className="status-card-icon" aria-hidden="true">
              {card.icon}
            </div>
            <div className="status-card-content">
              <span className="status-card-label">{card.label}</span>
              <span className="status-card-count">{card.count}</span>
            </div>
          </button>
        ))}
      </div>

      {/* 뱃지 타입별 통계 */}
      <div className="badge-type-stats" role="group" aria-label="파일 타입별 통계">
        {badgeTypeCards.map((card) => (
          <div
            key={card.label}
            className={`badge-type-card ${card.className}`}
            aria-label={`${card.label} 파일 ${card.count}개`}
            title={card.description}
          >
            <div className="badge-type-card-icon" aria-hidden="true">
              {card.icon}
            </div>
            <div className="badge-type-card-content">
              <span className="badge-type-card-label">{card.label}</span>
              <span className="badge-type-card-count">{card.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DocumentStatusStats
