/**
 * User Detail Panel
 * 사용자 상세 활동 패널
 * @since 2025-12-14
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  userActivityApi,
  formatBytes,
  formatTokens,
  formatCredits,
  formatCost,
  formatDateTime,
  formatRelativeTime,
  type UserError,
} from '@/features/users/userActivityApi';

// AI 소스 표시명
const AI_SOURCE_LABELS: Record<string, string> = {
  chat: '채팅',
  embed: '임베딩',
  rag: 'RAG 검색',
  summary: '요약',
  unknown: '기타',
};
import { Button } from '@/shared/ui/Button/Button';
import { ActivityTimeline } from './ActivityTimeline';
import './UserActivityPage.css';

interface UserDetailPanelProps {
  userId: string;
  onClose: () => void;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  ocr_failed: 'OCR 실패',
  embed_failed: '임베딩 실패',
  processing_failed: '처리 실패',
  unknown: '알 수 없음',
};

const TIER_LABELS: Record<string, string> = {
  free_trial: '무료체험',
  standard: '일반',
  premium: '프리미엄',
  vip: 'VIP',
  admin: '관리자',
};

type TabType = 'summary' | 'logs' | 'errors' | 'documents';

// 정렬 타입
type ErrorSortKey = 'occurred_at' | 'type' | 'document_name';
type DocSortKey = 'embed_completed_at' | 'document_name' | 'status' | 'ocr_status' | 'embed_status';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 30, 50];
const STORAGE_KEY_ERROR_PAGE_SIZE = 'userDetail_errorPageSize';
const STORAGE_KEY_DOC_PAGE_SIZE = 'userDetail_docPageSize';

const getStoredErrorPageSize = (): number => {
  const stored = localStorage.getItem(STORAGE_KEY_ERROR_PAGE_SIZE);
  return stored ? Number(stored) : 10;
};

const getStoredDocPageSize = (): number => {
  const stored = localStorage.getItem(STORAGE_KEY_DOC_PAGE_SIZE);
  return stored ? Number(stored) : 10;
};

export const UserDetailPanel = ({ userId, onClose }: UserDetailPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('summary');

  // 오류 목록 정렬 및 페이지네이션
  const [errorSortKey, setErrorSortKey] = useState<ErrorSortKey>('occurred_at');
  const [errorSortOrder, setErrorSortOrder] = useState<SortOrder>('desc');
  const [errorPage, setErrorPage] = useState(1);
  const [errorPageSize, setErrorPageSize] = useState(getStoredErrorPageSize);

  // 최근 문서 정렬 및 페이지네이션
  const [docSortKey, setDocSortKey] = useState<DocSortKey>('embed_completed_at');
  const [docSortOrder, setDocSortOrder] = useState<SortOrder>('desc');
  const [docPage, setDocPage] = useState(1);
  const [docPageSize, setDocPageSize] = useState(getStoredDocPageSize);

  const {
    data: detailData,
    isLoading: detailLoading,
    isError: detailError,
  } = useQuery({
    queryKey: ['admin', 'user-activity', 'detail', userId],
    queryFn: () => userActivityApi.getDetail(userId),
    enabled: !!userId,
  });

  const {
    data: errorsData,
    isLoading: errorsLoading,
  } = useQuery({
    queryKey: ['admin', 'user-activity', 'errors', userId],
    queryFn: () => userActivityApi.getErrors(userId, 7),
    enabled: !!userId && activeTab === 'errors',
  });

  // userId 변경 시 페이지 리셋
  useEffect(() => {
    setErrorPage(1);
    setDocPage(1);
  }, [userId]);

  if (detailLoading) {
    return (
      <div className="user-detail-panel">
        <div className="user-detail-panel__header">
          <span className="user-detail-panel__title">사용자 상세</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div className="user-detail-panel__loading">로딩 중...</div>
      </div>
    );
  }

  if (detailError || !detailData) {
    return (
      <div className="user-detail-panel">
        <div className="user-detail-panel__header">
          <span className="user-detail-panel__title">사용자 상세</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div className="user-detail-panel__error">상세 정보를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const { user, activity_summary, recent_activity } = detailData;

  const renderSummaryTab = () => (
    <div className="user-detail-panel__summary">
      {/* 사용자 정보 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">기본 정보</h4>
        <div className="user-detail-panel__info-grid">
          <div className="info-item">
            <span className="info-label">이름</span>
            <span className="info-value">{user.name}</span>
          </div>
          <div className="info-item">
            <span className="info-label">이메일</span>
            <span className="info-value">{user.email}</span>
          </div>
          <div className="info-item">
            <span className="info-label">등급</span>
            <span className="info-value">{TIER_LABELS[user.tier] || user.tier}</span>
          </div>
          <div className="info-item">
            <span className="info-label">가입일</span>
            <span className="info-value">{formatDateTime(user.created_at)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">최근 로그인</span>
            <span className="info-value">{formatRelativeTime(user.last_login)}</span>
          </div>
        </div>
      </div>

      {/* 문서 통계 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">문서</h4>
        <div className="user-detail-panel__stats-grid">
          <div className="stat-item">
            <span className="stat-value">{activity_summary.documents.total}</span>
            <span className="stat-label">전체</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{activity_summary.documents.this_month}</span>
            <span className="stat-label">이번달</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{activity_summary.documents.by_status?.completed || 0}</span>
            <span className="stat-label">완료</span>
          </div>
          <div className="stat-item stat-item--error">
            <span className="stat-value">{activity_summary.documents.by_status?.error || 0}</span>
            <span className="stat-label">오류</span>
          </div>
        </div>
      </div>

      {/* 고객 통계 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">고객</h4>
        <div className="user-detail-panel__stats-grid">
          <div className="stat-item">
            <span className="stat-value">{activity_summary.customers.total}</span>
            <span className="stat-label">전체</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{activity_summary.customers.active}</span>
            <span className="stat-label">활성</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{activity_summary.customers.dormant}</span>
            <span className="stat-label">휴면</span>
          </div>
        </div>
      </div>

      {/* AI 사용량 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">AI 사용량 (30일) - 소스별</h4>
        <div className="user-detail-panel__stats-grid">
          <div className="stat-item stat-item--primary">
            <span className="stat-value">{formatTokens(activity_summary.ai_usage.total_tokens)}</span>
            <span className="stat-label">총 토큰</span>
          </div>
          {Object.entries(activity_summary.ai_usage.by_source || {}).map(([source, tokens]) => (
            <div key={source} className="stat-item">
              <span className="stat-value">{formatTokens(tokens as number)}</span>
              <span className="stat-label">{AI_SOURCE_LABELS[source] || source}</span>
            </div>
          ))}
        </div>
        {/* AI 소스별 상세 테이블 */}
        {Object.keys(activity_summary.ai_usage.by_source || {}).length > 0 && (
          <div className="user-detail-panel__source-table">
            <table className="source-detail-table">
              <thead>
                <tr>
                  <th>소스</th>
                  <th>토큰</th>
                  <th>비율</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(activity_summary.ai_usage.by_source || {}).map(([source, tokens]) => {
                  const tokenNum = tokens as number;
                  const percent = activity_summary.ai_usage.total_tokens > 0
                    ? Math.round((tokenNum / activity_summary.ai_usage.total_tokens) * 100)
                    : 0;
                  return (
                    <tr key={source}>
                      <td>{AI_SOURCE_LABELS[source] || source}</td>
                      <td className="text-right">{formatTokens(tokenNum)}</td>
                      <td className="text-right">{percent}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OCR 사용량 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">OCR 사용량</h4>
        <div className="user-detail-panel__stats-grid">
          <div
            className="stat-item"
            title={`${activity_summary.ocr_usage.total_pages}페이지/${activity_summary.ocr_usage.total}문서`}
          >
            <span className="stat-value">{activity_summary.ocr_usage.total_pages}/{activity_summary.ocr_usage.total}</span>
            <span className="stat-label">전체</span>
          </div>
          <div
            className="stat-item"
            title={`${activity_summary.ocr_usage.this_month_pages}페이지/${activity_summary.ocr_usage.this_month}문서`}
          >
            <span className="stat-value">{activity_summary.ocr_usage.this_month_pages}/{activity_summary.ocr_usage.this_month}</span>
            <span className="stat-label">이번달</span>
          </div>
        </div>
      </div>

      {/* 스토리지 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">스토리지</h4>
        <div className="user-detail-panel__storage">
          <span className="storage-text">
            {formatBytes(user.storage?.used_bytes || 0)} /{' '}
            {(user.storage?.quota_bytes || 0) < 0
              ? '무제한'
              : formatBytes(user.storage?.quota_bytes || 0)}
          </span>
          {(user.storage?.quota_bytes || 0) > 0 && (
            <div className="storage-bar">
              <div
                className="storage-bar__fill"
                style={{ width: `${Math.min(100, user.storage?.usage_percent || 0)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderErrorsTab = () => {
    // 오류 정렬 핸들러
    const handleErrorSort = (key: ErrorSortKey) => {
      if (errorSortKey === key) {
        setErrorSortOrder(errorSortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setErrorSortKey(key);
        setErrorSortOrder('desc');
      }
      setErrorPage(1); // 정렬 변경 시 첫 페이지로
    };

    // 정렬 아이콘
    const getErrorSortIcon = (key: ErrorSortKey) => {
      if (errorSortKey !== key) return '';
      return errorSortOrder === 'asc' ? ' ↑' : ' ↓';
    };

    // 정렬된 오류 목록
    const sortedErrors = [...(errorsData?.errors || [])].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (errorSortKey) {
        case 'occurred_at':
          aValue = new Date(a.occurred_at).getTime();
          bValue = new Date(b.occurred_at).getTime();
          break;
        case 'type':
          aValue = a.type || '';
          bValue = b.type || '';
          break;
        case 'document_name':
          aValue = a.document_name || '';
          bValue = b.document_name || '';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return errorSortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return errorSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // 페이지네이션 계산
    const totalErrors = sortedErrors.length;
    const totalErrorPages = Math.ceil(totalErrors / errorPageSize);
    const errorStartIndex = (errorPage - 1) * errorPageSize;
    const paginatedErrors = sortedErrors.slice(errorStartIndex, errorStartIndex + errorPageSize);

    return (
      <div className="user-detail-panel__errors">
        {errorsLoading ? (
          <div className="user-detail-panel__loading">오류 목록 로딩 중...</div>
        ) : !errorsData?.errors?.length ? (
          <div className="user-detail-panel__empty">최근 7일간 오류가 없습니다.</div>
        ) : (
          <div className="error-table">
            <div className="error-table__header">
              <span
                className="error-table__col error-table__col--datetime error-table__col--sortable"
                onClick={() => handleErrorSort('occurred_at')}
              >
                일시{getErrorSortIcon('occurred_at')}
              </span>
              <span
                className="error-table__col error-table__col--type error-table__col--sortable"
                onClick={() => handleErrorSort('type')}
              >
                유형{getErrorSortIcon('type')}
              </span>
              <span
                className="error-table__col error-table__col--document error-table__col--sortable"
                onClick={() => handleErrorSort('document_name')}
              >
                문서명{getErrorSortIcon('document_name')}
              </span>
              <span className="error-table__col error-table__col--message">
                오류 메시지
              </span>
            </div>
            <div className="error-table__body">
              {paginatedErrors.map((error: UserError, index: number) => (
                <div key={errorStartIndex + index} className="error-table__row">
                  <span className="error-table__col error-table__col--datetime">
                    {formatDateTime(error.occurred_at)}
                  </span>
                  <span className={`error-table__col error-table__col--type error-type--${error.type}`}>
                    {ERROR_TYPE_LABELS[error.type] || error.type}
                  </span>
                  <span className="error-table__col error-table__col--document" title={error.document_name}>
                    {error.document_name}
                  </span>
                  <span className="error-table__col error-table__col--message" title={error.error_message}>
                    {error.error_message}
                  </span>
                </div>
              ))}
            </div>
            {/* 페이지네이션 */}
            <div className="error-table__pagination">
              <select
                className="pagination-size-select"
                value={errorPageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value);
                  setErrorPageSize(newSize);
                  setErrorPage(1);
                  localStorage.setItem(STORAGE_KEY_ERROR_PAGE_SIZE, String(newSize));
                }}
                aria-label="페이지 크기"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}개</option>
                ))}
              </select>
              <button
                type="button"
                className="error-table__pagination-button"
                onClick={() => setErrorPage(p => Math.max(1, p - 1))}
                disabled={errorPage === 1}
              >
                이전
              </button>
              {Array.from({ length: Math.min(5, totalErrorPages || 1) }, (_, i) => {
                let pageNum: number;
                const tp = totalErrorPages || 1;
                if (tp <= 5) {
                  pageNum = i + 1;
                } else if (errorPage <= 3) {
                  pageNum = i + 1;
                } else if (errorPage >= tp - 2) {
                  pageNum = tp - 4 + i;
                } else {
                  pageNum = errorPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`error-table__pagination-button ${errorPage === pageNum ? 'error-table__pagination-button--active' : ''}`}
                    onClick={() => setErrorPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                className="error-table__pagination-button"
                onClick={() => setErrorPage(p => Math.min(totalErrorPages || 1, p + 1))}
                disabled={errorPage === (totalErrorPages || 1)}
              >
                다음
              </button>
              <span className="error-table__pagination-info">
                전체 {totalErrors}건
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLogsTab = () => (
    <div className="user-detail-panel__logs">
      <ActivityTimeline userId={userId} />
    </div>
  );

  const renderDocumentsTab = () => {
    // 문서 정렬 핸들러
    const handleDocSort = (key: DocSortKey) => {
      if (docSortKey === key) {
        setDocSortOrder(docSortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setDocSortKey(key);
        setDocSortOrder('desc');
      }
      setDocPage(1); // 정렬 변경 시 첫 페이지로
    };

    // 정렬 아이콘
    const getDocSortIcon = (key: DocSortKey) => {
      if (docSortKey !== key) return '';
      return docSortOrder === 'asc' ? ' ↑' : ' ↓';
    };

    // 전체 상태 결과
    const getOverallResult = (status: string) => {
      if (status === 'completed') return { label: '성공', color: 'success' };
      if (status === 'error') return { label: '실패', color: 'error' };
      if (status === 'processing') return { label: '처리중', color: 'processing' };
      return { label: '대기', color: 'pending' };
    };

    // 정렬된 문서 목록
    const sortedDocs = [...(recent_activity || [])].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (docSortKey) {
        case 'embed_completed_at':
          aValue = a.embed_completed_at ? new Date(a.embed_completed_at).getTime() : 0;
          bValue = b.embed_completed_at ? new Date(b.embed_completed_at).getTime() : 0;
          break;
        case 'document_name':
          aValue = a.document_name || '';
          bValue = b.document_name || '';
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'ocr_status':
          aValue = a.ocr_status || '';
          bValue = b.ocr_status || '';
          break;
        case 'embed_status':
          aValue = a.embed_status || '';
          bValue = b.embed_status || '';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return docSortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return docSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // 페이지네이션 계산
    const totalDocs = sortedDocs.length;
    const totalDocPages = Math.ceil(totalDocs / docPageSize);
    const docStartIndex = (docPage - 1) * docPageSize;
    const paginatedDocs = sortedDocs.slice(docStartIndex, docStartIndex + docPageSize);

    return (
      <div className="user-detail-panel__documents">
        {!recent_activity?.length ? (
          <div className="user-detail-panel__empty">최근 문서가 없습니다.</div>
        ) : (
          <div className="document-table">
            <div className="document-table__header">
              <span
                className="document-table__col document-table__col--datetime document-table__col--sortable"
                onClick={() => handleDocSort('embed_completed_at')}
              >
                임베딩 일시{getDocSortIcon('embed_completed_at')}
              </span>
              <span
                className="document-table__col document-table__col--name document-table__col--sortable"
                onClick={() => handleDocSort('document_name')}
              >
                문서명{getDocSortIcon('document_name')}
              </span>
              <span
                className="document-table__col document-table__col--result document-table__col--sortable"
                onClick={() => handleDocSort('status')}
              >
                결과{getDocSortIcon('status')}
              </span>
              <span
                className="document-table__col document-table__col--ocr document-table__col--sortable"
                onClick={() => handleDocSort('ocr_status')}
              >
                OCR{getDocSortIcon('ocr_status')}
              </span>
              <span
                className="document-table__col document-table__col--embed document-table__col--sortable"
                onClick={() => handleDocSort('embed_status')}
              >
                임베딩{getDocSortIcon('embed_status')}
              </span>
            </div>
            <div className="document-table__body">
              {paginatedDocs.map((doc, index) => {
                const result = getOverallResult(doc.status);
                const docName = doc.document_name || `문서_${doc.document_id?.slice(-6) || index}`;

                return (
                  <div key={docStartIndex + index} className="document-table__row">
                    <span className="document-table__col document-table__col--datetime">
                      {doc.embed_completed_at ? formatDateTime(doc.embed_completed_at) : '-'}
                    </span>
                    <span className="document-table__col document-table__col--name" title={docName}>
                      {docName}
                    </span>
                    <span className={`document-table__col document-table__col--result document-table__badge--${result.color}`}>
                      {result.label}
                    </span>
                    <span className={`document-table__col document-table__col--ocr document-table__badge--${doc.ocr_status === 'done' ? 'success' : doc.ocr_status === 'failed' ? 'error' : 'neutral'}`}>
                      {doc.ocr_status === 'done' ? '완료' : doc.ocr_status === 'failed' ? '실패' : doc.ocr_status || '-'}
                    </span>
                    <span className={`document-table__col document-table__col--embed document-table__badge--${doc.embed_status === 'done' ? 'success' : doc.embed_status === 'failed' ? 'error' : 'neutral'}`}>
                      {doc.embed_status === 'done' ? '완료' : doc.embed_status === 'failed' ? '실패' : doc.embed_status || '-'}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* 페이지네이션 */}
            <div className="document-table__pagination">
              <select
                className="pagination-size-select"
                value={docPageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value);
                  setDocPageSize(newSize);
                  setDocPage(1);
                  localStorage.setItem(STORAGE_KEY_DOC_PAGE_SIZE, String(newSize));
                }}
                aria-label="페이지 크기"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}개</option>
                ))}
              </select>
              <button
                type="button"
                className="document-table__pagination-button"
                onClick={() => setDocPage(p => Math.max(1, p - 1))}
                disabled={docPage === 1}
              >
                이전
              </button>
              {Array.from({ length: Math.min(5, totalDocPages || 1) }, (_, i) => {
                let pageNum: number;
                const tp = totalDocPages || 1;
                if (tp <= 5) {
                  pageNum = i + 1;
                } else if (docPage <= 3) {
                  pageNum = i + 1;
                } else if (docPage >= tp - 2) {
                  pageNum = tp - 4 + i;
                } else {
                  pageNum = docPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`document-table__pagination-button ${docPage === pageNum ? 'document-table__pagination-button--active' : ''}`}
                    onClick={() => setDocPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                className="document-table__pagination-button"
                onClick={() => setDocPage(p => Math.min(totalDocPages || 1, p + 1))}
                disabled={docPage === (totalDocPages || 1)}
              >
                다음
              </button>
              <span className="document-table__pagination-info">
                전체 {totalDocs}건
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="user-detail-panel">
      <div className="user-detail-panel__header">
        <span className="user-detail-panel__title">
          {user.name} 상세
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>

      <div className="user-detail-panel__tabs">
        <button
          type="button"
          className={`user-detail-panel__tab ${activeTab === 'summary' ? 'user-detail-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          활동 요약
        </button>
        <button
          type="button"
          className={`user-detail-panel__tab ${activeTab === 'logs' ? 'user-detail-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          활동 로그
        </button>
        <button
          type="button"
          className={`user-detail-panel__tab ${activeTab === 'errors' ? 'user-detail-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('errors')}
        >
          오류 목록
          {errorsData?.error_count ? (
            <span className="tab-badge">{errorsData.error_count}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`user-detail-panel__tab ${activeTab === 'documents' ? 'user-detail-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          최근 문서
        </button>
      </div>

      <div className="user-detail-panel__content">
        {activeTab === 'summary' && renderSummaryTab()}
        {activeTab === 'logs' && renderLogsTab()}
        {activeTab === 'errors' && renderErrorsTab()}
        {activeTab === 'documents' && renderDocumentsTab()}
      </div>
    </div>
  );
};
