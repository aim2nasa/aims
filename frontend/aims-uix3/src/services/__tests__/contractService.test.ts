/**
 * contractService.test.ts
 * @since 2025-12-07
 * @version 1.0.0
 *
 * ContractService의 모든 메서드에 대한 종합 테스트
 * - getContracts: 계약 목록 조회
 * - getContract: 계약 상세 조회
 * - createContract: 계약 생성
 * - createContractsBulk: 계약 일괄 생성
 * - updateContract: 계약 수정
 * - deleteContract: 계약 삭제
 * - deleteContracts: 계약 일괄 삭제
 * - getContractsByCustomer: 특정 고객의 계약 조회
 * - getContractsByAgent: 특정 설계사의 계약 조회
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContractService } from '../contractService'
import { api } from '@/shared/lib/api'
import type { Contract, CreateContractData, UpdateContractData, ContractListResponse, BulkCreateResponse } from '@/entities/contract'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

// ==================== Mock Data ====================

const createMockContract = (overrides: Partial<Contract> = {}): Contract => ({
  _id: 'contract-001',
  agent_id: 'agent-001',
  customer_id: 'customer-001',
  insurer_id: null,
  product_id: 'product-001',
  customer_name: '홍길동',
  product_name: '종신보험',
  contract_date: '2025-01-01',
  policy_number: 'POL-001',
  premium: 100000,
  payment_day: '15일',
  payment_cycle: '월납',
  payment_period: '20년',
  insured_person: '홍길동',
  payment_status: '정상',
  meta: {
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-15T00:00:00.000Z',
    source: 'manual',
  },
  ...overrides,
})

const mockContract1 = createMockContract()
const mockContract2 = createMockContract({
  _id: 'contract-002',
  customer_name: '김영희',
  product_name: '암보험',
  policy_number: 'POL-002',
  premium: 50000,
})

const mockContractListResponse: ContractListResponse = {
  success: true,
  data: [mockContract1, mockContract2],
  total: 2,
  limit: 1000,
  skip: 0,
}

// ==================== Tests ====================

describe('ContractService', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>
  let dispatchedEvents: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    dispatchedEvents = []

    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      if (event instanceof CustomEvent) {
        dispatchedEvents.push(event.type)
      }
      return true
    })
  })

  afterEach(() => {
    dispatchEventSpy.mockRestore()
  })

  // ===== getContracts =====

  describe('getContracts', () => {
    it('기본 파라미터로 계약 목록을 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockContractListResponse)

      const result = await ContractService.getContracts()

      expect(api.get).toHaveBeenCalledWith('/api/contracts?')
      expect(result.data).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('검색 쿼리 파라미터가 URL에 포함되어야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockContractListResponse)

      await ContractService.getContracts({
        customer_id: 'customer-001',
        search: '홍길동',
        limit: 50,
      })

      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('customer_id=customer-001')
      )
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search='))
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('limit=50'))
    })

    it('빈 결과를 처리해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: [],
        total: 0,
        limit: 1000,
        skip: 0,
      })

      const result = await ContractService.getContracts()

      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('null/undefined 값은 쿼리 파라미터에서 제외되어야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockContractListResponse)

      await ContractService.getContracts({
        customer_id: undefined,
        search: null as unknown as string,
        limit: 100,
      })

      const calledUrl = vi.mocked(api.get).mock.calls[0][0]
      expect(calledUrl).not.toContain('customer_id')
      expect(calledUrl).not.toContain('search')
      expect(calledUrl).toContain('limit=100')
    })
  })

  // ===== getContract =====

  describe('getContract', () => {
    it('계약 상세 정보를 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: mockContract1,
      })

      const result = await ContractService.getContract('contract-001')

      expect(api.get).toHaveBeenCalledWith('/api/contracts/contract-001')
      expect(result._id).toBe('contract-001')
      expect(result.customer_name).toBe('홍길동')
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(ContractService.getContract('')).rejects.toThrow('계약 ID가 필요합니다')
      expect(api.get).not.toHaveBeenCalled()
    })

    it('공백만 있는 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(ContractService.getContract('   ')).rejects.toThrow('계약 ID가 필요합니다')
    })

    it('success가 false인 응답 시 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(ContractService.getContract('contract-001')).rejects.toThrow(
        '계약 정보를 가져올 수 없습니다'
      )
    })

    it('data가 없는 응답 시 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: null,
      })

      await expect(ContractService.getContract('contract-001')).rejects.toThrow(
        '계약 정보를 가져올 수 없습니다'
      )
    })
  })

  // ===== createContract =====

  describe('createContract', () => {
    const createData: CreateContractData = {
      agent_id: 'agent-001',
      customer_name: '신규고객',
      product_name: '새상품',
      policy_number: 'POL-NEW-001',
      premium: 75000,
    }

    it('계약을 생성해야 함', async () => {
      const newContract = createMockContract({
        _id: 'contract-new',
        customer_name: '신규고객',
        product_name: '새상품',
        policy_number: 'POL-NEW-001',
      })

      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        data: newContract,
      })

      const result = await ContractService.createContract(createData)

      expect(api.post).toHaveBeenCalledWith('/api/contracts', expect.any(Object))
      expect(result.customer_name).toBe('신규고객')
    })

    it('success가 false인 응답 시 에러를 던져야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: false,
        message: '중복된 증권번호입니다',
      })

      await expect(ContractService.createContract(createData)).rejects.toThrow(
        '중복된 증권번호입니다'
      )
    })

    it('메시지 없이 success가 false인 경우 기본 에러 메시지를 던져야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: false,
      })

      await expect(ContractService.createContract(createData)).rejects.toThrow(
        '계약 생성에 실패했습니다'
      )
    })
  })

  // ===== createContractsBulk =====

  describe('createContractsBulk', () => {
    const bulkData = {
      agent_id: 'agent-001',
      contracts: [
        {
          customer_name: '고객1',
          product_name: '상품1',
          policy_number: 'POL-B-001',
          premium: 10000,
        },
        {
          customer_name: '고객2',
          product_name: '상품2',
          policy_number: 'POL-B-002',
          premium: 20000,
        },
      ],
    }

    it('계약을 일괄 생성해야 함', async () => {
      const bulkResponse: BulkCreateResponse = {
        success: true,
        message: '2건 등록 완료',
        data: {
          createdCount: 2,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: 0,
        },
      }

      vi.mocked(api.post).mockResolvedValueOnce(bulkResponse)

      const result = await ContractService.createContractsBulk(bulkData)

      expect(api.post).toHaveBeenCalledWith('/api/contracts/bulk', bulkData)
      expect(result.data.createdCount).toBe(2)
    })

    it('일부 실패 결과를 반환해야 함', async () => {
      const bulkResponse: BulkCreateResponse = {
        success: true,
        message: '1건 등록, 1건 실패',
        data: {
          createdCount: 1,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: 1,
          errors: [
            {
              customer_name: '고객2',
              policy_number: 'POL-B-002',
              reason: '중복된 증권번호',
            },
          ],
        },
      }

      vi.mocked(api.post).mockResolvedValueOnce(bulkResponse)

      const result = await ContractService.createContractsBulk(bulkData)

      expect(result.data.errorCount).toBe(1)
      expect(result.data.errors).toHaveLength(1)
    })
  })

  // ===== updateContract =====

  describe('updateContract', () => {
    const updateData: UpdateContractData = {
      premium: 150000,
      payment_status: '완납',
    }

    it('계약을 수정해야 함', async () => {
      vi.mocked(api.put).mockResolvedValueOnce({
        success: true,
      })

      await ContractService.updateContract('contract-001', updateData)

      expect(api.put).toHaveBeenCalledWith(
        '/api/contracts/contract-001',
        expect.any(Object)
      )
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(ContractService.updateContract('', updateData)).rejects.toThrow(
        '계약 ID가 필요합니다'
      )
      expect(api.put).not.toHaveBeenCalled()
    })

    it('success가 false인 응답 시 에러를 던져야 함', async () => {
      vi.mocked(api.put).mockResolvedValueOnce({
        success: false,
        message: '수정 권한이 없습니다',
      })

      await expect(
        ContractService.updateContract('contract-001', updateData)
      ).rejects.toThrow('수정 권한이 없습니다')
    })

    it('메시지 없이 success가 false인 경우 기본 에러 메시지를 던져야 함', async () => {
      vi.mocked(api.put).mockResolvedValueOnce({
        success: false,
      })

      await expect(
        ContractService.updateContract('contract-001', updateData)
      ).rejects.toThrow('계약 수정에 실패했습니다')
    })
  })

  // ===== deleteContract =====

  describe('deleteContract', () => {
    it('계약을 삭제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
      })

      await ContractService.deleteContract('contract-001')

      expect(api.delete).toHaveBeenCalledWith('/api/contracts/contract-001')
    })

    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(ContractService.deleteContract('')).rejects.toThrow(
        '계약 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('success가 false인 응답 시 에러를 던져야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: false,
        message: '삭제 권한이 없습니다',
      })

      await expect(ContractService.deleteContract('contract-001')).rejects.toThrow(
        '삭제 권한이 없습니다'
      )
    })

    it('삭제 성공 시 contractChanged 이벤트가 발생해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
      })

      await ContractService.deleteContract('contract-001')

      expect(dispatchedEvents).toContain('contractChanged')
    })

    it('삭제 실패 시 이벤트가 발생하지 않아야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: false,
        message: '실패',
      })

      try {
        await ContractService.deleteContract('contract-001')
      } catch {
        // 에러 무시
      }

      expect(dispatchedEvents).not.toContain('contractChanged')
    })
  })

  // ===== deleteContracts =====

  describe('deleteContracts', () => {
    it('여러 계약을 삭제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValue({
        success: true,
      })

      const result = await ContractService.deleteContracts(['contract-001', 'contract-002'])

      expect(api.delete).toHaveBeenCalledTimes(2)
      expect(result.deletedCount).toBe(2)
    })

    it('빈 배열로 호출 시 에러를 던져야 함', async () => {
      await expect(ContractService.deleteContracts([])).rejects.toThrow(
        '삭제할 계약 ID 목록이 필요합니다'
      )
    })

    it('각 삭제에 대해 contractChanged 이벤트가 발생해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValue({
        success: true,
      })

      await ContractService.deleteContracts(['contract-001', 'contract-002', 'contract-003'])

      expect(dispatchedEvents.filter((e) => e === 'contractChanged')).toHaveLength(3)
    })
  })

  // ===== deleteAllContracts =====

  describe('deleteAllContracts', () => {
    it('모든 계약을 삭제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedCount: 50,
      })

      const result = await ContractService.deleteAllContracts()

      expect(api.delete).toHaveBeenCalledWith('/api/dev/contracts/all')
      expect(result.deletedCount).toBe(50)
    })
  })

  // ===== getContractsByCustomer =====

  describe('getContractsByCustomer', () => {
    it('특정 고객의 계약을 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: [mockContract1],
        total: 1,
        limit: 1000,
        skip: 0,
      })

      const result = await ContractService.getContractsByCustomer('customer-001')

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('customer_id=customer-001'))
      expect(result).toHaveLength(1)
      expect(result[0].customer_name).toBe('홍길동')
    })
  })

  // ===== getContractsByAgent =====

  describe('getContractsByAgent', () => {
    it('특정 설계사의 계약을 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: [mockContract1, mockContract2],
        total: 2,
        limit: 1000,
        skip: 0,
      })

      const result = await ContractService.getContractsByAgent('agent-001')

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('agent_id=agent-001'))
      expect(result).toHaveLength(2)
    })
  })
})
