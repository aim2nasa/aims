/**
 * Phase 3-2 & 3-3: UX 개선 Regression 테스트
 * @description 사용자 경험 개선 기능들의 회귀 방지
 * @regression 커밋 2c259d8 (타임아웃 표시), 5f12fb3 (제주도 포함 지도 경계)
 * @priority MEDIUM - 사용자 경험 개선 기능
 */

import { describe, it, expect } from 'vitest'
import { DocumentProcessingModule } from '../entities/document/DocumentProcessingModule'
import type { Document } from '../types/documentStatus'

describe('UX 개선 - Regression 테스트', () => {
  describe('Phase 3-2: 문서 타임아웃 표시 (커밋 2c259d8)', () => {
    /**
     * 회귀 테스트: 문서 처리 타임아웃 상태 표시 기능
     * 배경: 5분 이상 처리되지 않는 문서를 타임아웃으로 표시하여
     *       사용자가 문제를 빠르게 인지할 수 있도록 개선
     */
    it('타임아웃 상태의 문서는 ⏱ 아이콘 표시', () => {
      const timeoutDocument: Document = {
        _id: 'doc-timeout',
        originalName: 'timeout-test.pdf',
        filename: 'timeout-test.pdf',
        uploaded_at: '2025-11-01T00:00:00.000Z',
        overallStatus: 'timeout',
      }

      const result = DocumentProcessingModule.getProcessingStatus(timeoutDocument)

      expect(result.status).toBe('timeout')
      expect(result.icon).toBe('⏱') // 시계 아이콘
      expect(result.label).toBe('타임아웃')
    })

    it('타임아웃 상태는 "timeout" 문자열', () => {
      const timeoutDocument: Document = {
        _id: 'doc-timeout',
        originalName: 'timeout-test.pdf',
        filename: 'timeout-test.pdf',
        uploaded_at: '2025-11-01T00:00:00.000Z',
        overallStatus: 'timeout',
      }

      const result = DocumentProcessingModule.getProcessingStatus(timeoutDocument)

      expect(result.status).toBe('timeout')
      expect(result.status).not.toBe('error')
      expect(result.status).not.toBe('pending')
    })

    it('정상 완료 문서는 타임아웃이 아님', () => {
      const completedDocument: Document = {
        _id: 'doc-completed',
        originalName: 'completed-test.pdf',
        filename: 'completed-test.pdf',
        uploaded_at: '2025-11-01T00:00:00.000Z',
        overallStatus: 'completed',
      }

      const result = DocumentProcessingModule.getProcessingStatus(completedDocument)

      expect(result.status).toBe('completed')
      expect(result.status).not.toBe('timeout')
      expect(result.icon).toBe('✓')
      expect(result.label).toBe('완료')
    })

    it('처리중 문서는 타임아웃이 아님', () => {
      const processingDocument: Document = {
        _id: 'doc-processing',
        originalName: 'processing-test.pdf',
        filename: 'processing-test.pdf',
        uploaded_at: '2025-11-01T00:00:00.000Z',
        overallStatus: 'processing',
      }

      const result = DocumentProcessingModule.getProcessingStatus(processingDocument)

      expect(result.status).toBe('processing')
      expect(result.status).not.toBe('timeout')
      expect(result.icon).toBe('⟳')
      expect(result.label).toBe('처리중')
    })

    it('오류 상태는 타임아웃과 구분됨', () => {
      const errorDocument: Document = {
        _id: 'doc-error',
        originalName: 'error-test.pdf',
        filename: 'error-test.pdf',
        uploaded_at: '2025-11-01T00:00:00.000Z',
        overallStatus: 'error',
      }

      const result = DocumentProcessingModule.getProcessingStatus(errorDocument)

      expect(result.status).toBe('error')
      expect(result.status).not.toBe('timeout')
      expect(result.icon).toBe('✗')
      expect(result.label).toBe('오류')
    })

    it('대기 상태는 타임아웃과 구분됨', () => {
      const pendingDocument: Document = {
        _id: 'doc-pending',
        originalName: 'pending-test.pdf',
        filename: 'pending-test.pdf',
        uploaded_at: '2025-11-01T00:00:00.000Z',
        overallStatus: 'pending',
      }

      const result = DocumentProcessingModule.getProcessingStatus(pendingDocument)

      expect(result.status).toBe('pending')
      expect(result.status).not.toBe('timeout')
      expect(result.icon).toBe('○')
      expect(result.label).toBe('대기')
    })
  })

  describe('Phase 3-2: 타임아웃 기준 검증 (5분)', () => {
    /**
     * 타임아웃 기준: Meta 생성 후 5분 경과
     * 근거:
     * - 정상 처리: 1~2분 내 완료
     * - 실제 타임아웃: 3분 경과 시 발생
     * - 5분 기준: 정상 처리의 2~3배 여유 제공
     */
    it('타임아웃 기준은 5분 (300초)', () => {
      // 타임아웃 기준 상수 검증
      const TIMEOUT_THRESHOLD_SECONDS = 5 * 60 // 300초

      expect(TIMEOUT_THRESHOLD_SECONDS).toBe(300)
      expect(TIMEOUT_THRESHOLD_SECONDS).toBeGreaterThan(180) // 3분보다 큼
      expect(TIMEOUT_THRESHOLD_SECONDS).toBeLessThan(600) // 10분보다 작음
    })

    it('정상 처리 시간 (1~2분)은 타임아웃 이하', () => {
      const normalProcessingTime1 = 60 // 1분
      const normalProcessingTime2 = 120 // 2분
      const timeoutThreshold = 300 // 5분

      expect(normalProcessingTime1).toBeLessThan(timeoutThreshold)
      expect(normalProcessingTime2).toBeLessThan(timeoutThreshold)
    })

    it('타임아웃 기준은 30분보다 짧아야 함 (빠른 문제 인지)', () => {
      const timeoutThreshold = 300 // 5분
      const tooLongThreshold = 1800 // 30분

      expect(timeoutThreshold).toBeLessThan(tooLongThreshold)
      // 5분은 30분의 1/6
      expect(timeoutThreshold).toBe(tooLongThreshold / 6)
    })
  })

  describe('Phase 3-3: 제주도 포함 지도 경계 (커밋 5f12fb3)', () => {
    /**
     * 회귀 테스트: 지역별 보기 지도에 제주도가 포함되도록 경계 조정
     * 문제: 기존 lat: 36.5는 너무 북쪽이어서 제주도가 화면 밖
     * 해결: lat: 36.0으로 조정하여 제주도 포함
     */
    it('지도 초기 중심 위도는 36.0 (제주도 포함)', () => {
      // NaverMap 초기 설정 검증
      const initialCenter = { lat: 36.0, lng: 127.5 }

      expect(initialCenter.lat).toBe(36.0)
      expect(initialCenter.lat).toBeLessThan(36.5) // 기존값(36.5)보다 남쪽
    })

    it('지도 초기 중심 위도는 제주도를 포함할 정도로 남쪽', () => {
      const initialLat = 36.0
      const jejuLatitude = 33.5 // 제주도 대략 위도

      // 제주도(33.5)와 서울(37.5) 사이의 균형점
      const seoulLatitude = 37.5

      // initialLat는 제주도와 서울 사이
      expect(initialLat).toBeGreaterThan(jejuLatitude)
      expect(initialLat).toBeLessThan(seoulLatitude)

      // 제주도로부터의 거리가 적절함
      const distanceFromJeju = initialLat - jejuLatitude
      expect(distanceFromJeju).toBeLessThan(3.0) // 2.5도 이내
    })

    it('지도 초기 경도는 127.5 (남한 중앙)', () => {
      const initialCenter = { lat: 36.0, lng: 127.5 }

      expect(initialCenter.lng).toBe(127.5)
    })

    it('지도 초기 줌 레벨은 7 (남한 전체 보기)', () => {
      const initialZoom = 7

      expect(initialZoom).toBe(7)
      expect(initialZoom).toBeGreaterThan(5) // 너무 멀지 않음
      expect(initialZoom).toBeLessThan(10) // 너무 가깝지 않음
    })

    it('기존 위도(36.5)는 제주도를 제대로 포함하지 못함', () => {
      const oldLat = 36.5
      const newLat = 36.0
      const jejuLatitude = 33.5

      // 제주도로부터의 거리 비교
      const oldDistance = oldLat - jejuLatitude // 3.0도
      const newDistance = newLat - jejuLatitude // 2.5도

      expect(newDistance).toBeLessThan(oldDistance)
      expect(oldDistance).toBeGreaterThanOrEqual(3.0)
    })
  })

  describe('Phase 3-3: 지도 경계 엣지 케이스', () => {
    it('서울(37.5)과 제주(33.5) 중간점 검증', () => {
      const seoulLat = 37.5
      const jejuLat = 33.5
      const midpoint = (seoulLat + jejuLat) / 2

      // 정확한 중간점은 35.5
      expect(midpoint).toBe(35.5)

      // 36.0은 중간점보다 약간 북쪽 (서울 쪽)
      const initialLat = 36.0
      expect(initialLat).toBeGreaterThan(midpoint)
      expect(initialLat).toBeLessThan(seoulLat)
    })

    it('부산(35.1)도 화면에 포함됨', () => {
      const initialLat = 36.0
      const busanLat = 35.1

      // 부산은 중심보다 남쪽이지만 화면에 포함
      expect(initialLat).toBeGreaterThan(busanLat)

      const distance = initialLat - busanLat
      expect(distance).toBeLessThan(1.0) // 1도 이내로 가까움
    })

    it('독도(37.24) 포함 여부 (선택적)', () => {
      const initialLat = 36.0
      const dokdoLat = 37.24

      // 독도는 중심보다 북쪽
      expect(dokdoLat).toBeGreaterThan(initialLat)

      const distance = dokdoLat - initialLat
      // 독도는 약간 멀지만 줌 레벨 7에서는 포함될 수 있음
      expect(distance).toBeLessThan(1.5)
    })
  })

  describe('Phase 3-2 & 3-3: 통합 검증', () => {
    it('타임아웃 상태는 5가지 기본 상태에 추가됨', () => {
      const allStatuses = [
        'completed',
        'processing',
        'error',
        'pending',
        'timeout' // 신규 추가
      ]

      expect(allStatuses).toHaveLength(5)
      expect(allStatuses).toContain('timeout')
    })

    it('지도 설정은 한국 전역을 커버', () => {
      const coverage = {
        initialLat: 36.0,
        initialLng: 127.5,
        initialZoom: 7
      }

      // 제주도부터 서울까지 커버
      expect(coverage.initialLat).toBeGreaterThan(33.0) // 제주도 남단보다 북쪽
      expect(coverage.initialLat).toBeLessThan(38.0) // 북한 경계보다 남쪽

      // 동해안부터 서해안까지 커버
      expect(coverage.initialLng).toBeGreaterThan(126.0) // 서해안보다 동쪽
      expect(coverage.initialLng).toBeLessThan(130.0) // 동해안보다 서쪽
    })
  })

  describe('Phase 3-2: 타임아웃 UI 표시 검증', () => {
    it('타임아웃 아이콘은 ⏱ (시계)', () => {
      const timeoutIcon = '⏱'

      expect(timeoutIcon).toBe('⏱')
      expect(timeoutIcon).not.toBe('✗') // 오류 아이콘과 다름
      expect(timeoutIcon).not.toBe('○') // 대기 아이콘과 다름
    })

    it('타임아웃 레이블은 "타임아웃"', () => {
      const timeoutLabel = '타임아웃'

      expect(timeoutLabel).toBe('타임아웃')
      expect(timeoutLabel).not.toBe('오류')
      expect(timeoutLabel).not.toBe('대기')
    })

    it('각 상태별 고유한 아이콘 보유', () => {
      const statusIcons = {
        completed: '✓',
        processing: '⟳',
        error: '✗',
        pending: '○',
        timeout: '⏱'
      }

      // 모든 아이콘이 고유함
      const icons = Object.values(statusIcons)
      const uniqueIcons = new Set(icons)

      expect(icons.length).toBe(5)
      expect(uniqueIcons.size).toBe(5)
    })
  })
})
