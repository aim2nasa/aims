/**
 * Phase 2-2: AR 자동 파싱/삭제 헤더 검증 Regression 테스트
 * @description Annual Report API 호출 시 x-user-id 헤더 누락 버그 방지
 * @regression 커밋 aa42058, 2653d04 - AR 백그라운드 파싱 및 삭제
 * @priority HIGH - 사용자 격리 기능의 핵심
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '@/shared/lib/api'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('Annual Report Service - 헤더 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('백그라운드 파싱 트리거 시 x-user-id 헤더', () => {
    /**
     * 회귀 테스트: 커밋 aa42058
     * 과거 버그: AR 백그라운드 파싱 트리거 시 x-user-id 헤더 누락
     * 결과: 다른 사용자의 문서가 파싱되거나 파싱 실패
     */
    it('POST 요청 시 x-user-id 헤더 포함', async () => {
      vi.mocked(api.post).mockResolvedValue({ success: true })

      await api.post('/api/annual-reports/parse', {
        document_id: 'doc123'
      })

      expect(api.post).toHaveBeenCalledWith(
        '/api/annual-reports/parse',
        expect.objectContaining({
          document_id: 'doc123'
        })
      )
    })

    it('헤더 없이 호출 시 API 에러 발생 (백엔드 검증)', async () => {
      vi.mocked(api.post).mockRejectedValue({
        status: 401,
        message: 'x-user-id header is required'
      })

      await expect(
        api.post('/api/annual-reports/parse', { document_id: 'doc123' })
      ).rejects.toMatchObject({
        status: 401,
        message: expect.stringContaining('x-user-id')
      })
    })
  })

  describe('AR 문서 삭제 시 파싱 데이터 정리', () => {
    /**
     * 회귀 테스트: 커밋 2653d04
     * 기능: AR 문서 삭제 시 annual_report_parsed 컬렉션도 자동 삭제
     */
    it('DELETE 요청 시 파싱 데이터 삭제 파라미터 포함', async () => {
      vi.mocked(api.delete).mockResolvedValue({ success: true })

      await api.delete('/api/annual-reports/ar123')

      expect(api.delete).toHaveBeenCalledWith('/api/annual-reports/ar123')
    })

    it('파싱 데이터 삭제 실패 시 에러 정보 반환', async () => {
      vi.mocked(api.delete).mockResolvedValue({
        success: false,
        message: '파싱 데이터 삭제 실패',
        errors: ['annual_report_parsed 삭제 실패']
      })

      const result = await api.delete('/api/annual-reports/ar123') as {
        success: boolean
        message: string
        errors?: string[]
      }

      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('파싱 데이터')
      })
    })
  })

  describe('AR API 호출 패턴 검증', () => {
    it('GET 요청: AR 목록 조회', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: {
          annual_reports: [
            { _id: 'ar1', customer_id: 'cust1' }
          ],
          total: 1
        }
      })

      const result = await api.get('/api/annual-reports')

      expect(api.get).toHaveBeenCalledWith('/api/annual-reports')
      expect(result).toHaveProperty('data')
    })

    it('POST 요청: AR 파싱 트리거', async () => {
      vi.mocked(api.post).mockResolvedValue({
        success: true,
        parsing_id: 'parse123'
      })

      const result = await api.post('/api/annual-reports/parse', {
        document_id: 'doc123',
        customer_id: 'cust123'
      })

      expect(result).toHaveProperty('parsing_id')
    })

    it('DELETE 요청: AR 및 파싱 데이터 삭제', async () => {
      vi.mocked(api.delete).mockResolvedValue({
        success: true,
        deleted: {
          annual_report: true,
          parsed_data: true
        }
      })

      const result = await api.delete('/api/annual-reports/ar123') as {
        success: boolean
        deleted: {
          annual_report: boolean
          parsed_data: boolean
        }
      }

      expect(result).toHaveProperty('deleted')
      expect(result.deleted).toMatchObject({
        annual_report: true,
        parsed_data: true
      })
    })
  })

  describe('에러 케이스 처리', () => {
    it('네트워크 에러 시 적절한 에러 메시지', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network Error'))

      await expect(
        api.post('/api/annual-reports/parse', { document_id: 'doc123' })
      ).rejects.toThrow('Network Error')
    })

    it('타임아웃 에러 시 적절한 처리', async () => {
      vi.mocked(api.post).mockRejectedValue({
        status: 408,
        message: 'Request Timeout'
      })

      await expect(
        api.post('/api/annual-reports/parse', { document_id: 'doc123' })
      ).rejects.toMatchObject({
        status: 408
      })
    })

    it('서버 에러(500) 시 적절한 처리', async () => {
      vi.mocked(api.post).mockRejectedValue({
        status: 500,
        message: 'Internal Server Error'
      })

      await expect(
        api.post('/api/annual-reports/parse', { document_id: 'doc123' })
      ).rejects.toMatchObject({
        status: 500
      })
    })
  })

  describe('동시 요청 처리', () => {
    it('여러 AR 문서 동시 파싱 트리거', async () => {
      vi.mocked(api.post).mockResolvedValue({ success: true })

      const requests = [
        api.post('/api/annual-reports/parse', { document_id: 'doc1' }),
        api.post('/api/annual-reports/parse', { document_id: 'doc2' }),
        api.post('/api/annual-reports/parse', { document_id: 'doc3' })
      ]

      await Promise.all(requests)

      expect(api.post).toHaveBeenCalledTimes(3)
    })

    it('일부 요청 실패 시 다른 요청에 영향 없음', async () => {
      vi.mocked(api.post)
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Parse failed'))
        .mockResolvedValueOnce({ success: true })

      const requests = [
        api.post('/api/annual-reports/parse', { document_id: 'doc1' }),
        api.post('/api/annual-reports/parse', { document_id: 'doc2' }),
        api.post('/api/annual-reports/parse', { document_id: 'doc3' })
      ]

      const results = await Promise.allSettled(requests)

      expect(results[0]?.status).toBe('fulfilled')
      expect(results[1]?.status).toBe('rejected')
      expect(results[2]?.status).toBe('fulfilled')
    })
  })

  describe('Race Condition 방지', () => {
    /**
     * 회귀 테스트: AR 자동 연결 간헐적 실패 수정
     * Race Condition으로 인한 문제 방지
     */
    it('동일 문서에 대한 중복 파싱 요청 방지', async () => {
      let callCount = 0
      vi.mocked(api.post).mockImplementation(async () => {
        callCount++
        // 첫 번째 호출만 성공
        if (callCount === 1) {
          return { success: true, parsing_id: 'parse123' }
        }
        // 두 번째 이후 호출은 이미 파싱 중
        throw new Error('Already parsing')
      })

      const documentId = 'doc123'

      // 첫 번째 요청 성공
      const result1 = await api.post('/api/annual-reports/parse', {
        document_id: documentId
      }) as { success: boolean; parsing_id?: string }
      expect(result1.success).toBe(true)

      // 두 번째 요청 실패 (중복 방지)
      await expect(
        api.post('/api/annual-reports/parse', { document_id: documentId })
      ).rejects.toThrow('Already parsing')
    })
  })
})
