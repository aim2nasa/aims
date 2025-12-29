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

export const documentTypesService = {
  getDocumentTypes,
  toDropdownOptions
}

export default documentTypesService
