/**
 * Search Service
 * @since 1.0.0
 *
 * 문서 검색 API 비즈니스 로직
 */

import type {
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SemanticSearchResultItem
} from '@/entities/search'

const SEARCH_API_URL = 'https://tars.giize.com/search_api'
const SMARTSEARCH_API_URL = 'https://n8nd.giize.com/webhook/smartsearch'

/**
 * SearchService 클래스
 *
 * 문서 검색 관련 API 호출을 중앙화하여 관리합니다.
 */
export class SearchService {
  /**
   * 문서 검색 수행
   *
   * @param query 검색 쿼리 파라미터
   * @returns 검색 결과
   */
  static async searchDocuments(query: SearchQuery): Promise<SearchResponse> {
    try {
      // 현재 사용자 ID 가져오기
      const userId = typeof window !== 'undefined'
        ? localStorage.getItem('aims-current-user-id') || 'tester'
        : 'tester';

      // 쿼리에 user_id 추가
      const queryWithUser = {
        ...query,
        user_id: userId
      };

      const response = await fetch(SEARCH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryWithUser),
      })

      if (!response.ok) {
        throw new Error(`검색 API 호출 실패: ${response.status}`)
      }

      const data = await response.json()

      // 시맨틱 검색의 경우 MongoDB에서 전체 문서 정보 가져오기
      if (query.search_mode === 'semantic' && data.search_results && data.search_results.length > 0) {
        const enrichedResults = await Promise.all(
          data.search_results.map(async (item: SemanticSearchResultItem) => {
            const docId = item.payload?.doc_id
            if (!docId) return item

            try {
              // MongoDB에서 전체 문서 정보 조회
              const docResponse = await fetch(`http://tars.giize.com:3010/api/documents/${docId}/status`)
              if (!docResponse.ok) {
                console.warn(`[SearchService] 문서 ${docId} 조회 실패`)
                return item
              }

              const docData = await docResponse.json()
              if (!docData.success || !docData.data) {
                return item
              }

              // Qdrant 결과(payload, score)와 MongoDB 결과(meta, ocr, overallStatus 등) 병합
              return {
                ...item,
                _id: docId,
                meta: docData.data.raw.meta,
                ocr: docData.data.raw.ocr,
                overallStatus: docData.data.computed.overallStatus,
                customer_relation: docData.data.raw.customer_relation
              }
            } catch (error) {
              console.error(`[SearchService] 문서 ${docId} 조회 오류:`, error)
              return item
            }
          })
        )

        // customer_name 보강 (customer_relation이 있지만 customer_name이 없는 경우)
        const customerIds = new Set<string>()
        enrichedResults.forEach((item) => {
          if (item.customer_relation?.customer_id && !item.customer_relation.customer_name) {
            const customerId = String(item.customer_relation.customer_id)
            customerIds.add(customerId)
          }
        })

        // customer_name + customer_type 일괄 조회
        const customerMap: Record<string, { name: string | null; type: string | null }> = {}
        if (customerIds.size > 0) {
          await Promise.all(
            Array.from(customerIds).map(async (customerId) => {
              try {
                const customerResponse = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}`)
                if (customerResponse.ok) {
                  const customerData = await customerResponse.json()
                  if (customerData.success && customerData.data) {
                    customerMap[customerId] = {
                      name: customerData.data.personal_info?.name || null,
                      type: customerData.data.insurance_info?.customer_type || null
                    }
                  }
                }
              } catch (error) {
                console.error(`[SearchService] 고객 ${customerId} 조회 오류:`, error)
              }
            })
          )
        }

        // 검색 결과에 customer_name + customer_type 추가
        const finalResults = enrichedResults.map((item) => {
          if (item.customer_relation?.customer_id && !item.customer_relation.customer_name) {
            const customerId = String(item.customer_relation.customer_id)
            const customerInfo = customerMap[customerId]
            if (customerInfo) {
              return {
                ...item,
                customer_relation: {
                  ...item.customer_relation,
                  customer_name: customerInfo.name,
                  customer_type: customerInfo.type
                }
              }
            }
          }
          return item
        })

        return {
          answer: data.answer || null,
          search_results: finalResults,
          search_mode: query.search_mode,
        }
      }

      // 키워드 검색의 경우 customer_name 보강 (customer_relation이 있지만 customer_name이 없는 경우)
      if (query.search_mode === 'keyword' && data.search_results && data.search_results.length > 0) {
        // customer_id 수집 (중복 제거) - ObjectId를 문자열로 변환
        const customerIds = new Set<string>()
        data.search_results.forEach((item: SearchResultItem) => {
          if (item.customer_relation?.customer_id && !item.customer_relation.customer_name) {
            // ObjectId를 문자열로 변환
            const customerId = String(item.customer_relation.customer_id)
            customerIds.add(customerId)
          }
        })

        // customer_name + customer_type 일괄 조회 (효율적!)
        const customerMap: Record<string, { name: string | null; type: string | null }> = {}
        if (customerIds.size > 0) {
          await Promise.all(
            Array.from(customerIds).map(async (customerId) => {
              try {
                const customerResponse = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}`)
                if (customerResponse.ok) {
                  const customerData = await customerResponse.json()
                  if (customerData.success && customerData.data) {
                    customerMap[customerId] = {
                      name: customerData.data.personal_info?.name || null,
                      type: customerData.data.insurance_info?.customer_type || null
                    }
                  }
                }
              } catch (error) {
                console.error(`[SearchService] 고객 ${customerId} 조회 오류:`, error)
              }
            })
          )
        }

        // 검색 결과에 customer_name + customer_type 추가
        const enrichedResults = data.search_results.map((item: SearchResultItem) => {
          if (item.customer_relation?.customer_id && !item.customer_relation.customer_name) {
            // ObjectId를 문자열로 변환
            const customerId = String(item.customer_relation.customer_id)
            const customerInfo = customerMap[customerId]
            if (customerInfo) {
              return {
                ...item,
                customer_relation: {
                  ...item.customer_relation,
                  customer_name: customerInfo.name,
                  customer_type: customerInfo.type
                }
              }
            }
          }
          return item
        })

        return {
          answer: data.answer || null,
          search_results: enrichedResults,
          search_mode: query.search_mode,
        }
      }

      // 그 외의 경우 원본 그대로 반환
      return {
        answer: data.answer || null,
        search_results: data.search_results || [],
        search_mode: query.search_mode,
      }
    } catch (error) {
      console.error('[SearchService] 검색 오류:', error)
      throw error
    }
  }

  /**
   * MongoDB에서 문서 상세 정보 조회
   *
   * @param docId 문서 ID
   * @returns 문서 상세 정보
   */
  static async getDocumentDetails(docId: string): Promise<Partial<SearchResultItem> | null> {
    try {
      const response = await fetch(SMARTSEARCH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: docId }),
      })

      if (!response.ok) {
        throw new Error(`문서 상세 조회 실패: ${response.status}`)
      }

      const data = await response.json()

      if (data && data.length > 0) {
        return data[0]
      }

      return null
    } catch (error) {
      console.error('[SearchService] 문서 상세 조회 오류:', docId, error)
      return null
    }
  }

  /**
   * 파일 경로 추출 (다양한 스키마 지원)
   *
   * @param item 검색 결과 아이템
   * @returns 파일 경로
   */
  static getFilePath(item: SearchResultItem): string {
    // 1. upload.destPath
    if ('upload' in item && item.upload?.destPath) {
      return item.upload.destPath
    }

    // 2. meta.destPath
    if (item.meta?.destPath) {
      return item.meta.destPath
    }

    // 3. payload.dest_path (시맨틱 검색)
    if ('payload' in item && item.payload?.dest_path) {
      return item.payload.dest_path
    }

    return ''
  }

  /**
   * 원본 파일명 추출 (다양한 스키마 지원)
   *
   * @param item 검색 결과 아이템
   * @returns 원본 파일명
   */
  static getOriginalName(item: SearchResultItem): string {
    // 1. upload.originalName
    if ('upload' in item && item.upload?.originalName) {
      return item.upload.originalName
    }

    // 2. meta.originalName
    if (item.meta?.originalName) {
      return item.meta.originalName
    }

    // 3. payload.original_name (시맨틱 검색)
    if ('payload' in item && item.payload?.original_name) {
      return item.payload.original_name
    }

    // 4. filename
    if ('filename' in item && item.filename) {
      return item.filename
    }

    return '알 수 없는 파일'
  }

  /**
   * 문서 요약 추출 (다양한 스키마 지원)
   *
   * @param item 검색 결과 아이템
   * @returns 문서 요약
   */
  static getSummary(item: SearchResultItem): string {
    // 1. meta.summary
    if (item.meta?.summary && item.meta.summary !== 'null' && item.meta.summary.trim() !== '') {
      return item.meta.summary
    }

    // 2. ocr.summary
    if (item.ocr?.summary && item.ocr.summary !== 'null' && item.ocr.summary.trim() !== '') {
      return item.ocr.summary
    }

    // 3. docsum.summary
    if ('docsum' in item && item.docsum?.summary && item.docsum.summary !== 'null' && item.docsum.summary.trim() !== '') {
      return item.docsum.summary
    }

    return '요약 없음'
  }

  /**
   * OCR 신뢰도 추출
   *
   * @param item 검색 결과 아이템
   * @returns OCR 신뢰도 (0.0 ~ 1.0 범위의 숫자)
   */
  static getOCRConfidence(item: SearchResultItem): number | null {
    const confidence = item.ocr?.confidence
    if (!confidence) return null

    // 문자열을 숫자로 변환 (백엔드에서 "0.9817" 형태로 전송)
    const parsed = parseFloat(confidence)
    return isNaN(parsed) ? null : parsed
  }

  /**
   * 문서 ID 추출
   *
   * @param item 검색 결과 아이템
   * @returns 문서 ID
   */
  static getDocumentId(item: SearchResultItem): string {
    if ('_id' in item && item._id) {
      return item._id
    }

    if ('payload' in item && item.payload?.doc_id) {
      return item.payload.doc_id
    }

    if ('id' in item && item.id) {
      return item.id
    }

    return ''
  }

  /**
   * MIME Type 추출 (다양한 스키마 지원)
   *
   * @param item 검색 결과 아이템
   * @returns MIME Type
   */
  static getMimeType(item: SearchResultItem): string | undefined {
    // 1. mimeType 필드
    if ('mimeType' in item && item.mimeType) {
      return item.mimeType
    }

    // 2. upload.mimeType
    if ('upload' in item && item.upload?.mimeType) {
      return item.upload.mimeType
    }

    // 3. meta.mimeType
    if (item.meta?.mimeType) {
      return item.meta.mimeType
    }

    // 4. payload.mime_type (시맨틱 검색)
    if ('payload' in item && item.payload?.mime_type) {
      return item.payload.mime_type
    }

    return undefined
  }
}
