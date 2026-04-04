/**
 * AIMS UIX-3 Address Archive Controller
 * @since 2025-10-11
 * @version 2.0.0
 *
 * 🍎 주소 보관소 비즈니스 로직 Controller
 * - Document-Controller-View 패턴 준수 (Layer 4)
 * - 주소 보관소 모달 상태 관리
 * - Service Layer를 통한 실제 API 연동
 */

import { useState, useCallback, useEffect } from 'react';
import type { AddressHistoryItem } from '@/entities/customer/model';
import { AddressService } from '@/services/addressService';
import { errorReporter } from '@/shared/lib/errorReporter';
import { isRequestCancelledError } from '@/shared/lib/api';

/**
 * Controller 반환 타입
 */
interface AddressArchiveControllerReturn {
  // State
  isOpen: boolean;
  addressHistory: AddressHistoryItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  open: () => void;
  close: () => void;
  loadAddressHistory: (customerId: string) => Promise<void>;
}

/**
 * 주소 보관소 Controller Hook
 *
 * @param customerId - 고객 ID
 * @returns 주소 보관소 상태 및 액션
 *
 * @example
 * ```tsx
 * const controller = useAddressArchiveController(customer._id);
 *
 * return (
 *   <>
 *     <button onClick={controller.open}>주소 보관소</button>
 *     <AddressArchiveModal
 *       isOpen={controller.isOpen}
 *       onClose={controller.close}
 *       addressHistory={controller.addressHistory}
 *       isLoading={controller.isLoading}
 *       error={controller.error}
 *       customerName={customer.personal_info.name}
 *     />
 *   </>
 * );
 * ```
 */
export const useAddressArchiveController = (
  customerId: string
): AddressArchiveControllerReturn => {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [addressHistory, setAddressHistory] = useState<AddressHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

 /**
  * 주소 이력 로드 (실제 API 연동)
  */
 const loadAddressHistory = useCallback(async (customerId: string) => {
   if (!customerId) {
      setError('고객 ID가 필요합니다');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Service Layer를 통한 실제 API 호출
      const history = await AddressService.getAddressHistory(customerId);

      if (import.meta.env.DEV) {
        console.log('[AddressArchiveController] 주소 이력 로드 성공:', history.length, '건');
      }
      setAddressHistory(history);
      setIsLoading(false); // 🔧 성공 시에만 로딩 종료
    } catch (err) {
      // 🔧 취소된 요청은 조용히 무시 (고객 전환 등 정상적인 상황)
      if (isRequestCancelledError(err)) {
        // setIsLoading(false) 호출하지 않음 - 새 요청이 진행 중
        return;
      }
      const errorMessage = err instanceof Error ? err.message : '주소 이력을 불러오는데 실패했습니다.';
      setError(errorMessage);
      console.error('[AddressArchiveController] 주소 이력 로드 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'useAddressArchiveController.loadAddressHistory', payload: { customerId } });
      setAddressHistory([]); // 에러 시 빈 배열로 초기화
      setIsLoading(false); // 🔧 실제 에러 시에만 로딩 종료
    }
    // 🔧 finally 제거 - 취소된 요청에서 setIsLoading(false) 호출하면 새 요청의 로딩 상태가 풀림
  }, []);

  /**
   * 🍎 페이지 로드 시 자동으로 주소 이력 개수 로드
   */
  useEffect(() => {
    if (customerId) {
      loadAddressHistory(customerId);
    }
  }, [customerId, loadAddressHistory]);

  /**
   * 주소 보관소 모달 열기
   */
  const open = useCallback(() => {
    setIsOpen(true);
    if (customerId) {
      loadAddressHistory(customerId);
    }
  }, [customerId, loadAddressHistory]);

  /**
   * 주소 보관소 모달 닫기
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  return {
    // State
    isOpen,
    addressHistory,
    isLoading,
    error,

    // Actions
    open,
    close,
    loadAddressHistory
  };
};

