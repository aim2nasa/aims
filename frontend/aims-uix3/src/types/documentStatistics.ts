/**
 * Document Statistics Types
 * @description 문서 처리 현황 통계 타입 정의
 */

export interface ParsingStats {
  total: number
  completed: number
  processing: number
  pending: number
  failed: number
  credit_pending?: number  // 🔴 크레딧 부족으로 파싱 보류된 문서
}

export interface DocumentStatistics {
  total: number
  completed: number
  processing: number
  error: number
  pending: number
  completed_with_skip: number
  credit_pending: number  // 🔴 크레딧 부족으로 처리 보류된 문서
  stages: {
    upload: number
    meta: number
    ocr_prep: number
    ocr: number
    docembed: number
  }
  badgeTypes: {
    TXT: number
    OCR: number
    BIN: number
  }
  arParsing: ParsingStats
  crsParsing: ParsingStats
}
