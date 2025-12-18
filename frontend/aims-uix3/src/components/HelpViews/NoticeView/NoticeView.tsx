/**
 * 공지사항 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
import { formatDateTime } from '@/shared/lib/timeUtils';
import { helpApi, NOTICE_CATEGORY_LABELS, type Notice } from '@/features/help/api';
import './NoticeView.css';

// 공지사항 벨 아이콘
const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="notice-view__title-icon">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" opacity="0.85"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

interface NoticeViewProps {
  visible: boolean;
  onClose: () => void;
  onMarkAsRead?: () => void;
}

export default function NoticeView({
  visible,
  onClose,
  onMarkAsRead,
}: NoticeViewProps) {
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  // 공지사항 목록 조회
  const { data: notices = [], isLoading, isError } = useQuery({
    queryKey: ['notices'],
    queryFn: helpApi.getNotices,
    enabled: visible,
  });

  // 공지사항 목록 열 때 읽음 처리
  useEffect(() => {
    if (visible && onMarkAsRead) {
      onMarkAsRead();
    }
  }, [visible, onMarkAsRead]);

  // 공지사항 선택
  const handleSelectNotice = (notice: Notice) => {
    setSelectedNotice(notice);
  };

  // 목록으로 돌아가기
  const handleBackToList = () => {
    setSelectedNotice(null);
  };

  return (
    <CenterPaneView
      visible={visible}
      title={selectedNotice ? selectedNotice.title : '공지사항'}
      titleIcon={<BellIcon />}
      titleLeftAccessory={selectedNotice ? (
        <button
          type="button"
          className="notice-view__back-button"
          onClick={handleBackToList}
          aria-label="목록으로"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
      ) : undefined}
      onClose={onClose}
      className="notice-view"
    >
      {isLoading ? (
        <div className="notice-view__empty">
          불러오는 중...
        </div>
      ) : isError ? (
        <div className="notice-view__empty">
          공지사항을 불러오는데 실패했습니다.
        </div>
      ) : selectedNotice ? (
        // 공지사항 상세
        <div className="notice-view__detail">
          <div className="notice-view__detail-header">
            <span className={`notice-view__category notice-view__category--${selectedNotice.category}`}>
              {NOTICE_CATEGORY_LABELS[selectedNotice.category]}
            </span>
            <span className="notice-view__date">
              {formatDateTime(selectedNotice.createdAt)}
            </span>
          </div>
          <div className="notice-view__detail-content">
            {selectedNotice.content}
          </div>
        </div>
      ) : (
        // 공지사항 목록
        <div className="notice-view__list">
          {notices.length === 0 ? (
            <div className="notice-view__empty">
              공지사항이 없습니다.
            </div>
          ) : (
            notices.map(notice => (
              <div
                key={notice._id}
                className={`notice-view__item ${notice.isNew ? 'notice-view__item--new' : ''}`}
                onClick={() => handleSelectNotice(notice)}
              >
                <span className={`notice-view__category notice-view__category--${notice.category}`}>
                  {NOTICE_CATEGORY_LABELS[notice.category]}
                </span>
                {notice.isNew && <span className="notice-view__new-badge">NEW</span>}
                <span className="notice-view__item-title">{notice.title}</span>
                <span className="notice-view__item-date">
                  {formatDateTime(notice.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </CenterPaneView>
  );
}
