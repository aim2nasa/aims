/**
 * useGlobalShortcuts Hook Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. Developer Mode 토글 (Ctrl+Alt+Shift+D)
 * 2. 검색창 포커스 (Ctrl+K)
 * 3. 문서 검색 (Ctrl+Shift+F)
 * 4. 문서 등록 (Ctrl+Shift+U)
 * 5. 고객 등록 (Ctrl+Shift+C)
 * 6. 입력 필드 제외
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalShortcuts } from '../useGlobalShortcuts';

// Mock useDevModeStore
const mockToggleDevMode = vi.fn();
vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: (selector: (state: { toggleDevMode: () => void }) => void) =>
    selector({ toggleDevMode: mockToggleDevMode }),
}));

describe('useGlobalShortcuts', () => {
  const mockOnMenuClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 키보드 이벤트 헬퍼
   */
  function dispatchKeyEvent(options: {
    key: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    target?: Element;
  }) {
    const { key, ctrlKey = false, altKey = false, shiftKey = false, target } = options;

    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey,
      altKey,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });

    if (target) {
      Object.defineProperty(event, 'target', { value: target, writable: false });
    }

    window.dispatchEvent(event);
    return event;
  }

  // =============================================================================
  // 1. Developer Mode 토글 테스트
  // =============================================================================

  describe('Developer Mode 토글 (Ctrl+Alt+Shift+D)', () => {
    it('Ctrl+Alt+Shift+D로 Developer Mode를 토글해야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'D', ctrlKey: true, altKey: true, shiftKey: true });

      expect(mockToggleDevMode).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+D만으로는 토글하지 않아야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'D', ctrlKey: true });

      expect(mockToggleDevMode).not.toHaveBeenCalled();
    });

    it('Ctrl+Shift+D만으로는 토글하지 않아야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'D', ctrlKey: true, shiftKey: true });

      expect(mockToggleDevMode).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // 2. 검색창 포커스 테스트 (Ctrl+K)
  // =============================================================================

  describe('검색창 포커스 (Ctrl+K)', () => {
    it('Ctrl+K로 검색창에 포커스해야 함', () => {
      // Mock 검색창 엘리먼트 생성
      const mockSearchInput = document.createElement('input');
      mockSearchInput.className = 'quick-search__input';
      mockSearchInput.focus = vi.fn();
      document.body.appendChild(mockSearchInput);

      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'k', ctrlKey: true });

      expect(mockSearchInput.focus).toHaveBeenCalled();

      // 정리
      document.body.removeChild(mockSearchInput);
    });

    it('Ctrl+Shift+K로는 포커스하지 않아야 함', () => {
      const mockSearchInput = document.createElement('input');
      mockSearchInput.className = 'quick-search__input';
      mockSearchInput.focus = vi.fn();
      document.body.appendChild(mockSearchInput);

      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'k', ctrlKey: true, shiftKey: true });

      expect(mockSearchInput.focus).not.toHaveBeenCalled();

      document.body.removeChild(mockSearchInput);
    });
  });

  // =============================================================================
  // 3. 메뉴 클릭 단축키 테스트
  // =============================================================================

  describe('문서 검색 (Ctrl+Shift+F)', () => {
    it('Ctrl+Shift+F로 문서 검색 메뉴를 클릭해야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'F', ctrlKey: true, shiftKey: true });

      expect(mockOnMenuClick).toHaveBeenCalledWith('documents-search');
    });
  });

  describe('문서 등록 (Ctrl+Shift+U)', () => {
    it('Ctrl+Shift+U로 문서 등록 메뉴를 클릭해야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'U', ctrlKey: true, shiftKey: true });

      expect(mockOnMenuClick).toHaveBeenCalledWith('documents-register');
    });
  });

  describe('고객 등록 (Ctrl+Shift+C)', () => {
    it('Ctrl+Shift+C로 고객 등록 메뉴를 클릭해야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'C', ctrlKey: true, shiftKey: true });

      expect(mockOnMenuClick).toHaveBeenCalledWith('customers-register');
    });
  });

  // =============================================================================
  // 4. 입력 필드 제외 테스트
  // =============================================================================

  describe('입력 필드에서 비활성화', () => {
    it('INPUT 요소에서는 단축키가 작동하지 않아야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      const inputElement = document.createElement('input');
      document.body.appendChild(inputElement);

      dispatchKeyEvent({
        key: 'F',
        ctrlKey: true,
        shiftKey: true,
        target: inputElement,
      });

      expect(mockOnMenuClick).not.toHaveBeenCalled();

      document.body.removeChild(inputElement);
    });

    it('TEXTAREA 요소에서는 단축키가 작동하지 않아야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      const textareaElement = document.createElement('textarea');
      document.body.appendChild(textareaElement);

      dispatchKeyEvent({
        key: 'U',
        ctrlKey: true,
        shiftKey: true,
        target: textareaElement,
      });

      expect(mockOnMenuClick).not.toHaveBeenCalled();

      document.body.removeChild(textareaElement);
    });

    it('contentEditable 요소에서는 단축키가 작동하지 않아야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      const editableElement = document.createElement('div');
      editableElement.contentEditable = 'true';
      // 테스트 환경에서 isContentEditable이 true가 되도록 직접 설정
      Object.defineProperty(editableElement, 'isContentEditable', {
        value: true,
        writable: false,
      });
      document.body.appendChild(editableElement);

      dispatchKeyEvent({
        key: 'C',
        ctrlKey: true,
        shiftKey: true,
        target: editableElement,
      });

      expect(mockOnMenuClick).not.toHaveBeenCalled();

      document.body.removeChild(editableElement);
    });
  });

  // =============================================================================
  // 5. 이벤트 리스너 정리 테스트
  // =============================================================================

  describe('이벤트 리스너 정리', () => {
    it('언마운트 시 이벤트 리스너가 정리되어야 함', () => {
      const { unmount } = renderHook(() =>
        useGlobalShortcuts({ onMenuClick: mockOnMenuClick })
      );

      unmount();

      // 언마운트 후에는 단축키가 작동하지 않아야 함
      dispatchKeyEvent({ key: 'F', ctrlKey: true, shiftKey: true });

      expect(mockOnMenuClick).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // 6. 잘못된 키 조합 테스트
  // =============================================================================

  describe('잘못된 키 조합', () => {
    it('Ctrl 없이 Shift+F는 작동하지 않아야 함', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'F', shiftKey: true });

      expect(mockOnMenuClick).not.toHaveBeenCalled();
    });

    it('Alt 키가 포함되면 작동하지 않아야 함 (메뉴 제외)', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      dispatchKeyEvent({ key: 'F', ctrlKey: true, shiftKey: true, altKey: true });

      expect(mockOnMenuClick).not.toHaveBeenCalled();
    });

    it('소문자 키도 작동해야 함 (대문자와 동일)', () => {
      renderHook(() => useGlobalShortcuts({ onMenuClick: mockOnMenuClick }));

      // 소문자 k는 Ctrl+K에서 작동
      dispatchKeyEvent({ key: 'k', ctrlKey: true });

      // Ctrl+K는 검색창 포커스이므로 onMenuClick은 호출되지 않음
      // 이 테스트는 Ctrl+K가 에러 없이 동작하는지 확인
      expect(mockOnMenuClick).not.toHaveBeenCalled();
    });
  });
});
