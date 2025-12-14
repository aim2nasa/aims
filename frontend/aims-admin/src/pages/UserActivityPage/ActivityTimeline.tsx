/**
 * Activity Timeline Component
 * 사용자 활동 로그 타임라인 (테이블 형식)
 * @since 2025-12-14
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  userActivityApi,
  formatDateTime,
  type ActivityLog,
} from '@/features/users/userActivityApi';
import './ActivityTimeline.css';

interface ActivityTimelineProps {
  userId: string;
}

// 카테고리 라벨
const CATEGORY_LABELS: Record<string, string> = {
  auth: '인증',
  customer: '고객',
  document: '문서',
  contract: '계약',
  ai: 'AI',
  annual_report: '보고서',
  relationship: '관계',
  file: '파일',
};

// 액션 타입 라벨
const ACTION_TYPE_LABELS: Record<string, string> = {
  create: '등록',
  update: '수정',
  delete: '삭제',
  upload: '업로드',
  download: '다운로드',
  search: '검색',
  login: '로그인',
  logout: '로그아웃',
  bulk_create: '일괄등록',
  bulk_delete: '일괄삭제',
  restore: '복원',
  retry: '재처리',
  parse: '파싱',
};

// 시간 포맷 (HH:mm:ss)
const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

// 날짜 포맷 (MM.DD)
const formatShortDate = (dateString: string): string => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = date.toISOString().split('T')[0];
  const todayOnly = today.toISOString().split('T')[0];
  const yesterdayOnly = yesterday.toISOString().split('T')[0];

  if (dateOnly === todayOnly) return '오늘';
  if (dateOnly === yesterdayOnly) return '어제';

  return `${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
};

export const ActivityTimeline = ({ userId }: ActivityTimelineProps) => {
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [successFilter, setSuccessFilter] = useState<string>('');
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'activity-logs', userId, page, categoryFilter, successFilter],
    queryFn: () =>
      userActivityApi.getUserActivityLogs(userId, {
        page,
        limit,
        category: categoryFilter || undefined,
        success: successFilter === '' ? undefined : successFilter === 'true',
      }),
    enabled: !!userId,
  });

  if (isLoading) {
    return <div className="activity-timeline__loading">활동 로그 로딩 중...</div>;
  }

  if (isError) {
    return <div className="activity-timeline__error">활동 로그를 불러올 수 없습니다.</div>;
  }

  const logs = data?.logs || [];
  const pagination = data?.pagination;
  const summary = data?.summary;

  return (
    <div className="activity-timeline">
      {/* 요약 */}
      {summary && (
        <div className="activity-timeline__summary">
          <div className="summary-stat">
            <span className="summary-stat__value">{summary.total}</span>
            <span className="summary-stat__label">전체</span>
          </div>
          <div className="summary-stat summary-stat--success">
            <span className="summary-stat__value">{summary.success}</span>
            <span className="summary-stat__label">성공</span>
          </div>
          <div className="summary-stat summary-stat--failure">
            <span className="summary-stat__value">{summary.failure}</span>
            <span className="summary-stat__label">실패</span>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="activity-timeline__filters">
        <select
          className="activity-timeline__filter"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">모든 카테고리</option>
          <option value="auth">인증</option>
          <option value="customer">고객</option>
          <option value="document">문서</option>
          <option value="contract">계약</option>
        </select>
        <select
          className="activity-timeline__filter"
          value={successFilter}
          onChange={(e) => {
            setSuccessFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">모든 결과</option>
          <option value="true">성공</option>
          <option value="false">실패</option>
        </select>
      </div>

      {/* 테이블 */}
      {logs.length === 0 ? (
        <div className="activity-timeline__empty">활동 로그가 없습니다.</div>
      ) : (
        <div className="activity-log-table">
          <div className="activity-log-table__header">
            <span className="activity-log-table__col activity-log-table__col--date">날짜</span>
            <span className="activity-log-table__col activity-log-table__col--time">시간</span>
            <span className="activity-log-table__col activity-log-table__col--category">분류</span>
            <span className="activity-log-table__col activity-log-table__col--action">액션</span>
            <span className="activity-log-table__col activity-log-table__col--target">대상</span>
            <span className="activity-log-table__col activity-log-table__col--result">결과</span>
          </div>
          {logs.map((log) => {
            const category = log.action.category || 'file';
            const categoryLabel = CATEGORY_LABELS[category] || category;
            const actionLabel = ACTION_TYPE_LABELS[log.action.type] || log.action.type;
            const isSuccess = log.result.success;
            const bulkCount = log.action.bulk_count;

            // 대상명: 문서 카테고리면 "문서명 (고객명)", 그 외는 entity_name
            const entityName = log.action.target?.entity_name;
            const parentName = log.action.target?.parent_name;
            const entityId = log.action.target?.entity_id;

            let targetName = '-';
            if (category === 'document') {
              // 문서 카테고리: 문서명 (고객명)
              if (entityName) {
                targetName = parentName ? `${entityName} (${parentName})` : entityName;
              } else if (entityId) {
                targetName = parentName ? `ID:${entityId.slice(-6)} (${parentName})` : `ID:${entityId.slice(-6)}`;
              }
            } else {
              // 다른 카테고리: entity_name 또는 parent_name
              targetName = entityName || parentName || (entityId ? `ID:${entityId.slice(-6)}` : '-');
            }

            return (
              <div
                key={log._id}
                className={`activity-log-table__row ${!isSuccess ? 'activity-log-table__row--error' : ''}`}
                title={formatDateTime(log.timestamp)}
              >
                <span className="activity-log-table__col activity-log-table__col--date">
                  {formatShortDate(log.timestamp)}
                </span>
                <span className="activity-log-table__col activity-log-table__col--time">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`activity-log-table__col activity-log-table__col--category activity-log-table__category--${category}`}>
                  {categoryLabel}
                </span>
                <span className="activity-log-table__col activity-log-table__col--action">
                  {actionLabel}
                  {bulkCount && bulkCount > 1 && (
                    <span className="activity-log-table__bulk">x{bulkCount}</span>
                  )}
                </span>
                <span className="activity-log-table__col activity-log-table__col--target" title={targetName}>
                  {targetName}
                </span>
                <span className={`activity-log-table__col activity-log-table__col--result ${isSuccess ? 'activity-log-table__result--success' : 'activity-log-table__result--error'}`}>
                  {isSuccess ? '성공' : '실패'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="activity-timeline__pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            이전
          </button>
          <span className="pagination-info">
            {page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            className="pagination-btn"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
};
