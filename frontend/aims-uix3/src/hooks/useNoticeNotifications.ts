/**
 * 공지사항 알림 훅
 * localStorage 기반 새 글 감지
 * @since 2025-12-18
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'aims_notice_last_checked';

// 가장 최근 공지사항 날짜 (샘플 데이터 기준)
// 실제로는 API에서 가져와야 함
const LATEST_NOTICE_DATE = '2025-12-18T10:00:00';

/**
 * 공지사항 새 글 알림을 관리하는 훅
 */
export function useNoticeNotifications() {
  const [hasNewNotice, setHasNewNotice] = useState(false);

  // 새 공지사항 확인
  useEffect(() => {
    const lastChecked = localStorage.getItem(STORAGE_KEY);

    if (!lastChecked) {
      // 처음 방문 - 새 글 있음으로 표시
      setHasNewNotice(true);
    } else {
      // 마지막 확인 시간과 최신 공지 날짜 비교
      const lastCheckedDate = new Date(lastChecked);
      const latestNoticeDate = new Date(LATEST_NOTICE_DATE);

      setHasNewNotice(latestNoticeDate > lastCheckedDate);
    }
  }, []);

  // 읽음 처리
  const markAsRead = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, now);
    setHasNewNotice(false);
  }, []);

  return {
    hasNewNotice,
    markAsRead,
  };
}

