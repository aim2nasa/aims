/**
 * DocumentService.deleteAllDocuments 테스트
 * 고객 필터에 따른 삭제 범위 검증
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentService } from '../DocumentService'
import { api } from '@/shared/lib/api'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  getAuthToken: vi.fn().mockReturnValue('test-token'),
}))

describe('DocumentService.deleteAllDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('customerId 없이 호출하면 전체 삭제 URL로 요청한다', async () => {
    const mockResponse = { success: true, deletedCount: 10 }
    vi.mocked(api.delete).mockResolvedValue(mockResponse)

    const result = await DocumentService.deleteAllDocuments()

    expect(api.delete).toHaveBeenCalledWith('/api/dev/documents/all')
    expect(result.deletedCount).toBe(10)
  })

  it('customerId를 전달하면 쿼리 파라미터로 포함한다', async () => {
    const mockResponse = { success: true, deletedCount: 3 }
    vi.mocked(api.delete).mockResolvedValue(mockResponse)
    const customerId = '69ae12aff0e011bda4cbffc3'

    const result = await DocumentService.deleteAllDocuments(customerId)

    expect(api.delete).toHaveBeenCalledWith(
      `/api/dev/documents/all?customerId=${customerId}`
    )
    expect(result.deletedCount).toBe(3)
  })

  it('customerId에 특수문자가 있으면 인코딩한다', async () => {
    const mockResponse = { success: true, deletedCount: 0 }
    vi.mocked(api.delete).mockResolvedValue(mockResponse)
    const weirdId = 'abc/def&ghi'

    await DocumentService.deleteAllDocuments(weirdId)

    expect(api.delete).toHaveBeenCalledWith(
      `/api/dev/documents/all?customerId=${encodeURIComponent(weirdId)}`
    )
  })

  it('undefined를 전달하면 전체 삭제 URL로 요청한다', async () => {
    const mockResponse = { success: true, deletedCount: 5 }
    vi.mocked(api.delete).mockResolvedValue(mockResponse)

    await DocumentService.deleteAllDocuments(undefined)

    expect(api.delete).toHaveBeenCalledWith('/api/dev/documents/all')
  })
})
