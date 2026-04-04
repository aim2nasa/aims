/**
 * DocumentProcessingModule
 * @since 1.0.0
 * @version 1.0.0
 *
 * 문서 처리 상태와 관련된 비즈니스 로직을 제공하는 독립적인 모듈
 * 다른 페이지나 컴포넌트에서 재사용 가능
 *
 * 제공 기능:
 * 1. 문서 처리 결과 상태 확인 (completed, processing, error, pending)
 * 2. 문서 요약 텍스트 추출
 * 3. 문서 전체 텍스트 추출
 * 4. 고객 연결 상태 확인
 * 5. 액션 가능 여부 확인
 */

import type {
  Document,
  DocumentStatus,
  DocumentCustomerRelation,
  MetaData,
  OcrData,
  TextData,
  DocEmbedData,
  EmbedData,
  UploadData
} from '../../types/documentStatus'

type MaybeSerialized<T> = T | string | null | undefined

/**
 * JSON 문자열을 파싱하는 헬퍼 함수
 */
const parseStage = <T>(input: MaybeSerialized<T>): T | undefined => {
  if (input == null) {
    return undefined
  }

  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as T
    } catch {
      return undefined
    }
  }

  return input
}

/**
 * Record 타입으로 변환하는 헬퍼 함수
 */
const toRecord = (input: MaybeSerialized<Record<string, unknown>>): Record<string, unknown> | undefined => {
  const parsed = parseStage<Record<string, unknown>>(input)
  if (parsed && typeof parsed === 'object') {
    return parsed
  }
  return undefined
}

/**
 * 문서 처리 상태 정보
 */
export interface ProcessingStatus {
  status: DocumentStatus
  icon: string
  label: string
}

/**
 * 고객 연결 상태 정보
 */
export interface CustomerLinkStatus {
  isLinked: boolean
  canLink: boolean
  linkInfo?: DocumentCustomerRelation
}

/**
 * 문서에서 사용 가능한 액션 정보
 */
export interface AvailableActions {
  canViewDetail: boolean
  canViewSummary: boolean
  canViewFullText: boolean
  canLink: boolean
}

/**
 * DocumentProcessingModule
 *
 * 문서 처리 상태 관련 비즈니스 로직을 제공하는 클래스
 * 정적 메서드로만 구성되어 있어 인스턴스 생성 없이 사용 가능
 */
export class DocumentProcessingModule {
  /**
   * 1. 문서 처리 결과 상태 확인
   *
   * @param document - 확인할 문서
   * @returns 상태, 아이콘, 레이블 정보
   *
   * @example
   * ```typescript
   * const status = DocumentProcessingModule.getProcessingStatus(document)
   * console.log(status.icon) // '✓'
   * console.log(status.label) // '완료'
   * ```
   */
  static getProcessingStatus(document: Document): ProcessingStatus {
    const status = this.extractStatus(document)
    const icon = this.getStatusIcon(status)
    const label = this.getStatusLabel(status)

    return { status, icon, label }
  }

  /**
   * 2. 문서 요약 텍스트 추출
   *
   * @param document - 요약을 추출할 문서
   * @returns 요약 텍스트 또는 null (요약이 없는 경우)
   *
   * @example
   * ```typescript
   * const summary = DocumentProcessingModule.extractSummary(document)
   * if (summary) {
   *   console.log('요약:', summary)
   * }
   * ```
   */
  static extractSummary(document: Document): string | null {
    const metaData = parseStage<MetaData>(document.meta)
    const ocrData = parseStage<OcrData>(document.ocr)
    const payloadData = toRecord(document.payload)

    const ensureString = (value: unknown): string | undefined =>
      typeof value === 'string' ? value : undefined

    // meta에 full_text가 있는 경우 - meta summary 사용
    // _hasMetaText: status API 경량화로 full_text 제거 시 존재 플래그로 대체
    const hasMetaText = (metaData && metaData.full_text && metaData.full_text.trim()) || (document as Partial<Document>)._hasMetaText
    if (hasMetaText) {
      if (metaData?.summary && metaData.summary !== 'null') {
        return metaData.summary
      }
      // full_text가 실제 존재하는 경우에만 앞부분 사용 (개별 문서 API)
      if (metaData?.full_text) {
        const cleanText = metaData.full_text.trim()
        return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText
      }
    }

    // meta에 full_text가 없는 경우 - ocr summary 사용
    if (ocrData && ocrData.summary && ocrData.summary !== 'null') {
      return ocrData.summary
    }

    // ocr summary가 없으면 ocr full_text의 앞부분 사용
    if (ocrData && ocrData.full_text && ocrData.full_text.trim()) {
      const cleanText = ocrData.full_text.trim()
      return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText
    }

    // 마지막으로 payload.summary 시도
    const payloadSummary = ensureString(payloadData?.['summary'])
    if (payloadSummary) {
      return payloadSummary
    }

    return null
  }

  /**
   * 3. 문서 전체 텍스트 추출
   *
   * @param document - 전체 텍스트를 추출할 문서
   * @returns 전체 텍스트 또는 null (텍스트가 없는 경우)
   *
   * @example
   * ```typescript
   * const fullText = DocumentProcessingModule.extractFullText(document)
   * if (fullText) {
   *   console.log('전체 텍스트:', fullText)
   * }
   * ```
   */
  static extractFullText(document: Document): string | null {
    const metaData = parseStage<MetaData>(document.meta)
    const textData = parseStage<TextData>(document.text)
    const ocrData = parseStage<OcrData>(document.ocr)
    const payloadData = toRecord(document.payload)
    const ensureString = (value: unknown): string | undefined =>
      typeof value === 'string' ? value : undefined

    // meta에서 full_text 확인 (최우선)
    if (metaData && metaData.full_text && metaData.full_text.trim()) {
      return metaData.full_text
    }

    // text에서 full_text 확인 (text/plain 파일용)
    if (textData && textData.full_text && textData.full_text.trim()) {
      return textData.full_text
    }

    // ocr에서 full_text 확인
    if (ocrData && ocrData.full_text && ocrData.full_text.trim()) {
      return ocrData.full_text
    }

    // 마지막으로 payload에서 확인
    const payloadFullText = ensureString(payloadData?.['full_text'])
    if (payloadFullText) {
      return payloadFullText
    }

    return null
  }

  /**
   * 4. 고객 연결 상태 확인
   *
   * @param document - 확인할 문서
   * @returns 연결 여부, 연결 가능 여부, 연결 정보
   *
   * @example
   * ```typescript
   * const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(document)
   * if (linkStatus.canLink) {
   *   console.log('연결 가능')
   * }
   * ```
   */
  static getCustomerLinkStatus(document: Document): CustomerLinkStatus {
    const isLinked = Boolean(document.customer_relation)
    const status = this.extractStatus(document)
    const isAnnualReport = document.is_annual_report === true
    // AR 문서는 자동 연결되므로 처리 완료되어도 버튼 비활성화 유지
    const canLink = status === 'completed' && !isLinked && !isAnnualReport

    const result: CustomerLinkStatus = {
      isLinked,
      canLink
    }

    if (document.customer_relation) {
      result.linkInfo = document.customer_relation
    }

    return result
  }

  /**
   * 5. 액션 가능 여부 확인
   *
   * @param document - 확인할 문서
   * @returns 각 액션(상세보기, 요약보기, 전체텍스트보기, 연결)의 가능 여부
   *
   * @example
   * ```typescript
   * const actions = DocumentProcessingModule.getAvailableActions(document)
   * if (actions.canViewSummary) {
   *   console.log('요약 보기 가능')
   * }
   * ```
   */
  static getAvailableActions(document: Document): AvailableActions {
    const status = this.extractStatus(document)
    const isCompleted = status === 'completed'
    const linkStatus = this.getCustomerLinkStatus(document)

    return {
      canViewDetail: true, // 상세보기는 항상 가능
      canViewSummary: isCompleted,
      canViewFullText: isCompleted,
      canLink: linkStatus.canLink
    }
  }

  // ===== Private Helper Methods =====

  /**
   * 문서 상태 추출 (내부 헬퍼)
   */
  private static extractStatus(document: Document): DocumentStatus {
    // 🔴 credit_pending 상태 체크 (크레딧 부족으로 처리 보류)
    // ⭐ overallStatus만 체크! status/progressStage에 stale 값이 있어도 무시
    // (processCreditPendingDocuments에서 overallStatus를 'pending'으로 업데이트하므로 overallStatus가 신뢰할 수 있는 필드)
    if (document.overallStatus === 'credit_pending') {
      return 'credit_pending'
    }

    if (document.overallStatus) {
      return document.overallStatus
    }

    if (document.status) {
      return document.status
    }

    const uploadStage = parseStage<UploadData>(document.stages?.upload)
    const uploadData = parseStage<UploadData>(document.upload)
    const uploadStatus = uploadStage?.status ?? uploadData?.status

    const embedStage = parseStage<EmbedData>(document.stages?.embed)
    const embedData = parseStage<EmbedData>(document.embed)
    const embedStatus = embedStage?.status ?? embedData?.status

    const docEmbedStage = parseStage<DocEmbedData>(document.stages?.docembed)
    const docEmbedData = parseStage<DocEmbedData>(document.docembed)
    const docEmbedStatus = docEmbedStage?.status ?? docEmbedData?.status

    const metaStage = parseStage<MetaData>(document.stages?.meta)
    const metaData = parseStage<MetaData>(document.meta)
    const metaStageStatus = metaStage?.status
    const metaStatus = metaData?.meta_status
    const metaFullTextContent = metaStage?.full_text ?? metaData?.full_text
    const hasMetaFullText = Boolean(metaFullTextContent) || Boolean((document as Partial<Document>)._hasMetaText)

    const ocrStage = parseStage<OcrData>(document.stages?.ocr)
    const ocrData = parseStage<OcrData>(document.ocr)
    const ocrStatus = ocrStage?.status ?? ocrData?.status

    const textData = parseStage<TextData>(document.text)

    if (uploadStatus === 'completed') {
      if (
        embedStatus === 'completed' ||
        docEmbedStatus === 'completed' ||
        docEmbedStatus === 'done'
      ) {
        return 'completed'
      }

      if (
        hasMetaFullText &&
        metaStageStatus === 'completed' &&
        ocrStatus === 'pending'
      ) {
        return 'completed'
      }

      if (
        metaStageStatus === 'error' ||
        embedStatus === 'error' ||
        docEmbedStatus === 'error' ||
        docEmbedStatus === 'failed'
      ) {
        return 'error'
      }

      return 'processing'
    }

    if (!uploadData && !uploadStage) {
      return 'pending'
    }

    if (!metaData) {
      return 'pending'
    }

    if (metaStatus !== 'ok') {
      if (metaStatus === 'error') {
        return 'error'
      }
      if (metaStatus === 'pending' || !metaStatus) {
        return 'pending'
      }
      return 'processing'
    }

    // 간단한 경로 분석 (전체 분석은 필요 없음)
    if (docEmbedStatus === 'done' || docEmbedStatus === 'completed') {
      return 'completed'
    }

    if (docEmbedStatus === 'failed' || docEmbedStatus === 'error') {
      return 'error'
    }

    const hasOcrText = ocrData?.full_text || (document as Partial<Document>)._hasOcrText
    if (hasMetaFullText && !textData?.full_text && !hasOcrText) {
      return 'completed'
    }

    if (ocrStatus === 'error' || ocrStatus === 'quota_exceeded') {
      return 'error'
    }

    if (ocrStatus === 'done' || ocrStatus === 'completed') {
      return 'completed'
    }

    return 'processing'
  }

  /**
   * 상태 아이콘 반환 (내부 헬퍼)
   */
  private static getStatusIcon(status: DocumentStatus): string {
    switch (status) {
      case 'completed':
        return '✓'
      case 'processing':
        return '⟳'
      case 'uploading':
        return '↑'
      case 'converting':
        return '⟳'
      case 'extracting':
        return '⟳'
      case 'ocr_queued':
        return '○'
      case 'ocr_processing':
        return '⟳'
      case 'classifying':
        return '⟳'
      case 'embed_pending':
        return '○'
      case 'embedding':
        return '⟳'
      case 'error':
        return '✗'
      case 'pending':
        return '○'
      case 'timeout':
        return '⏱'
      case 'credit_pending':
        return '⏸'
      default:
        return '?'
    }
  }

  /**
   * 상태 레이블 반환 (내부 헬퍼)
   */
  private static getStatusLabel(status: DocumentStatus): string {
    switch (status) {
      case 'completed':
        return '완료'
      case 'processing':
        return '처리중'
      case 'uploading':
        return '업로드중'
      case 'converting':
        return 'PDF변환중'
      case 'extracting':
        return '텍스트추출'
      case 'ocr_queued':
        return 'OCR대기'
      case 'ocr_processing':
        return 'OCR처리중'
      case 'classifying':
        return 'AI분류중'
      case 'embed_pending':
        return '임베딩대기'
      case 'embedding':
        return '임베딩중'
      case 'error':
        return '오류'
      case 'pending':
        return '대기'
      case 'timeout':
        return '타임아웃'
      case 'credit_pending':
        return '크레딧 부족'
      default:
        return '알 수 없음'
    }
  }
}

