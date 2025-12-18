/**
 * 공지사항 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, useEffect } from 'react';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
import { formatDateTime } from '@/shared/lib/timeUtils';
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

// 공지사항 타입
interface Notice {
  id: string;
  title: string;
  content: string;
  category: 'system' | 'product' | 'policy' | 'event';
  createdAt: string;
  isNew?: boolean;
}

// 카테고리 라벨
const CATEGORY_LABELS: Record<Notice['category'], string> = {
  system: '시스템',
  product: '상품',
  policy: '정책',
  event: '이벤트',
};

// 샘플 공지사항 데이터 (추후 API 연동)
const SAMPLE_NOTICES: Notice[] = [
  {
    id: '1',
    title: 'AIMS 시스템 정기 점검 안내',
    content: `안녕하세요. AIMS 운영팀입니다.

시스템 안정성 향상을 위한 정기 점검이 예정되어 있습니다.

■ 점검 일시: 2025년 12월 20일 (토) 02:00 ~ 06:00
■ 점검 내용: 서버 최적화 및 보안 패치 적용
■ 영향 범위: 전체 서비스 일시 중단

점검 시간 동안 서비스 이용이 불가능하오니 양해 부탁드립니다.

감사합니다.`,
    category: 'system',
    createdAt: '2025-12-18T10:00:00',
    isNew: true,
  },
  {
    id: '2',
    title: '신규 보험 상품 출시 안내',
    content: `새로운 보험 상품이 출시되었습니다.

■ 상품명: 프리미엄 건강보험 플러스
■ 주요 특징:
  - 무해지환급형 선택 가능
  - 3대 질병 진단비 강화
  - 실손의료비 보장 확대

자세한 내용은 상품 설명서를 참고해 주세요.`,
    category: 'product',
    createdAt: '2025-12-15T09:00:00',
  },
  {
    id: '3',
    title: '개인정보 처리방침 변경 안내',
    content: `개인정보 처리방침이 변경되었습니다.

■ 시행일: 2025년 1월 1일
■ 주요 변경사항:
  - 개인정보 보유기간 조정
  - 제3자 제공 항목 명확화
  - 개인정보 보호책임자 연락처 변경

변경된 내용은 홈페이지에서 확인하실 수 있습니다.`,
    category: 'policy',
    createdAt: '2025-12-10T14:00:00',
  },
];

export default function NoticeView({
  visible,
  onClose,
  onMarkAsRead,
}: NoticeViewProps) {
  const [notices] = useState<Notice[]>(SAMPLE_NOTICES);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

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
      {selectedNotice ? (
        // 공지사항 상세
        <div className="notice-view__detail">
          <div className="notice-view__detail-header">
            <span className={`notice-view__category notice-view__category--${selectedNotice.category}`}>
              {CATEGORY_LABELS[selectedNotice.category]}
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
                key={notice.id}
                className={`notice-view__item ${notice.isNew ? 'notice-view__item--new' : ''}`}
                onClick={() => handleSelectNotice(notice)}
              >
                <div className="notice-view__item-header">
                  <span className={`notice-view__category notice-view__category--${notice.category}`}>
                    {CATEGORY_LABELS[notice.category]}
                  </span>
                  {notice.isNew && <span className="notice-view__new-badge">NEW</span>}
                </div>
                <div className="notice-view__item-title">{notice.title}</div>
                <div className="notice-view__item-date">
                  {formatDateTime(notice.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </CenterPaneView>
  );
}
