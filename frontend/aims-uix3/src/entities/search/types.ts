/**
 * Search Entity Types
 * @since 1.0.0
 *
 * 문서 검색 기능의 타입 정의
 */
import type { DocumentCustomerRelation } from '../../types/documentStatus'

/**
 * 검색 모드
 */
export type SearchMode = 'semantic' | 'keyword'

/**
 * 키워드 검색 모드 (AND/OR)
 */
export type KeywordMode = 'AND' | 'OR'

/**
 * 검색 쿼리 파라미터
 */
export interface SearchQuery {
  /** 검색어 */
  query: string
  /** 검색 모드 */
  search_mode: SearchMode
  /** 키워드 모드 (키워드 검색시만 사용) */
  mode?: KeywordMode
  /** 고객 ID (특정 고객의 문서만 검색) */
  customer_id?: string
  /** 결과 개수 제한 */
  top_k?: number
  /** 페이지네이션 오프셋 (건너뛸 결과 수) */
  offset?: number
}

/**
 * 문서 메타데이터
 */
export interface DocumentMetadata {
  /** 문서 ID */
  _id?: string
  /** 파일명 */
  originalName?: string
  /** 파일 경로 */
  destPath?: string
  /** MIME 타입 */
  mime?: string
  /** 파일 크기 */
  size_bytes?: number
  /** 업로드 시각 */
  uploaded_at?: string
}

/**
 * OCR 정보
 */
export interface OCRInfo {
  /** OCR 전문 */
  full_text?: string
  /** OCR 요약 */
  summary?: string
  /** OCR 신뢰도 */
  confidence?: string
}

/**
 * 검색 결과 아이템 (시맨틱 검색)
 */
export interface SemanticSearchResultItem {
  /** 문서 ID */
  id?: string
  /** 유사도 점수 (원본 — 정규화 전 하이브리드 점수) */
  score: number
  /** 최종 점수 (Reranker 정규화 후, 0~1 범위) */
  final_score?: number
  /** Cross-Encoder 재순위화 점수 (0~1 범위) */
  rerank_score?: number
  /** MIME Type (최상위 필드) */
  mimeType?: string
  /** 사용자 지정 별칭 */
  displayName?: string
  /** payload 데이터 */
  payload?: {
    doc_id?: string
    original_name?: string
    preview?: string
    mime?: string
    mime_type?: string
    dest_path?: string
    uploaded_at?: string
  }
  /** 업로드 정보 */
  upload?: {
    originalName?: string
    destPath?: string
    uploaded_at?: string
    mimeType?: string
  }
  /** 메타 정보 */
  meta?: {
    mime?: string
    mimeType?: string
    size_bytes?: number
    full_text?: string
    summary?: string
    originalName?: string
    destPath?: string
  }
  /** OCR 정보 */
  ocr?: OCRInfo
  /** 문서 요약 정보 */
  docsum?: {
    summary?: string
  }
  /** 고객 관계 정보 */
  customer_relation?: DocumentCustomerRelation
}

/**
 * 검색 결과 아이템 (키워드 검색)
 */
export interface KeywordSearchResultItem {
  /** 문서 ID */
  _id: string
  /** 파일명 */
  filename?: string
  /** MIME Type (최상위 필드) */
  mimeType?: string
  /** 사용자 지정 별칭 */
  displayName?: string
  /** 업로드 정보 */
  upload?: {
    originalName?: string
    destPath?: string
    uploaded_at?: string
    mimeType?: string
  }
  /** 메타 정보 */
  meta?: {
    mime?: string
    mimeType?: string
    size_bytes?: number
    full_text?: string
    summary?: string
    originalName?: string
    destPath?: string
  }
  /** OCR 정보 */
  ocr?: OCRInfo
  /** 고객 관계 정보 */
  customer_relation?: DocumentCustomerRelation
}

/**
 * 통합 검색 결과 아이템
 */
export type SearchResultItem = SemanticSearchResultItem | KeywordSearchResultItem

/**
 * 검색 응답
 */
export interface SearchResponse {
  /** AI 답변 (시맨틱 검색시) */
  answer?: string
  /** 검색 결과 목록 */
  search_results: SearchResultItem[]
  /** 검색 모드 */
  search_mode: SearchMode
  /** 전체 검색 결과 수 (백엔드 페이지네이션) */
  total_count?: number
  /** 더 많은 결과 존재 여부 */
  has_more?: boolean
}

/**
 * 검색 상태
 */
export interface SearchState {
  /** 검색어 */
  query: string
  /** 검색 모드 */
  searchMode: SearchMode
  /** 키워드 모드 */
  keywordMode: KeywordMode
  /** 검색 결과 */
  results: SearchResultItem[]
  /** AI 답변 */
  answer: string | null
  /** 로딩 상태 */
  isLoading: boolean
  /** 에러 메시지 */
  error: string | null
}
