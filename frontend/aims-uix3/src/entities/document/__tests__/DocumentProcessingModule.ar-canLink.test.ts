/**
 * DocumentProcessingModule AR canLink Test
 * @since 2025-10-26
 *
 * 🔴 버그 수정 검증:
 * AR 문서의 getCustomerLinkStatus()가 올바르게 작동하는지 테스트
 */

import { describe, it, expect } from 'vitest'
import { DocumentProcessingModule } from '../DocumentProcessingModule'
import type { Document } from '../../../types/documentStatus'

describe('DocumentProcessingModule - AR canLink 버그 수정', () => {
  it('🔴 핵심 버그: AR 문서 + completed + 연결안됨 → canLink = false', () => {
    const arDoc: Document = {
      _id: '1',
      filename: 'AR.pdf',
      status: 'completed',
      overallStatus: 'completed',
      is_annual_report: true,
      // customer_relation이 undefined (연결 안됨)
      meta: {},
      ocr: {},
      text: {},
      docembed: {},
      embed: {},
      upload: {}
    }

    const result = DocumentProcessingModule.getCustomerLinkStatus(arDoc)

    // 🔴 수정 전에는 true였을 것 (버그!)
    // ✅ 수정 후에는 false (정상)
    expect(result.canLink).toBe(false)
    expect(result.isLinked).toBe(false)
  })

  it('일반 문서 + completed + 연결안됨 → canLink = true', () => {
    const normalDoc: Document = {
      _id: '2',
      filename: 'normal.pdf',
      status: 'completed',
      overallStatus: 'completed',
      is_annual_report: false,
      meta: {},
      ocr: {},
      text: {},
      docembed: {},
      embed: {},
      upload: {}
    }

    const result = DocumentProcessingModule.getCustomerLinkStatus(normalDoc)

    expect(result.canLink).toBe(true)
    expect(result.isLinked).toBe(false)
  })

  it('AR 문서 + processing → canLink = false', () => {
    const arDoc: Document = {
      _id: '3',
      filename: 'AR.pdf',
      status: 'processing',
      is_annual_report: true,
      meta: {},
      ocr: {},
      text: {},
      docembed: {},
      embed: {},
      upload: {}
    }

    const result = DocumentProcessingModule.getCustomerLinkStatus(arDoc)

    expect(result.canLink).toBe(false)
  })

  it('undefined는 일반 문서로 처리', () => {
    const doc: Document = {
      _id: '4',
      filename: 'doc.pdf',
      status: 'completed',
      // is_annual_report 필드 없음 (undefined)
      meta: {},
      ocr: {},
      text: {},
      docembed: {},
      embed: {},
      upload: {}
    }

    const result = DocumentProcessingModule.getCustomerLinkStatus(doc)

    // undefined는 false로 처리되므로 일반 문서
    expect(result.canLink).toBe(true)
  })
})
