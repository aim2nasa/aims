/**
 * 문서 유형 서비스
 * @since 2025-12-29
 *
 * 문서 유형 변경/자동분류 API 호출
 * 목록 조회/라벨 변환은 documentCategories.ts 정적 상수로 대체됨
 */

import { api } from '@/shared/lib/api'

// ========================================
// 문서 유형 변경/자동분류 API
// ========================================

interface UpdateDocumentTypeResponse {
  success: boolean
  data: {
    documentId: string
    type: string
    typeLabel: string
  }
}

interface AutoClassifyResponse {
  success: boolean
  data: {
    documentId: string
    currentType: string
    type: string | null
    suggestedType: string | null
    confidence: number
    matchedKeywords: string[]
    autoApplied: boolean
    applied: boolean
  }
}

/**
 * 문서 유형 수동 변경
 * @param documentId 문서 ID
 * @param type 새 문서 유형 value
 */
export async function updateDocumentType(
  documentId: string,
  type: string
): Promise<UpdateDocumentTypeResponse['data']> {
  const response = await api.patch<UpdateDocumentTypeResponse>(
    `/api/documents/${documentId}/type`,
    { type }
  )
  return response.data
}

/**
 * 문서 유형 자동 분류
 * @param documentId 문서 ID
 * @param autoApply 자동 적용 여부 (기본: true)
 */
export async function autoClassifyDocument(
  documentId: string,
  autoApply = true
): Promise<AutoClassifyResponse['data']> {
  const response = await api.post<AutoClassifyResponse>(
    `/api/documents/${documentId}/auto-classify`,
    { autoApply }
  )
  return response.data
}

export const documentTypesService = {
  updateDocumentType,
  autoClassifyDocument
}

