/**
 * customerService.test.ts
 * @since 2025-10-14
 * @version 1.0.0
 *
 * CustomerService의 모든 메서드에 대한 종합 테스트
 * 총 42개 테스트 케이스 포함
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomerService } from '../customerService'
import { api } from '@/shared/lib/api'
import type { Customer, CreateCustomerData, UpdateCustomerData } from '@/entities/customer'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('CustomerService', () => {
  // ===== Mock Data Setup =====

  const mockCustomer: Customer = {
    _id: '507f1f77bcf86cd799439011',
    personal_info: {
      name: '홍길동',
      name_en: 'Hong Gildong',
      birth_date: '1990-01-01',
      gender: 'M',
      mobile_phone: '010-1234-5678',
      home_phone: '02-1234-5678',
      work_phone: '02-9876-5432',
      email: 'hong@example.com',
      address: {
        postal_code: '12345',
        address1: '서울특별시 강남구',
        address2: '테헤란로 123',
      },
    },
    insurance_info: {
      customer_type: '개인',
      risk_level: 'medium',
      annual_premium: 1200000,
      total_coverage: 100000000,
    },
    contracts: [],
    documents: [],
    consultations: [],
    meta: {
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-15T00:00:00.000Z',
      created_by: 'admin',
      last_modified_by: 'admin',
      status: 'active',
      original_name: null,
    },
    tags: ['VIP', '고액자산가'],
    segments: ['프리미엄'],
    labels: ['우수고객'],
    search_metadata: {},
  }

  const mockCustomer2: Customer = {
    _id: '507f1f77bcf86cd799439022',
    personal_info: {
      name: '김영희',
      birth_date: '1985-05-15',
      gender: 'F',
      mobile_phone: '010-9876-5432',
      email: 'kim@example.com',
    },
    insurance_info: {
      customer_type: '개인',
    },
    contracts: [],
    documents: [],
    consultations: [],
    meta: {
      created_at: '2025-01-10T00:00:00.000Z',
      updated_at: '2025-01-20T00:00:00.000Z',
      status: 'active',
    },
    tags: ['일반고객'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===== 1. getCustomers() - 고객 목록 조회 =====

  describe('getCustomers', () => {
    it('기본 파라미터로 고객 목록을 조회해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer, mockCustomer2],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          hasMore: false,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.getCustomers()

      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/customers?')
      )
      expect(result.customers).toHaveLength(2)
      expect(result.customers?.[0]?._id).toBe(mockCustomer._id)
    })

    it('검색 쿼리 파라미터를 URL에 포함해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer],
        pagination: {
          page: 2,
          limit: 10,
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      await CustomerService.getCustomers({
        page: 2,
        limit: 10,
        search: '홍길동',
        status: 'active',
      })

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/page=2/)
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/limit=10/)
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/search=%ED%99%8D%EA%B8%B8%EB%8F%99/) // URL-encoded '홍길동'
      )
    })

    it('{ success: true, data: {...} } 형식 응답을 올바르게 변환해야 함', async () => {
      const wrappedResponse = {
        success: true,
        data: {
          customers: [mockCustomer],
          pagination: {
            page: 1,
            total: 1,
          },
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(wrappedResponse)

      const result = await CustomerService.getCustomers()

      expect(result.customers).toHaveLength(1)
      expect(result.customers?.[0]?._id).toBe(mockCustomer._id)
    })

    it('빈 배열을 반환하는 경우를 처리해야 함', async () => {
      const mockResponse = {
        customers: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          hasMore: false,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.getCustomers()

      expect(result.customers).toHaveLength(0)
      expect(result.pagination?.total).toBe(0)
    })
  })

  // ===== 2. getCustomer() - 고객 상세 조회 =====

  describe('getCustomer', () => {
    it('ID로 고객 상세 정보를 조회해야 함', async () => {
      const mockResponse = {
        success: true,
        data: mockCustomer,
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.getCustomer('507f1f77bcf86cd799439011')

      expect(api.get).toHaveBeenCalledWith('/api/customers/507f1f77bcf86cd799439011')
      expect(result._id).toBe(mockCustomer._id)
      expect(result.personal_info.name).toBe('홍길동')
    })

    it('빈 ID에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.getCustomer('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.get).not.toHaveBeenCalled()
    })

    it('공백만 있는 ID에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.getCustomer('   ')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.get).not.toHaveBeenCalled()
    })

    it('success가 false인 응답에 대해 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(
        CustomerService.getCustomer('507f1f77bcf86cd799439011')
      ).rejects.toThrow('고객 정보를 가져올 수 없습니다')
    })

    it('data가 없는 응답에 대해 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: null,
      })

      await expect(
        CustomerService.getCustomer('507f1f77bcf86cd799439011')
      ).rejects.toThrow('고객 정보를 가져올 수 없습니다')
    })
  })

  // ===== 3. createCustomer() - 고객 생성 =====

  describe('createCustomer', () => {
    const validCreateData: CreateCustomerData = {
      personal_info: {
        name: '박철수',
        birth_date: '1992-03-20',
        gender: 'M',
        mobile_phone: '010-5555-6666',
        email: 'park@example.com',
      },
      insurance_info: {
        customer_type: '개인',
      },
      contracts: [],
      documents: [],
      consultations: [],
    }

    it('새 고객을 생성해야 함', async () => {
      const createdCustomer: Customer = {
        ...mockCustomer,
        _id: '507f1f77bcf86cd799439033',
        personal_info: validCreateData.personal_info,
      }

      vi.mocked(api.post).mockResolvedValueOnce(createdCustomer)

      const result = await CustomerService.createCustomer(validCreateData)

      expect(api.post).toHaveBeenCalledWith(
        '/api/customers',
        expect.objectContaining({
          personal_info: expect.objectContaining({
            name: '박철수',
          }),
        })
      )
      expect(result.personal_info.name).toBe('박철수')
    })

    it('최소 필수 정보만으로도 고객을 생성할 수 있어야 함', async () => {
      const minimalData: CreateCustomerData = {
        personal_info: {
          name: '최소정',
        },
        contracts: [],
        documents: [],
        consultations: [],
      }

      const createdCustomer: Customer = {
        ...mockCustomer,
        _id: '507f1f77bcf86cd799439044',
        personal_info: {
          name: '최소정',
        },
      }

      vi.mocked(api.post).mockResolvedValueOnce(createdCustomer)

      const result = await CustomerService.createCustomer(minimalData)

      expect(result.personal_info.name).toBe('최소정')
    })
  })

  // ===== 4. updateCustomer() - 고객 정보 수정 =====

  describe('updateCustomer', () => {
    const updateData: UpdateCustomerData = {
      personal_info: {
        mobile_phone: '010-9999-8888',
        email: 'newemail@example.com',
      },
    }

    it('고객 정보를 수정하고 최신 정보를 반환해야 함', async () => {
      const updatedCustomer: Customer = {
        ...mockCustomer,
        personal_info: {
          ...mockCustomer.personal_info,
          mobile_phone: '010-9999-8888',
          email: 'newemail@example.com',
        },
      }

      vi.mocked(api.put).mockResolvedValueOnce(undefined)
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: updatedCustomer,
      })

      const result = await CustomerService.updateCustomer(
        '507f1f77bcf86cd799439011',
        updateData
      )

      expect(api.put).toHaveBeenCalledWith(
        '/api/customers/507f1f77bcf86cd799439011',
        updateData
      )
      expect(api.get).toHaveBeenCalledWith(
        '/api/customers/507f1f77bcf86cd799439011'
      )
      expect(result.personal_info.mobile_phone).toBe('010-9999-8888')
    })

    it('빈 ID에 대해 에러를 던져야 함', async () => {
      await expect(
        CustomerService.updateCustomer('', updateData)
      ).rejects.toThrow('고객 ID가 필요합니다')
      expect(api.put).not.toHaveBeenCalled()
    })
  })

  // ===== 5. deleteCustomer() - 고객 삭제 =====

  describe('deleteCustomer', () => {
    it('고객을 삭제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce(undefined)

      await CustomerService.deleteCustomer('507f1f77bcf86cd799439011')

      expect(api.delete).toHaveBeenCalledWith(
        '/api/customers/507f1f77bcf86cd799439011'
      )
    })

    it('빈 ID에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.deleteCustomer('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })
  })

  // ===== 6. restoreCustomer() - 고객 복원 =====

  describe('restoreCustomer', () => {
    it('삭제된 고객을 복원해야 함', async () => {
      const restoredCustomer: Customer = {
        ...mockCustomer,
        meta: {
          ...mockCustomer.meta,
          status: 'active',
        },
      }

      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        data: restoredCustomer,
      })

      const result = await CustomerService.restoreCustomer('507f1f77bcf86cd799439011')

      expect(api.post).toHaveBeenCalledWith(
        '/api/customers/507f1f77bcf86cd799439011/restore',
        {}
      )
      expect(result.meta.status).toBe('active')
    })

    it('빈 ID에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.restoreCustomer('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.post).not.toHaveBeenCalled()
    })

    it('success가 false인 응답에 대해 에러를 던져야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      await expect(
        CustomerService.restoreCustomer('507f1f77bcf86cd799439011')
      ).rejects.toThrow('고객을 복원할 수 없습니다')
    })
  })

  // ===== 7. searchCustomers() - 고객 검색 =====

  describe('searchCustomers', () => {
    it('검색어로 고객을 검색해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer],
        pagination: {
          page: 1,
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.searchCustomers('홍길동')

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/search=%ED%99%8D%EA%B8%B8%EB%8F%99/)
      )
      expect(result.customers).toHaveLength(1)
    })

    it('빈 검색어인 경우 전체 목록을 반환해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer, mockCustomer2],
        pagination: {
          page: 1,
          total: 2,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.searchCustomers('')

      expect(result.customers).toHaveLength(2)
    })

    it('공백만 있는 검색어도 전체 목록을 반환해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer, mockCustomer2],
        pagination: {
          page: 1,
          total: 2,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.searchCustomers('   ')

      expect(result.customers).toHaveLength(2)
    })

    it('검색 옵션을 함께 전달할 수 있어야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer],
        pagination: {
          page: 2,
          limit: 10,
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      await CustomerService.searchCustomers('홍길동', {
        page: 2,
        limit: 10,
        customerType: '개인',
      })

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/page=2/)
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/limit=10/)
      )
    })
  })

  // ===== 8. getCustomersByTags() - 태그별 고객 조회 =====

  describe('getCustomersByTags', () => {
    it('특정 태그를 가진 고객을 조회해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer],
        pagination: {
          page: 1,
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      const result = await CustomerService.getCustomersByTags(['VIP'])

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/tags=VIP/)
      )
      expect(result.customers).toHaveLength(1)
    })

    it('여러 태그로 검색할 수 있어야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer],
        pagination: {
          page: 1,
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      await CustomerService.getCustomersByTags(['VIP', '고액자산가'])

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/tags=VIP/)
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/tags=%EA%B3%A0%EC%95%A1%EC%9E%90%EC%82%B0%EA%B0%80/)
      )
    })

    it('빈 태그 배열에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.getCustomersByTags([])).rejects.toThrow(
        '최소 하나의 태그가 필요합니다'
      )
      expect(api.get).not.toHaveBeenCalled()
    })

    it('공백 태그를 필터링해야 함', async () => {
      const mockResponse = {
        customers: [mockCustomer],
        pagination: {
          page: 1,
          total: 1,
        },
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse)

      await CustomerService.getCustomersByTags(['VIP', '   ', '고액자산가'])

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/tags=VIP/)
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/tags=%EA%B3%A0%EC%95%A1%EC%9E%90%EC%82%B0%EA%B0%80/)
      )
    })
  })

  // ===== 9. getCustomerTags() - 사용 중인 태그 조회 =====

  describe('getCustomerTags', () => {
    it('사용 중인 모든 태그를 반환해야 함', async () => {
      const mockTags = ['VIP', '일반고객', '고액자산가']

      vi.mocked(api.get).mockResolvedValueOnce(mockTags)

      const result = await CustomerService.getCustomerTags()

      expect(api.get).toHaveBeenCalledWith('/api/customers/tags')
      expect(result).toEqual(mockTags)
    })

    it('빈 배열을 처리해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce([])

      const result = await CustomerService.getCustomerTags()

      expect(result).toEqual([])
    })

    it('문자열이 아닌 항목을 필터링해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(['VIP', null, undefined, 123, 'valid'])

      const result = await CustomerService.getCustomerTags()

      expect(result).toEqual(['VIP', 'valid'])
    })

    it('배열이 아닌 응답에 대해 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ tags: ['VIP'] })

      await expect(CustomerService.getCustomerTags()).rejects.toThrow(
        'Invalid tags response format'
      )
    })
  })

  // ===== 10. getCustomerStats() - 고객 통계 조회 =====

  describe('getCustomerStats', () => {
    it('고객 통계를 반환해야 함', async () => {
      const mockStats = {
        total: 100,
        active: 90,
        inactive: 10,
        newThisMonth: 5,
        totalTags: 20,
        mostUsedTags: [
          { tag: 'VIP', count: 30 },
          { tag: '일반고객', count: 60 },
        ],
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockStats)

      const result = await CustomerService.getCustomerStats()

      expect(api.get).toHaveBeenCalledWith('/api/customers/stats')
      expect(result.total).toBe(100)
      expect(result.active).toBe(90)
      expect(result.mostUsedTags).toHaveLength(2)
    })

    it('숫자 필드를 올바르게 변환해야 함', async () => {
      const mockStats = {
        total: '100',
        active: '90',
        inactive: null,
        newThisMonth: undefined,
        totalTags: 20,
        mostUsedTags: [],
      }

      vi.mocked(api.get).mockResolvedValueOnce(mockStats)

      const result = await CustomerService.getCustomerStats()

      expect(result.total).toBe(100)
      expect(result.active).toBe(90)
      expect(result.inactive).toBe(0)
      expect(result.newThisMonth).toBe(0)
    })

    it('올바르지 않은 응답에 대해 에러를 던져야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(null)

      await expect(CustomerService.getCustomerStats()).rejects.toThrow(
        'Invalid stats response format'
      )
    })
  })

  // ===== 11. exportCustomers() - 고객 목록 내보내기 =====

  describe('exportCustomers', () => {
    it('CSV 형식으로 고객 목록을 내보내야 함', async () => {
      const mockBlob = new Blob(['customer,data'], { type: 'text/csv' })

      vi.mocked(api.get).mockResolvedValueOnce(mockBlob)

      const result = await CustomerService.exportCustomers('csv')

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/customers\/export/),
        expect.objectContaining({
          headers: {
            Accept: 'text/csv',
          },
        })
      )
      expect(result).toBeInstanceOf(Blob)
    })

    it('Excel 형식으로 고객 목록을 내보내야 함', async () => {
      const mockBlob = new Blob(['excel,data'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      vi.mocked(api.get).mockResolvedValueOnce(mockBlob)

      const result = await CustomerService.exportCustomers('excel')

      expect(api.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        })
      )
      expect(result).toBeInstanceOf(Blob)
    })

    it('검색 쿼리를 함께 전달할 수 있어야 함', async () => {
      const mockBlob = new Blob(['filtered,data'], { type: 'text/csv' })

      vi.mocked(api.get).mockResolvedValueOnce(mockBlob)

      await CustomerService.exportCustomers('csv', {
        search: '홍길동',
        status: 'active',
      })

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(/search=%ED%99%8D%EA%B8%B8%EB%8F%99/),
        expect.any(Object)
      )
    })
  })

  // ===== 12. importCustomers() - 고객 일괄 가져오기 =====

  describe('importCustomers', () => {
    it('파일을 업로드하여 고객을 가져와야 함', async () => {
      const mockFile = new File(['customer data'], 'customers.csv', {
        type: 'text/csv',
      })

      const mockResult = {
        success: 10,
        errors: [],
        total: 10,
      }

      vi.mocked(api.post).mockResolvedValueOnce(mockResult)

      const result = await CustomerService.importCustomers(mockFile)

      expect(api.post).toHaveBeenCalledWith(
        '/api/customers/import',
        expect.any(FormData)
      )
      expect(result.success).toBe(10)
      expect(result.total).toBe(10)
    })

    it('일부 실패한 가져오기 결과를 처리해야 함', async () => {
      const mockFile = new File(['customer data'], 'customers.csv', {
        type: 'text/csv',
      })

      const mockResult = {
        success: 8,
        errors: [
          { row: 3, error: 'Invalid email', data: {} },
          { row: 7, error: 'Duplicate phone', data: {} },
        ],
        total: 10,
      }

      vi.mocked(api.post).mockResolvedValueOnce(mockResult)

      const result = await CustomerService.importCustomers(mockFile)

      expect(result.success).toBe(8)
      expect(result.errors).toHaveLength(2)
      expect(result.total).toBe(10)
    })

    it('파일이 없는 경우 에러를 던져야 함', async () => {
      await expect(
        CustomerService.importCustomers(null as unknown as File)
      ).rejects.toThrow('파일이 필요합니다')
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  // ===== 13. deleteCustomers() - 고객 일괄 삭제 =====

  describe('deleteCustomers', () => {
    it('여러 고객을 동시에 삭제해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined)

      await CustomerService.deleteCustomers([
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      ])

      expect(api.delete).toHaveBeenCalledTimes(2)
      expect(api.delete).toHaveBeenCalledWith('/api/customers/507f1f77bcf86cd799439011')
      expect(api.delete).toHaveBeenCalledWith('/api/customers/507f1f77bcf86cd799439022')
    })

    it('빈 배열에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.deleteCustomers([])).rejects.toThrow(
        '삭제할 고객 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })
  })

  // ===== 14. restoreCustomers() - 고객 일괄 복원 =====

  describe('restoreCustomers', () => {
    it('여러 고객을 동시에 복원해야 함', async () => {
      const restoredCustomer1 = { ...mockCustomer, _id: '507f1f77bcf86cd799439011' }
      const restoredCustomer2 = { ...mockCustomer2, _id: '507f1f77bcf86cd799439022' }

      vi.mocked(api.post)
        .mockResolvedValueOnce({ success: true, data: restoredCustomer1 })
        .mockResolvedValueOnce({ success: true, data: restoredCustomer2 })

      const result = await CustomerService.restoreCustomers([
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      ])

      expect(api.post).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
      expect(result[0]?._id).toBe('507f1f77bcf86cd799439011')
      expect(result[1]?._id).toBe('507f1f77bcf86cd799439022')
    })

    it('빈 배열에 대해 에러를 던져야 함', async () => {
      await expect(CustomerService.restoreCustomers([])).rejects.toThrow(
        '복원할 고객 ID가 필요합니다'
      )
      expect(api.post).not.toHaveBeenCalled()
    })
  })
})
