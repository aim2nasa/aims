/**
 * AIMS UIX-3 User Store
 * @since 2025-10-30
 * @version 1.0.0
 *
 * 사용자 계정 정보 관리
 * - 현재 로그인한 보험설계사(user) 정보 저장
 * - API 호출 시 x-user-id 헤더에 사용
 *
 * 참고: 현재는 하드코딩된 "tester" 사용
 * 향후 로그인 기능 구현 시 동적으로 변경 가능하도록 구조 설계
 */

/**
 * 현재 사용자 ID
 * 테스트 계정: "tester"
 */
let currentUserId = 'tester';

/**
 * User Store
 */
export function useUserStore() {
  /**
   * 현재 사용자 ID 가져오기
   */
  const getUserId = (): string => {
    return currentUserId;
  };

  /**
   * 사용자 ID 설정
   * (향후 로그인 기능 구현 시 사용)
   */
  const setUserId = (newUserId: string): void => {
    currentUserId = newUserId;
  };

  return {
    userId: currentUserId,
    getUserId,
    setUserId,
  };
}
