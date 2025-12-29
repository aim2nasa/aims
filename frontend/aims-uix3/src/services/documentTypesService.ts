/**
 * 문서 유형 서비스
 * @since 2025-12-29
 *
 * 문서 유형 목록을 API에서 조회하여 제공
 */

import { api } from '@/shared/lib/api'

export interface DocumentType {
  _id: string
  value: string
  label: string
  description?: string
  isSystem: boolean
  order: number
}

interface DocumentTypesResponse {
  success: boolean
  data: DocumentType[]
}

/**
 * 문서 유형 목록 조회 (사용자용)
 * @param includeSystem 시스템 유형(unspecified, annual_report) 포함 여부 (기본: true)
 */
export async function getDocumentTypes(includeSystem = true): Promise<DocumentType[]> {
  const response = await api.get<DocumentTypesResponse>(
    `/api/document-types?includeSystem=${includeSystem}`
  )
  return response.data
}

/**
 * 문서 유형을 드롭다운 옵션 형태로 변환
 */
export function toDropdownOptions(
  documentTypes: DocumentType[]
): { value: string; label: string }[] {
  return documentTypes
    .filter(dt => !dt.isSystem || dt.value === 'unspecified') // annual_report 제외
    .sort((a, b) => a.order - b.order)
    .map(dt => ({
      value: dt.value,
      label: dt.label
    }))
}

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

/**
 * 문서 유형 value로 label 찾기
 */
export function getTypeLabel(
  documentTypes: DocumentType[],
  typeValue: string | null | undefined
): string {
  if (!typeValue) return '미지정'
  const found = documentTypes.find(dt => dt.value === typeValue)
  return found?.label ?? typeValue
}

export const documentTypesService = {
  getDocumentTypes,
  toDropdownOptions,
  updateDocumentType,
  autoClassifyDocument,
  getTypeLabel
}

export default documentTypesService
