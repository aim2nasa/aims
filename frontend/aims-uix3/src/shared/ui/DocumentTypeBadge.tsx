/**
 * DocumentTypeBadge - 문서 처리 유형 뱃지 (OCR/TXT/BIN)
 *
 * 모든 뷰에서 동일한 렌더링을 보장하는 공유 컴포넌트.
 * 기준: 전체 문서 보기 (DocumentStatusList)
 *
 * CSS: shared/styles/document-badges.css (이미 공유 스타일 존재)
 */

import React from 'react'
import { Tooltip } from './Tooltip'
import { DocumentUtils, type DocumentTypeInput } from '@/entities/document/model'

interface DocumentTypeBadgeProps {
  document: DocumentTypeInput
  isCreditPending?: boolean
}

export const DocumentTypeBadge: React.FC<DocumentTypeBadgeProps> = ({
  document,
  isCreditPending = false,
}) => {
  const typeLabel = DocumentUtils.getDocumentTypeLabel(document)
  const confidence = DocumentUtils.getOcrConfidence(document)

  // OCR confidence가 있으면 typeLabel에 관계없이 OCR 뱃지 표시 (하위 호환성)
  if (typeLabel === 'OCR' || confidence !== null) {
    if (confidence !== null) {
      const level = DocumentUtils.getOcrConfidenceLevel(confidence)
      return (
        <Tooltip
          content={
            isCreditPending
              ? `OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (크레딧 부족)`
              : `OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`
          }
        >
          <div
            className={`document-ocr-badge ${isCreditPending ? 'badge--disabled' : `ocr-${level.color}`}`}
          >
            OCR
          </div>
        </Tooltip>
      )
    }
    // confidence 없으면 기본 OCR 뱃지
    return (
      <Tooltip content={isCreditPending ? 'OCR 처리 (크레딧 부족)' : 'OCR 처리 완료'}>
        <div
          className={`document-ocr-badge ${isCreditPending ? 'badge--disabled' : 'ocr-medium'}`}
        >
          OCR
        </div>
      </Tooltip>
    )
  }

  if (!typeLabel) return null

  if (typeLabel === 'TXT') {
    return (
      <Tooltip content={isCreditPending ? 'TXT 기반 문서 (크레딧 부족)' : 'TXT 기반 문서'}>
        <div className={`document-txt-badge ${isCreditPending ? 'badge--disabled' : ''}`}>
          TXT
        </div>
      </Tooltip>
    )
  }

  if (typeLabel === 'BIN') {
    return (
      <Tooltip
        content={
          isCreditPending
            ? '바이너리 파일 (크레딧 부족)'
            : '바이너리 파일 (텍스트 추출 불가)'
        }
      >
        <div className={`document-bin-badge ${isCreditPending ? 'badge--disabled' : ''}`}>
          BIN
        </div>
      </Tooltip>
    )
  }

  return null
}
