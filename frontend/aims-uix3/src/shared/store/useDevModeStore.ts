/**
 * Developer Mode Global Store
 *
 * 개발자 모드 전역 상태 관리
 * - Ctrl+Shift+E 단축키 → 비밀번호 모달 → 인증 후 활성화
 * - localStorage에 저장하여 영구 보관
 * - 전체 앱에서 사용 가능
 */

import { create } from 'zustand';

interface DevModeStore {
  /** 개발자 모드 활성화 여부 */
  isDevMode: boolean;

  /** 비밀번호 입력 모달 표시 여부 */
  showPasswordModal: boolean;

  /** 개발자 모드 토글 */
  toggleDevMode: () => void;

  /** 개발자 모드 설정 (직접 설정) */
  setDevMode: (enabled: boolean) => void;

  /** 비밀번호 모달 열기 */
  openPasswordModal: () => void;

  /** 비밀번호 모달 닫기 */
  closePasswordModal: () => void;
}

/**
 * 개발자 모드 전역 store
 *
 * @example
 * ```tsx
 * // 컴포넌트에서 사용
 * const { isDevMode } = useDevModeStore();
 *
 * {isDevMode && (
 *   <button>개발자 전용 기능</button>
 * )}
 * ```
 */
export const useDevModeStore = create<DevModeStore>((set) => ({
  // 초기값: localStorage에서 불러오기
  isDevMode: localStorage.getItem('aims_dev_mode') === 'true',

  showPasswordModal: false,

  // 토글
  toggleDevMode: () => set((state) => {
    const newMode = !state.isDevMode;
    localStorage.setItem('aims_dev_mode', String(newMode));
    console.log(`🔧 AIMS 개발자 모드: ${newMode ? 'ON' : 'OFF'}`);
    return { isDevMode: newMode };
  }),

  // 직접 설정
  setDevMode: (enabled: boolean) => set(() => {
    localStorage.setItem('aims_dev_mode', String(enabled));
    console.log(`🔧 AIMS 개발자 모드: ${enabled ? 'ON' : 'OFF'}`);
    return { isDevMode: enabled };
  }),

  openPasswordModal: () => set({ showPasswordModal: true }),
  closePasswordModal: () => set({ showPasswordModal: false }),
}));
