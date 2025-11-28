/**
 * AIMS UIX-3 Contract Service Layer
 * @since 2025-11-26
 * @version 1.0.0
 *
 * 계약 관련 비즈니스 로직 및 API 호출을 담당하는 서비스 레이어
 * CustomerService 패턴을 따름
 */

import { api } from '@/shared/lib/api';
import {
  Contract,
  CreateContractData,
  UpdateContractData,
  ContractSearchQuery,
  ContractListResponse,
  BulkCreateContractsData,
  BulkCreateResponse,
  ContractUtils,
} from '@/entities/contract';

/**
 * 계약 API 엔드포인트
 */
const ENDPOINTS = {
  CONTRACTS: '/api/contracts',
  CONTRACT: (id: string) => `/api/contracts/${id}`,
  CONTRACTS_BULK: '/api/contracts/bulk',
} as const;

/**
 * 계약 서비스 클래스
 * 모든 계약 관련 비즈니스 로직과 API 호출을 중앙화
 */
export class ContractService {
  /**
   * 계약 목록 조회
   */
  static async getContracts(
    query: Partial<ContractSearchQuery> = {}
  ): Promise<ContractListResponse> {
    // URL 파라미터 구성
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });

    const response = await api.get<ContractListResponse>(
      `${ENDPOINTS.CONTRACTS}?${params.toString()}`
    );

    if (import.meta.env.DEV) {
      console.log('[ContractService.getContracts] API response:', response);
    }

    return response;
  }

  /**
   * 계약 상세 조회
   */
  static async getContract(id: string): Promise<Contract> {
    if (!id.trim()) {
      throw new Error('계약 ID가 필요합니다');
    }

    const response = await api.get<{ success: boolean; data: unknown }>(
      ENDPOINTS.CONTRACT(id)
    );

    if (!response.success || !response.data) {
      throw new Error('계약 정보를 가져올 수 없습니다');
    }

    return ContractUtils.validate(response.data);
  }

  /**
   * 계약 생성
   */
  static async createContract(data: CreateContractData): Promise<Contract> {
    // 생성 데이터 검증
    const validatedData = ContractUtils.validateCreateData(data);

    const response = await api.post<{ success: boolean; data: unknown; message?: string }>(
      ENDPOINTS.CONTRACTS,
      validatedData
    );

    if (!response.success) {
      throw new Error(response.message || '계약 생성에 실패했습니다');
    }

    return ContractUtils.validate(response.data);
  }

  /**
   * 계약 일괄 생성 (Excel Import용)
   */
  static async createContractsBulk(data: BulkCreateContractsData): Promise<BulkCreateResponse> {
    const response = await api.post<BulkCreateResponse>(
      ENDPOINTS.CONTRACTS_BULK,
      data
    );

    if (import.meta.env.DEV) {
      console.log('[ContractService.createContractsBulk] API response:', response);
    }

    return response;
  }

  /**
   * 계약 수정
   */
  static async updateContract(id: string, data: UpdateContractData): Promise<void> {
    if (!id.trim()) {
      throw new Error('계약 ID가 필요합니다');
    }

    // 수정 데이터 검증
    const validatedData = ContractUtils.validateUpdateData(data);

    const response = await api.put<{ success: boolean; message?: string }>(
      ENDPOINTS.CONTRACT(id),
      validatedData
    );

    if (!response.success) {
      throw new Error(response.message || '계약 수정에 실패했습니다');
    }
  }

  /**
   * 계약 삭제
   */
  static async deleteContract(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('계약 ID가 필요합니다');
    }

    const response = await api.delete<{ success: boolean; message?: string }>(
      ENDPOINTS.CONTRACT(id)
    );

    if (!response.success) {
      throw new Error(response.message || '계약 삭제에 실패했습니다');
    }

    // contractChanged 이벤트 발생 (대시보드 등 다른 View 동기화)
    window.dispatchEvent(new CustomEvent('contractChanged'));
    if (import.meta.env.DEV) {
      console.log('[ContractService.deleteContract] contractChanged 이벤트 발생');
    }
  }

  /**
   * 계약 일괄 삭제
   */
  static async deleteContracts(ids: string[]): Promise<{ deletedCount: number }> {
    if (!ids.length) {
      throw new Error('삭제할 계약 ID 목록이 필요합니다');
    }

    // 병렬로 삭제 처리
    await Promise.all(ids.map(id => this.deleteContract(id)));
    return { deletedCount: ids.length };
  }

  /**
   * 개발 환경 전용: 모든 계약 삭제
   * 주의: 개발 환경에서만 사용!
   */
  static async deleteAllContracts(): Promise<{ deletedCount: number }> {
    const response = await api.delete<{ success: boolean; deletedCount: number }>('/api/dev/contracts/all');
    return { deletedCount: response.deletedCount };
  }

  /**
   * 특정 고객의 계약 목록 조회
   */
  static async getContractsByCustomer(customerId: string): Promise<Contract[]> {
    const response = await this.getContracts({ customer_id: customerId });
    return response.data;
  }

  /**
   * 특정 설계사의 계약 목록 조회
   */
  static async getContractsByAgent(agentId: string): Promise<Contract[]> {
    const response = await this.getContracts({ agent_id: agentId });
    return response.data;
  }
}
