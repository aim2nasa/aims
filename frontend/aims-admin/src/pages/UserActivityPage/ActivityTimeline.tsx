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

// 호출자 라벨 (actor 정보 기반)
const getActorLabel = (actor: { name: string | null; role: string }): string => {
  if (actor.name) return actor.name;
  if (actor.role === 'system') return '시스템';
  return '사용자';
};

type SortKey = 'timestamp' | 'actor' | 'category' | 'target' | 'action' | 'result';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 30, 50];
const STORAGE_KEY_PAGE_SIZE = 'activityTimeline_pageSize';

const getStoredPageSize = (): number => {
  const stored = localStorage.getItem(STORAGE_KEY_PAGE_SIZE);
  return stored ? Number(stored) : 10;
};

export const ActivityTimeline = ({ userId }: ActivityTimelineProps) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [successFilter, setSuccessFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'activity-logs', userId, page, pageSize, categoryFilter, successFilter],
    queryFn: () =>
      userActivityApi.getUserActivityLogs(userId, {
        page,
        limit: pageSize,
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

  // 정렬 핸들러
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  // 정렬된 로그
  const sortedLogs = [...logs].sort((a, b) => {
    let aValue: string | number | boolean;
    let bValue: string | number | boolean;

    switch (sortKey) {
      case 'timestamp':
        aValue = new Date(a.timestamp).getTime();
        bValue = new Date(b.timestamp).getTime();
        break;
      case 'actor':
        aValue = a.actor.name || a.actor.role || '';
        bValue = b.actor.name || b.actor.role || '';
        break;
      case 'category':
        aValue = a.action.category || '';
        bValue = b.action.category || '';
        break;
      case 'target':
        aValue = a.action.target?.entity_name || a.action.target?.parent_name || '';
        bValue = b.action.target?.entity_name || b.action.target?.parent_name || '';
        break;
      case 'action':
        aValue = a.action.type || '';
        bValue = b.action.type || '';
        break;
      case 'result':
        aValue = a.result.success ? 1 : 0;
        bValue = b.result.success ? 1 : 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // 정렬 아이콘
  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

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
          aria-label="카테고리 필터"
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
          aria-label="결과 필터"
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
            <span
              className="activity-log-table__col activity-log-table__col--datetime activity-log-table__col--sortable"
              onClick={() => handleSort('timestamp')}
            >
              일시{getSortIcon('timestamp')}
            </span>
            <span
              className="activity-log-table__col activity-log-table__col--actor activity-log-table__col--sortable"
              onClick={() => handleSort('actor')}
            >
              호출자{getSortIcon('actor')}
            </span>
            <span
              className="activity-log-table__col activity-log-table__col--category activity-log-table__col--sortable"
              onClick={() => handleSort('category')}
            >
              분류{getSortIcon('category')}
            </span>
            <span
              className="activity-log-table__col activity-log-table__col--target activity-log-table__col--sortable"
              onClick={() => handleSort('target')}
            >
              대상{getSortIcon('target')}
            </span>
            <span
              className="activity-log-table__col activity-log-table__col--action activity-log-table__col--sortable"
              onClick={() => handleSort('action')}
            >
              액션{getSortIcon('action')}
            </span>
            <span
              className="activity-log-table__col activity-log-table__col--result activity-log-table__col--sortable"
              onClick={() => handleSort('result')}
            >
              결과{getSortIcon('result')}
            </span>
          </div>
          <div className="activity-log-table__body">
          {sortedLogs.map((log) => {
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
              >
                <span className="activity-log-table__col activity-log-table__col--datetime">
                  {formatDateTime(log.timestamp)}
                </span>
                <span className="activity-log-table__col activity-log-table__col--actor" title={log.actor.name || log.actor.role}>
                  {getActorLabel(log.actor)}
                </span>
                <span className={`activity-log-table__col activity-log-table__col--category activity-log-table__category--${category}`}>
                  {categoryLabel}
                </span>
                <span className="activity-log-table__col activity-log-table__col--target" title={targetName}>
                  {targetName}
                </span>
                <span className="activity-log-table__col activity-log-table__col--action">
                  {actionLabel}
                  {bulkCount && bulkCount > 1 && (
                    <span className="activity-log-table__bulk">x{bulkCount}</span>
                  )}
                </span>
                <span className={`activity-log-table__col activity-log-table__col--result ${isSuccess ? 'activity-log-table__result--success' : 'activity-log-table__result--error'}`}>
                  {isSuccess ? '성공' : '실패'}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* 페이지네이션 - 항상 표시 */}
      {pagination && (
        <div className="activity-timeline__pagination">
          <select
            className="pagination-size-select"
            value={pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              setPageSize(newSize);
              setPage(1);
              localStorage.setItem(STORAGE_KEY_PAGE_SIZE, String(newSize));
            }}
            aria-label="페이지 크기"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}개</option>
            ))}
          </select>
          <button
            type="button"
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            이전
          </button>
          <span className="pagination-info">
            {page} / {pagination.totalPages || 1}
          </span>
          <button
            type="button"
            className="pagination-btn"
            disabled={page >= (pagination.totalPages || 1)}
            onClick={() => setPage(p => p + 1)}
          >
            다음
          </button>
          <span className="pagination-total">
            전체 {pagination.total}건
          </span>
        </div>
      )}
    </div>
  );
};
