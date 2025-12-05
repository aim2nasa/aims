/**
 * MappingPreview Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 폴더-고객 매핑 미리보기
 */

import { useMemo } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import { formatFileSize } from '../utils/fileValidation'
import type { FolderMapping } from '../types'
import './MappingPreview.css'

interface MappingPreviewProps {
  mappings: FolderMapping[]
  onBack: () => void
  onStartUpload: () => void
}

export default function MappingPreview({
  mappings,
  onBack,
  onStartUpload
}: MappingPreviewProps) {
  const stats = useMemo(() => {
    const matched = mappings.filter(m => m.matched).length
    const unmatched = mappings.length - matched
    const totalFiles = mappings.reduce((sum, m) => sum + m.fileCount, 0)
    const totalSize = mappings.reduce((sum, m) => sum + m.totalSize, 0)

    return { matched, unmatched, totalFiles, totalSize }
  }, [mappings])

  const canUpload = stats.matched > 0

  return (
    <div className="mapping-preview">
      {/* 요약 통계 */}
      <div className="mapping-preview-summary">
        <div className="mapping-preview-stat">
          <span className="mapping-preview-stat-value matched">{stats.matched}</span>
          <span className="mapping-preview-stat-label">매칭됨</span>
        </div>
        <div className="mapping-preview-stat">
          <span className="mapping-preview-stat-value unmatched">{stats.unmatched}</span>
          <span className="mapping-preview-stat-label">미매칭</span>
        </div>
        <div className="mapping-preview-stat">
          <span className="mapping-preview-stat-value">{stats.totalFiles}</span>
          <span className="mapping-preview-stat-label">총 파일</span>
        </div>
        <div className="mapping-preview-stat">
          <span className="mapping-preview-stat-value">{formatFileSize(stats.totalSize)}</span>
          <span className="mapping-preview-stat-label">총 크기</span>
        </div>
      </div>

      {/* 매핑 목록 */}
      <div className="mapping-preview-list">
        <div className="mapping-preview-header">
          <span className="mapping-preview-col-status">상태</span>
          <span className="mapping-preview-col-folder">폴더명</span>
          <span className="mapping-preview-col-customer">고객명</span>
          <span className="mapping-preview-col-files">파일</span>
          <span className="mapping-preview-col-size">크기</span>
        </div>

        <div className="mapping-preview-body">
          {mappings.map((mapping, index) => (
            <div
              key={`${mapping.folderName}-${index}`}
              className={`mapping-preview-row ${mapping.matched ? 'matched' : 'unmatched'}`}
            >
              <span className="mapping-preview-col-status">
                {mapping.matched ? (
                  <span className="mapping-status-icon matched">
                    <SFSymbol
                      name="checkmark-circle-fill"
                      size={SFSymbolSize.FOOTNOTE}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                  </span>
                ) : (
                  <span className="mapping-status-icon unmatched">
                    <SFSymbol
                      name="xmark-circle-fill"
                      size={SFSymbolSize.FOOTNOTE}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                  </span>
                )}
              </span>
              <span className="mapping-preview-col-folder" title={mapping.folderName}>
                {mapping.folderName}
              </span>
              <span className="mapping-preview-col-customer">
                {mapping.matched ? mapping.customerName : (
                  <span className="mapping-no-match">일치하는 고객 없음</span>
                )}
              </span>
              <span className="mapping-preview-col-files">{mapping.fileCount}개</span>
              <span className="mapping-preview-col-size">{formatFileSize(mapping.totalSize)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 안내 메시지 */}
      {stats.unmatched > 0 && (
        <div className="mapping-preview-warning">
          <SFSymbol
            name="exclamationmark-triangle-fill"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>
            미매칭된 {stats.unmatched}개 폴더의 문서는 업로드되지 않습니다.
            고객명과 폴더명이 정확히 일치해야 합니다.
          </span>
        </div>
      )}

      {/* 버튼 영역 */}
      <div className="mapping-preview-actions">
        <Button variant="secondary" onClick={onBack}>
          뒤로
        </Button>
        <Button
          variant="primary"
          onClick={onStartUpload}
          disabled={!canUpload}
        >
          {canUpload
            ? `${stats.matched}개 폴더 업로드 시작`
            : '매칭된 폴더가 없습니다'
          }
        </Button>
      </div>
    </div>
  )
}
