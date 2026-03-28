/**
 * Regression Test — 2026-03-28 extractProgress 에러 상태 처리
 *
 * 문제: overallStatus: "error", progress: 40인 문서가 UI에서 40%로 표시됨
 * 수정: extractProgress()에서 error/timeout 상태 시 0 반환
 *
 * @since 2026-03-28
 */

import { describe, test, expect } from 'vitest'
import { DocumentStatusService } from '../DocumentStatusService'
import type { Document } from '@/types/documentStatus'

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    _id: 'test-doc-id',
    ...overrides,
  } as Document
}

describe('extractProgress: 에러 상태 우선 처리', () => {
  test('overallStatus: "error", progress: 40 → 0 반환', () => {
    const doc = makeDoc({ overallStatus: 'error', progress: 40 })
    expect(DocumentStatusService.extractProgress(doc)).toBe(0)
  })

  test('overallStatus: "error", progress: undefined → 0 반환', () => {
    const doc = makeDoc({ overallStatus: 'error' })
    expect(DocumentStatusService.extractProgress(doc)).toBe(0)
  })

  test('overallStatus: "timeout", progress: 60 → 0 반환', () => {
    const doc = makeDoc({ overallStatus: 'timeout', progress: 60 })
    expect(DocumentStatusService.extractProgress(doc)).toBe(0)
  })

  test('overallStatus: "completed" → 100 반환 (기존 동작 유지)', () => {
    const doc = makeDoc({ overallStatus: 'completed' })
    expect(DocumentStatusService.extractProgress(doc)).toBe(100)
  })

  test('overallStatus: "processing", progress: 60 → 60 반환 (기존 동작 유지)', () => {
    const doc = makeDoc({ overallStatus: 'processing', progress: 60 })
    expect(DocumentStatusService.extractProgress(doc)).toBe(60)
  })

  test('overallStatus: undefined, progress: 40 → 40 반환 (기존 동작 유지)', () => {
    const doc = makeDoc({ progress: 40 })
    expect(DocumentStatusService.extractProgress(doc)).toBe(40)
  })
})
