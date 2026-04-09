/**
 * 문서 유형 데이터를 API에서 조회하는 hook
 * @since 2026-03-27
 *
 * DB를 Single Source of Truth로 사용하여 하드코딩 상수를 대체합니다.
 * staleTime 30분, gcTime 1시간 — 문서 유형은 거의 변경되지 않는 데이터입니다.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/lib/api'

/** API에서 반환하는 문서 유형 */
export interface DocumentType {
  _id: string
  value: string
  label: string
  category: string
  description?: string
  isSystem?: boolean
  isLegacy?: boolean
  order: number
}

/** API 응답 형태 */
interface DocumentTypesResponse {
  success: boolean
  data: DocumentType[]
}

/** 쿼리 키 */
export const DOCUMENT_TYPES_QUERY_KEY = ['documentTypes'] as const

/** API 호출 함수 (레거시 포함 — 프론트엔드에서 레거시 매핑 필요) */
async function fetchDocumentTypes(): Promise<DocumentType[]> {
  const response = await api.get<DocumentTypesResponse>(
    '/api/document-types?includeLegacy=true'
  )
  return response.data
}

/**
 * 문서 유형 목록을 API에서 조회하는 React hook
 *
 * @returns types: 전체 문서 유형 배열, getLabel/getCategory: 동기 조회 헬퍼, isLoading
 */
export function useDocumentTypes() {
  const { data: types = [], isLoading } = useQuery({
    queryKey: DOCUMENT_TYPES_QUERY_KEY,
    queryFn: fetchDocumentTypes,
    staleTime: 1000 * 60 * 30,  // 30분
    gcTime: 1000 * 60 * 60,     // 1시간
  })

  /** value → 한글 라벨 (없으면 '분류불가') */
  function getLabel(value: string | null | undefined): string {
    if (!value) return '분류불가'
    const found = types.find(t => t.value === value)
    return found?.label ?? '분류불가'
  }

  /** value → 카테고리 (없으면 'etc') */
  function getCategory(value: string | null | undefined): string {
    if (!value) return 'etc'
    const found = types.find(t => t.value === value)
    return found?.category ?? 'etc'
  }

  return { types, getLabel, getCategory, isLoading }
}

export { fetchDocumentTypes }
