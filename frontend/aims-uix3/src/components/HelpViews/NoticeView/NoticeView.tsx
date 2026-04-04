/**
 * 공지사항 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { BackButton } from '@/shared/ui/BackButton';
import { formatDateTime } from '@/shared/lib/timeUtils';
import { helpApi, NOTICE_CATEGORY_LABELS, type Notice } from '@/features/help';
import './NoticeView.css';
import './NoticeView.mobile.css';

// 공지사항 벨 아이콘 — LP와 동일 (SFSymbol: bell, menu-icon-blue)
const BellIcon = () => (
  <span className="menu-icon-blue">
    <SFSymbol name="bell" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />
  </span>
);

interface NoticeViewProps {
  visible: boolean;
  onClose: () => void;
  onMarkAsRead?: () => void;
}

export function NoticeView({
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
      suppressAutoBackButton
      title={selectedNotice ? selectedNotice.title : '공지사항'}
      titleIcon={<BellIcon />}
      titleAccessory={selectedNotice ? (
        <BackButton label="목록" onClick={handleBackToList} />
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

export default NoticeView
