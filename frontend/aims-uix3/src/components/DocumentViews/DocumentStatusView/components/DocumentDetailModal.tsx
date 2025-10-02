/**
 * DocumentDetailModal Component
 * @since 1.0.0
 *
 * 문서 상세 정보를 표시하는 모달 컴포넌트
 * 🍎 Apple/iOS 디자인 시스템 적용
 */

import React, { useState } from 'react'
import { Document } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/documentStatusService'
import './DocumentDetailModal.css'

interface DocumentDetailModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 선택된 문서 */
  document: Document | null
}

type CopiedState = {
  [key: string]: boolean
}

/**
 * DocumentDetailModal React 컴포넌트
 *
 * 문서의 상세 정보를 탭 형식으로 표시하는 모달
 * - Processing Progress: 처리 진행 상태
 * - Document Info: 문서 정보 (복사 기능)
 * - Raw Data: 원본 JSON 데이터
 *
 * @example
 * ```tsx
 * <DocumentDetailModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   document={selectedDocument}
 * />
 * ```
 */
export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  visible,
  onClose,
  document
}) => {
  const [activeTab, setActiveTab] = useState<'progress' | 'info' | 'raw'>('progress')
  const [copied, setCopied] = useState<CopiedState>({})

  if (!visible || !document) return null

  const filename = DocumentStatusService.extractFilename(document)
  const saveName = DocumentStatusService.extractSaveName(document)
  const status = DocumentStatusService.extractStatus(document)
  const progress = DocumentStatusService.extractProgress(document)

  /**
   * 클립보드 복사 핸들러
   * 복사 성공 시 2초간 체크마크 표시
   */
  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied((prev) => ({ ...prev, [key]: true }))
      setTimeout(() => {
        setCopied((prev) => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error('클립보드 복사 실패:', err)
    }
  }

  /**
   * 모달 외부 클릭 핸들러
   */
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="document-detail-modal-overlay" onClick={handleBackdropClick}>
      <div className="document-detail-modal" role="dialog" aria-modal="true">
        {/* 모달 헤더 */}
        <div className="modal-header">
          <div className="header-content">
            <div className="file-icon">📄</div>
            <div className="file-info">
              <h2 className="file-name">{filename}</h2>
              {saveName && <p className="server-name">Server: {saveName}</p>}
              <div className="status-container">
                <span className={`status-badge status-${status}`}>
                  {status === 'processing' && <span className="status-icon">⟳</span>}
                  {status === 'completed' && <span className="status-icon">✓</span>}
                  {status === 'error' && <span className="status-icon">✕</span>}
                  {status === 'pending' && <span className="status-icon">⋯</span>}
                  {status}
                </span>
              </div>
            </div>
            <button
              className="close-button"
              onClick={onClose}
              aria-label="모달 닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
            aria-pressed={activeTab === 'progress'}
          >
            처리 진행
          </button>
          <button
            className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
            aria-pressed={activeTab === 'info'}
          >
            문서 정보
          </button>
          <button
            className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTab('raw')}
            aria-pressed={activeTab === 'raw'}
          >
            원본 데이터
          </button>
        </div>

        {/* 모달 컨텐츠 */}
        <div className="modal-content">
          {/* 처리 진행 탭 */}
          {activeTab === 'progress' && (
            <div className="tab-content">
              <h3 className="section-title">처리 진행 상태</h3>

              {/* 진행률 바 */}
              <div className="progress-bar-wrapper">
                <div
                  className={`progress-bar-fill status-${status}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* 진행 정보 */}
              <div className="progress-info-grid">
                <div className="info-item">
                  <span className="info-label">진행률</span>
                  <span className="info-value">{progress}%</span>
                </div>
                <div className="info-item">
                  <span className="info-label">상태</span>
                  <span className="info-value">{status}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">파일명</span>
                  <span className="info-value" style={{ wordBreak: 'break-all' }}>
                    {filename}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 문서 정보 탭 */}
          {activeTab === 'info' && (
            <div className="tab-content">
              <div className="info-list">
                <div className="info-row">
                  <span className="row-label">Document ID</span>
                  <div className="row-value">
                    <code className="code-text">{document._id || document['id']}</code>
                    <button
                      className={`copy-button ${copied['id'] ? 'copied' : ''}`}
                      onClick={() => handleCopy(document._id || document['id'] || '', 'id')}
                      aria-label="ID 복사"
                    >
                      {copied['id'] ? '✓' : '📋'}
                    </button>
                  </div>
                </div>

                <div className="info-row">
                  <span className="row-label">파일명</span>
                  <div className="row-value">
                    <span className="text-value">{filename}</span>
                    <button
                      className={`copy-button ${copied['filename'] ? 'copied' : ''}`}
                      onClick={() => handleCopy(filename, 'filename')}
                      aria-label="파일명 복사"
                    >
                      {copied['filename'] ? '✓' : '📋'}
                    </button>
                  </div>
                </div>

                {saveName && (
                  <div className="info-row">
                    <span className="row-label">서버 파일명</span>
                    <div className="row-value">
                      <code className="code-text">{saveName}</code>
                      <button
                        className={`copy-button ${copied['saveName'] ? 'copied' : ''}`}
                        onClick={() => handleCopy(saveName, 'saveName')}
                        aria-label="서버 파일명 복사"
                      >
                        {copied['saveName'] ? '✓' : '📋'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 원본 데이터 탭 */}
          {activeTab === 'raw' && (
            <div className="tab-content">
              <div className="raw-data-container">
                <pre className="raw-data-pre">
                  {JSON.stringify(document, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="modal-footer">
          <button className="footer-button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default DocumentDetailModal
