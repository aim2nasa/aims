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
}

export interface DocumentStatistics {
  total: number
  completed: number
  processing: number
  error: number
  pending: number
  completed_with_skip: number
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
