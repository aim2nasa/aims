/**
 * User Detail Panel
 * 사용자 상세 활동 패널
 * @since 2025-12-14
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  userActivityApi,
  formatBytes,
  formatTokens,
  formatDateTime,
  formatRelativeTime,
  type UserError,
} from '@/features/users/userActivityApi';
import { Button } from '@/shared/ui/Button/Button';
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

const STATUS_LABELS: Record<string, string> = {
  completed: '완료',
  processing: '처리중',
  error: '오류',
  pending: '대기',
};

type TabType = 'summary' | 'errors' | 'activity';

export const UserDetailPanel = ({ userId, onClose }: UserDetailPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('summary');

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
            <span className="info-value">{user.tier}</span>
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
        <h4 className="user-detail-panel__section-title">AI 사용량 (30일)</h4>
        <div className="user-detail-panel__stats-grid">
          <div className="stat-item stat-item--primary">
            <span className="stat-value">{formatTokens(activity_summary.ai_usage.total_tokens)}</span>
            <span className="stat-label">총 토큰</span>
          </div>
          {Object.entries(activity_summary.ai_usage.by_source || {}).map(([source, tokens]) => (
            <div key={source} className="stat-item">
              <span className="stat-value">{formatTokens(tokens as number)}</span>
              <span className="stat-label">{source}</span>
            </div>
          ))}
        </div>
      </div>

      {/* OCR 사용량 */}
      <div className="user-detail-panel__section">
        <h4 className="user-detail-panel__section-title">OCR 사용량</h4>
        <div className="user-detail-panel__stats-grid">
          <div className="stat-item">
            <span className="stat-value">{activity_summary.ocr_usage.total}</span>
            <span className="stat-label">전체</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{activity_summary.ocr_usage.this_month}</span>
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

  const renderErrorsTab = () => (
    <div className="user-detail-panel__errors">
      {errorsLoading ? (
        <div className="user-detail-panel__loading">오류 목록 로딩 중...</div>
      ) : !errorsData?.errors?.length ? (
        <div className="user-detail-panel__empty">최근 7일간 오류가 없습니다.</div>
      ) : (
        <div className="error-list">
          {errorsData.errors.map((error: UserError, index: number) => (
            <div key={index} className="error-item">
              <div className="error-item__header">
                <span className={`error-type error-type--${error.type}`}>
                  {ERROR_TYPE_LABELS[error.type] || error.type}
                </span>
                <span className="error-time">{formatRelativeTime(error.occurred_at)}</span>
              </div>
              <div className="error-item__document">{error.document_name}</div>
              <div className="error-item__message">{error.error_message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderActivityTab = () => (
    <div className="user-detail-panel__activity">
      {!recent_activity?.length ? (
        <div className="user-detail-panel__empty">최근 활동이 없습니다.</div>
      ) : (
        <div className="activity-list">
          {recent_activity.map((activity, index) => (
            <div key={index} className="activity-item">
              <div className="activity-item__header">
                <span className={`activity-status activity-status--${activity.status}`}>
                  {STATUS_LABELS[activity.status] || activity.status}
                </span>
                <span className="activity-time">{formatRelativeTime(activity.updated_at)}</span>
              </div>
              <div className="activity-item__document">{activity.document_name}</div>
              <div className="activity-item__details">
                {activity.ocr_status && (
                  <span className="activity-detail">OCR: {activity.ocr_status}</span>
                )}
                {activity.embed_status && (
                  <span className="activity-detail">임베딩: {activity.embed_status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
          className={`user-detail-panel__tab ${activeTab === 'activity' ? 'user-detail-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          최근 활동
        </button>
      </div>

      <div className="user-detail-panel__content">
        {activeTab === 'summary' && renderSummaryTab()}
        {activeTab === 'errors' && renderErrorsTab()}
        {activeTab === 'activity' && renderActivityTab()}
      </div>
    </div>
  );
};
