/**
 * AIMS UIX-3 User Store
 * @since 2025-10-30
 * @version 1.1.0
 *
 * 사용자 계정 정보 관리
 * - 현재 로그인한 보험설계사(user) 정보 저장
 * - API 호출 시 x-user-id 헤더에 사용
 * - MongoDB users 컬렉션에서 사용자 목록 로드
 */

import { useState, useEffect } from 'react';
import { errorReporter } from '@/shared/lib/errorReporter';

/**
 * 사용자 인터페이스
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role?: string; // 역할 (선택 사항)
  avatarUrl?: string; // 프로필 사진 URL (선택 사항)
  phone?: string;
  department?: string;
  position?: string;
}

/**
 * 현재 사용자 ID를 저장하는 전역 변수
 * 초기값: localStorage에서 복원 (없으면 빈 문자열)
 * ⚠️ 실제 MongoDB ObjectId여야 함 ('tester', 'dev-user' 같은 문자열 금지)
 */
let currentUserId = typeof window !== 'undefined'
  ? (() => {
      const storedId = localStorage.getItem('aims-current-user-id');
      if (!storedId) {
        console.warn('[UserStore] ⚠️ 사용자 ID가 localStorage에 없습니다. 로그인이 필요합니다.');
      }
      return storedId || '';
    })()
  : '';

/**
 * 현재 사용자 상세 정보를 저장하는 전역 변수
 */
let currentUserInfo: User | null = null;

/**
 * 구독자 목록 (상태 변경 시 알림받을 컴포넌트들)
 */
const subscribers = new Set<(userId: string) => void>();

/**
 * 사용자 정보 구독자 목록
 */
const userInfoSubscribers = new Set<(user: User | null) => void>();

/**
 * 모든 구독자에게 userId 변경 알림
 */
function notifySubscribers() {
  subscribers.forEach(callback => callback(currentUserId));
}

/**
 * localStorage에서 userId를 다시 읽어 동기화 (페이지 리로드 없이)
 * 소셜 로그인 후 호출하여 레거시 시스템과 동기화
 */
export function syncUserIdFromStorage(): void {
  if (typeof window === 'undefined') return;

  const storedUserId = localStorage.getItem('aims-current-user-id');
  if (storedUserId && storedUserId !== currentUserId) {
    currentUserId = storedUserId;
    notifySubscribers();
  }
}

/**
 * 모든 구독자에게 사용자 정보 변경 알림
 */
function notifyUserInfoSubscribers() {
  userInfoSubscribers.forEach(callback => callback(currentUserInfo));
}

/**
 * User Store Hook
 *
 * 사용자 ID 상태를 관리하고 변경사항을 구독
 */
export function useUserStore() {
  const [userId, setUserIdState] = useState(currentUserId);
  const [currentUser, setCurrentUser] = useState<User | null>(currentUserInfo);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // userId 구독 설정
  useEffect(() => {
    const handleUserIdChange = (newUserId: string) => {
      setUserIdState(newUserId);
    };

    subscribers.add(handleUserIdChange);

    return () => {
      subscribers.delete(handleUserIdChange);
    };
  }, []);

  // 사용자 정보 구독 설정
  useEffect(() => {
    const handleUserInfoChange = (user: User | null) => {
      setCurrentUser(user);
    };

    userInfoSubscribers.add(handleUserInfoChange);

    return () => {
      userInfoSubscribers.delete(handleUserInfoChange);
    };
  }, []);

  // MongoDB에서 사용자 목록 로드
  useEffect(() => {
    // 테스트 환경에서는 fetch 하지 않음
    if (typeof window === 'undefined') {
      return;
    }

    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users');
        const result = await response.json();

        // 브라우저 환경에서만 setState 호출
        if (typeof window === 'undefined') return;

        if (result.success) {
          setAvailableUsers(result.data);
        } else {
          console.error('❌ 사용자 목록 로드 실패:', result.error);
          // 실패 시 빈 배열 (하드코딩된 테스트 사용자 제거)
          setAvailableUsers([]);
        }
      } catch (error) {
        // 브라우저 환경에서만 에러 처리 및 setState 호출
        if (typeof window === 'undefined') return;

        console.error('❌ 사용자 목록 API 호출 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'UserStore.fetchUsers' });
        // 실패 시 빈 배열 (하드코딩된 테스트 사용자 제거)
        setAvailableUsers([]);
      } finally {
        // 브라우저 환경에서만 setLoading 호출
        if (typeof window !== 'undefined') {
          setLoading(false);
        }
      }
    };

    fetchUsers();
  }, []);

  /**
   * 현재 사용자 ID 가져오기
   */
  const getUserId = (): string => {
    return currentUserId;
  };

  /**
   * 이전 사용자의 데이터 정리
   * - sessionStorage의 모든 사용자별 데이터 삭제
   * - localStorage의 사용자별 설정 유지 (aims-current-user-id 제외)
   */
  const clearUserData = (): void => {
    if (typeof window === 'undefined') return;

    try {
      // sessionStorage 완전 정리 (문서 업로드 상태, 처리 로그 등)
      sessionStorage.clear();

      // localStorage에서 사용자별 데이터 정리
      // 시스템 설정은 유지하고 사용자별 데이터만 제거
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          // 문서 관련 사용자별 데이터
          key.startsWith('document-') ||
          key.startsWith('upload-') ||
          // 고객 관련 사용자별 데이터
          key.startsWith('customer-') ||
          // 검색 히스토리
          key.startsWith('search-') ||
          // 기타 사용자별 캐시
          key.includes('-cache-') ||
          key.includes('-state-')
        )) {
          keysToRemove.push(key);
        }
      }

      // 식별된 키들 삭제
      keysToRemove.forEach(key => localStorage.removeItem(key));

      console.log(`[UserStore] 사용자 데이터 정리 완료: ${keysToRemove.length}개 항목 삭제`);
    } catch (error) {
      console.error('[UserStore] 사용자 데이터 정리 실패:', error);
    }
  };

  /**
   * 사용자 ID 설정
   * - 이전 사용자 데이터 정리
   * - 전역 변수 업데이트
   * - localStorage에 저장
   * - 모든 구독자에게 알림
   * - 페이지 새로고침
   */
  const setUserId = (newUserId: string): void => {
    if (currentUserId === newUserId) return;

    // 이전 사용자 데이터 정리 (reload 전에 실행!)
    clearUserData();

    currentUserId = newUserId;

    // 브라우저 환경에서만 localStorage 및 reload 실행
    if (typeof window !== 'undefined') {
      localStorage.setItem('aims-current-user-id', newUserId);
      notifySubscribers();

      // 페이지 새로고침하여 모든 데이터 다시 로드
      window.location.reload();
    } else {
      notifySubscribers();
    }
  };

  /**
   * 현재 사용자 정보 업데이트
   * DB 저장 후 전역 상태 갱신에 사용
   */
  const updateCurrentUser = (user: User): void => {
    currentUserInfo = user;
    notifyUserInfoSubscribers();
  };

  /**
   * 현재 사용자 정보 가져오기
   */
  const getCurrentUser = (): User | null => {
    return currentUserInfo;
  };

  return {
    userId,
    getUserId,
    setUserId,
    currentUser,
    updateCurrentUser,
    getCurrentUser,
    availableUsers,
    loading,
  };
}
