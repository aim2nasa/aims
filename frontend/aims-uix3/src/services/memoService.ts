/**
 * AIMS UIX-3 Memo Service
 * @since 2025-12-10
 * @version 1.0.0
 *
 * 고객 메모 관련 API 서비스
 * - Document-Controller-View 패턴 준수 (Layer 1: Service)
 * - 메모 CRUD API
 */

import type { CustomerMemo } from '@/entities/customer/model';
import { api } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

interface MemoListResponse {
  success: boolean;
  data: CustomerMemo[];
  total: number;
  message?: string;
}

interface MemoResponse {
  success: boolean;
  data: CustomerMemo;
  message?: string;
}

interface DeleteResponse {
  success: boolean;
  message?: string;
}

/**
 * MemoService 클래스
 *
 * 고객 메모 관련 API 호출을 중앙화하여 관리합니다.
 */
export class MemoService {
  /**
   * 고객의 메모 목록 조회
   *
   * @param customerId - 고객 ID
   * @returns 메모 배열 (최신순)
   * @throws {Error} API 호출 실패 시
   */
  static async getMemos(customerId: string): Promise<CustomerMemo[]> {
    if (!customerId) {
      throw new Error('고객 ID가 필요합니다');
    }

    try {
      const data = await api.get<MemoListResponse>(
        `/api/customers/${customerId}/memos`
      );

      if (!data.success) {
        throw new Error(data.message || '메모 목록 조회에 실패했습니다');
      }

      return data.data || [];
    } catch (error) {
      console.error('[MemoService] 메모 목록 조회 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'MemoService.getMemos', payload: { customerId } });

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('메모를 불러오는 중 오류가 발생했습니다');
    }
  }

  /**
   * 메모 생성
   *
   * @param customerId - 고객 ID
   * @param content - 메모 내용
   * @returns 생성된 메모
   * @throws {Error} API 호출 실패 시
   */
  static async createMemo(customerId: string, content: string): Promise<CustomerMemo> {
    if (!customerId) {
      throw new Error('고객 ID가 필요합니다');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('메모 내용을 입력해주세요');
    }

    try {
      const data = await api.post<MemoResponse>(
        `/api/customers/${customerId}/memos`,
        { content: content.trim() }
      );

      if (!data.success) {
        throw new Error(data.message || '메모 저장에 실패했습니다');
      }

      return data.data;
    } catch (error) {
      console.error('[MemoService] 메모 생성 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'MemoService.createMemo', payload: { customerId } });

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('메모를 저장하는 중 오류가 발생했습니다');
    }
  }

  /**
   * 메모 수정
   *
   * @param customerId - 고객 ID
   * @param memoId - 메모 ID
   * @param content - 수정할 메모 내용
   * @returns 수정된 메모
   * @throws {Error} API 호출 실패 시
   */
  static async updateMemo(customerId: string, memoId: string, content: string): Promise<CustomerMemo> {
    if (!customerId || !memoId) {
      throw new Error('고객 ID와 메모 ID가 필요합니다');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('메모 내용을 입력해주세요');
    }

    try {
      const data = await api.put<MemoResponse>(
        `/api/customers/${customerId}/memos/${memoId}`,
        { content: content.trim() }
      );

      if (!data.success) {
        throw new Error(data.message || '메모 수정에 실패했습니다');
      }

      return data.data;
    } catch (error) {
      console.error('[MemoService] 메모 수정 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'MemoService.updateMemo', payload: { customerId, memoId } });

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('메모를 수정하는 중 오류가 발생했습니다');
    }
  }

  /**
   * 메모 삭제
   *
   * @param customerId - 고객 ID
   * @param memoId - 메모 ID
   * @throws {Error} API 호출 실패 시
   */
  static async deleteMemo(customerId: string, memoId: string): Promise<void> {
    if (!customerId || !memoId) {
      throw new Error('고객 ID와 메모 ID가 필요합니다');
    }

    try {
      const data = await api.delete<DeleteResponse>(
        `/api/customers/${customerId}/memos/${memoId}`
      );

      if (!data.success) {
        throw new Error(data.message || '메모 삭제에 실패했습니다');
      }
    } catch (error) {
      console.error('[MemoService] 메모 삭제 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'MemoService.deleteMemo', payload: { customerId, memoId } });

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('메모를 삭제하는 중 오류가 발생했습니다');
    }
  }
}

export default MemoService;
