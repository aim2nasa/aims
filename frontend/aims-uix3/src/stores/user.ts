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

/**
 * 사용자 인터페이스
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * 현재 사용자 ID를 저장하는 전역 변수
 * 초기값: localStorage에서 복원하거나 'tester'
 */
let currentUserId = typeof window !== 'undefined'
  ? localStorage.getItem('aims-current-user-id') || 'tester'
  : 'tester';

/**
 * 구독자 목록 (상태 변경 시 알림받을 컴포넌트들)
 */
const subscribers = new Set<(userId: string) => void>();

/**
 * 모든 구독자에게 userId 변경 알림
 */
function notifySubscribers() {
  subscribers.forEach(callback => callback(currentUserId));
}

/**
 * User Store Hook
 *
 * 사용자 ID 상태를 관리하고 변경사항을 구독
 */
export function useUserStore() {
  const [userId, setUserIdState] = useState(currentUserId);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // 구독 설정
  useEffect(() => {
    const handleUserIdChange = (newUserId: string) => {
      setUserIdState(newUserId);
    };

    subscribers.add(handleUserIdChange);

    return () => {
      subscribers.delete(handleUserIdChange);
    };
  }, []);

  // MongoDB에서 사용자 목록 로드
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('http://tars.giize.com:3010/api/users');
        const result = await response.json();

        if (result.success) {
          setAvailableUsers(result.data);
        } else {
          console.error('❌ 사용자 목록 로드 실패:', result.error);
          // 실패 시 기본 사용자만 표시
          setAvailableUsers([
            { id: 'tester', name: '테스트 설계사', email: 'tester@example.com', role: 'agent' }
          ]);
        }
      } catch (error) {
        console.error('❌ 사용자 목록 API 호출 실패:', error);
        // 실패 시 기본 사용자만 표시
        setAvailableUsers([
          { id: 'tester', name: '테스트 설계사', email: 'tester@example.com', role: 'agent' }
        ]);
      } finally {
        setLoading(false);
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
   * 사용자 ID 설정
   * - 전역 변수 업데이트
   * - localStorage에 저장
   * - 모든 구독자에게 알림
   * - 페이지 새로고침
   */
  const setUserId = (newUserId: string): void => {
    if (currentUserId === newUserId) return;

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

  return {
    userId,
    getUserId,
    setUserId,
    availableUsers,
    loading,
  };
}
