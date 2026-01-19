/**
 * AIMS UIX-3 Memo Controller
 * @since 2025-12-10
 * @version 1.0.0
 *
 * 고객 메모 비즈니스 로직 Controller
 * - Document-Controller-View 패턴 준수 (Layer 4)
 * - 메모 CRUD 상태 관리
 * - Service Layer를 통한 실제 API 연동
 */

import { useState, useCallback, useEffect } from 'react';
import type { CustomerMemo } from '@/entities/customer/model';
import { MemoService } from '@/services/memoService';
import { errorReporter } from '@/shared/lib/errorReporter';
import { isRequestCancelledError } from '@/shared/lib/api';

/**
 * Controller 반환 타입
 */
interface MemoControllerReturn {
  // State
  memos: CustomerMemo[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions
  loadMemos: () => Promise<void>;
  createMemo: (content: string) => Promise<boolean>;
  updateMemo: (memoId: string, content: string) => Promise<boolean>;
  deleteMemo: (memoId: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * 메모 Controller Hook
 *
 * @param customerId - 고객 ID
 * @returns 메모 상태 및 액션
 *
 * @example
 * ```tsx
 * const memoController = useMemoController(customer._id);
 *
 * return (
 *   <MemosTab
 *     memos={memoController.memos}
 *     isLoading={memoController.isLoading}
 *     onCreateMemo={memoController.createMemo}
 *     onDeleteMemo={memoController.deleteMemo}
 *   />
 * );
 * ```
 */
export const useMemoController = (customerId: string): MemoControllerReturn => {
  // State
  const [memos, setMemos] = useState<CustomerMemo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 메모 목록 로드
   */
  const loadMemos = useCallback(async () => {
    if (!customerId) {
      setError('고객 ID가 필요합니다');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await MemoService.getMemos(customerId);

      if (import.meta.env.DEV) {
        console.log('[MemoController] 메모 로드 성공:', data.length, '건');
      }
      setMemos(data);
      setIsLoading(false); // 🔧 성공 시에만 로딩 종료
    } catch (err) {
      // 🔧 취소된 요청은 조용히 무시 (고객 전환 등 정상적인 상황)
      if (isRequestCancelledError(err)) {
        // setIsLoading(false) 호출하지 않음 - 새 요청이 진행 중
        return;
      }
      const errorMessage = err instanceof Error ? err.message : '메모를 불러오는데 실패했습니다.';
      setError(errorMessage);
      console.error('[MemoController] 메모 로드 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'useMemoController.loadMemos', payload: { customerId } });
      setMemos([]);
      setIsLoading(false); // 🔧 실제 에러 시에만 로딩 종료
    }
    // 🔧 finally 제거 - 취소된 요청에서 setIsLoading(false) 호출하면 새 요청의 로딩 상태가 풀림
  }, [customerId]);

  /**
   * 페이지 로드 시 자동으로 메모 로드
   */
  useEffect(() => {
    if (customerId) {
      loadMemos();
    }
  }, [customerId, loadMemos]);

  /**
   * 메모 생성
   */
  const createMemo = useCallback(async (content: string): Promise<boolean> => {
    if (!customerId) {
      setError('고객 ID가 필요합니다');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      const newMemo = await MemoService.createMemo(customerId, content);

      if (import.meta.env.DEV) {
        console.log('[MemoController] 메모 생성 성공:', newMemo._id);
      }

      // 새 메모를 목록 맨 앞에 추가
      setMemos(prev => [newMemo, ...prev]);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '메모 저장에 실패했습니다.';
      setError(errorMessage);
      console.error('[MemoController] 메모 생성 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'useMemoController.createMemo', payload: { customerId } });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [customerId]);

  /**
   * 메모 수정
   */
  const updateMemo = useCallback(async (memoId: string, content: string): Promise<boolean> => {
    if (!customerId || !memoId) {
      setError('고객 ID와 메모 ID가 필요합니다');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updatedMemo = await MemoService.updateMemo(customerId, memoId, content);

      if (import.meta.env.DEV) {
        console.log('[MemoController] 메모 수정 성공:', memoId);
      }

      // 목록에서 해당 메모 업데이트
      setMemos(prev => prev.map(memo =>
        memo._id === memoId
          ? { ...memo, content: updatedMemo.content, updated_at: updatedMemo.updated_at }
          : memo
      ));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '메모 수정에 실패했습니다.';
      setError(errorMessage);
      console.error('[MemoController] 메모 수정 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'useMemoController.updateMemo', payload: { customerId, memoId } });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [customerId]);

  /**
   * 메모 삭제
   */
  const deleteMemo = useCallback(async (memoId: string): Promise<boolean> => {
    if (!customerId || !memoId) {
      setError('고객 ID와 메모 ID가 필요합니다');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      await MemoService.deleteMemo(customerId, memoId);

      if (import.meta.env.DEV) {
        console.log('[MemoController] 메모 삭제 성공:', memoId);
      }

      // 목록에서 해당 메모 제거
      setMemos(prev => prev.filter(memo => memo._id !== memoId));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '메모 삭제에 실패했습니다.';
      setError(errorMessage);
      console.error('[MemoController] 메모 삭제 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'useMemoController.deleteMemo', payload: { customerId, memoId } });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [customerId]);

  /**
   * 에러 초기화
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    memos,
    isLoading,
    isSaving,
    error,

    // Actions
    loadMemos,
    createMemo,
    updateMemo,
    deleteMemo,
    clearError,
  };
};

export default useMemoController;
