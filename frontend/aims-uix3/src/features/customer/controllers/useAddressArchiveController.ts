/**
 * AIMS UIX-3 Address Archive Controller
 * @since 2025-10-11
 * @version 1.0.0
 *
 * 🍎 주소 보관소 비즈니스 로직 Controller
 * - Document-Controller-View 패턴 준수
 * - 주소 보관소 모달 상태 관리
 * - 추후 API 연동 준비
 */

import { useState, useCallback } from 'react';

/**
 * 주소 이력 항목 타입
 */
export interface AddressHistoryItem {
  id: string;
  date: string;
  postalCode: string;
  address: string;
  detailAddress?: string;
  isCurrent: boolean;
}

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
  setCurrentAddress: (addressId: string) => Promise<void>;
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
 *       onSetCurrent={controller.setCurrentAddress}
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
   * 주소 보관소 모달 열기
   */
  const open = useCallback(() => {
    setIsOpen(true);
    // 모달 열릴 때 주소 이력 자동 로드
    loadAddressHistory(customerId);
  }, [customerId]);

  /**
   * 주소 보관소 모달 닫기
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  /**
   * 주소 이력 로드
   * TODO: 실제 API 연동
   */
  const loadAddressHistory = useCallback(async (customerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Service Layer를 통한 API 호출
      // const history = await AddressService.getAddressHistory(customerId);

      // 임시 더미 데이터
      const dummyHistory: AddressHistoryItem[] = [
        {
          id: '1',
          date: '2025. 10. 11. 오후 12:26',
          postalCode: '04327',
          address: '서울 용산구 후암로34길 49 1',
          detailAddress: '',
          isCurrent: true
        },
        {
          id: '2',
          date: '2025. 10. 10. 오후 05:26',
          postalCode: '10412',
          address: '경기 고양시 일산동구 일산로286번길 19-2',
          detailAddress: '2층',
          isCurrent: false
        }
      ];

      setAddressHistory(dummyHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주소 이력을 불러오는데 실패했습니다.');
      console.error('[AddressArchiveController] 주소 이력 로드 실패:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 현재 주소로 설정
   * TODO: 실제 API 연동
   */
  const setCurrentAddress = useCallback(async (addressId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Service Layer를 통한 API 호출
      // await AddressService.setCurrentAddress(customerId, addressId);

      // 임시: 로컬 상태 업데이트
      setAddressHistory(prev =>
        prev.map(item => ({
          ...item,
          isCurrent: item.id === addressId
        }))
      );

      console.log('[AddressArchiveController] 주소 변경 완료:', addressId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주소 변경에 실패했습니다.');
      console.error('[AddressArchiveController] 주소 변경 실패:', err);
    } finally {
      setIsLoading(false);
    }
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
    loadAddressHistory,
    setCurrentAddress
  };
};

export default useAddressArchiveController;
