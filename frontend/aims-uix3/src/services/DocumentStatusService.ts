/**
 * Document Status Service
 * @description 문서 처리 현황 API 및 비즈니스 로직
 * @version 2.0.0 - DocumentProcessingModule 사용으로 리팩토링
 */

import type {
  Document,
  DocumentStatus,
  DocumentStatusResponse,
  DocumentDetailResponse,
  HealthCheckResponse,
  ProcessingPathAnalysis,
  ProcessingPathType,
  ProcessingStage,
  UploadData,
  MetaData,
  OcrData,
  TextData,
  DocEmbedData,
  EmbedData,
  RawDocumentData
} from '../types/documentStatus'
import { DocumentProcessingModule } from '../entities/document/DocumentProcessingModule'
import { formatDateTime } from '@/shared/lib/timeUtils'
import { getAuthHeaders } from '@/shared/lib/api'
import { errorReporter } from '@/shared/lib/errorReporter'

const API_BASE_URL = import.meta.env['VITE_API_URL'] || ''

type MaybeSerialized<T> = T | string | null | undefined

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

const toRecord = (input: MaybeSerialized<Record<string, unknown>>): Record<string, unknown> | undefined => {
  const parsed = parseStage<Record<string, unknown>>(input)
  if (parsed && typeof parsed === 'object') {
    return parsed
  }
  return undefined
}

/**
 * Document Status Service Class
 */
export class DocumentStatusService {
  /**
   * API Health Check
   */
  static async checkHealth(): Promise<HealthCheckResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      // Health check 실패는 중요한 에러이므로 유지
      console.error('[DocumentStatusService] Health check failed:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusService.checkHealth' })
      throw error
    }
  }

  /**
   * 최근 문서 목록 조회
   * @param page 페이지 번호 (1부터 시작)
   * @param limit 페이지당 항목 수
   * @param sort 정렬 옵션
   * @param search 검색어 (파일명 검색)
   * @param customerLink 고객 연결 필터 ('linked' | 'unlinked' | undefined)
   * @param fileScope 파일 범위 필터 ('all' | 'excludeMyFiles' | 'onlyMyFiles')
   */
  static async getRecentDocuments(page: number = 1, limit: number = 10, sort?: string, search?: string, customerLink?: 'linked' | 'unlinked', fileScope?: 'all' | 'excludeMyFiles' | 'onlyMyFiles', searchField?: 'displayName' | 'originalName', period?: string, initial?: string, initialType?: string): Promise<DocumentStatusResponse> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      })
      if (sort) {
        params.append('sort', sort)
      }
      if (search && search.trim()) {
        params.append('search', search.trim())
      }
      if (customerLink) {
        params.append('customerLink', customerLink)
      }
      if (fileScope) {
        params.append('fileScope', fileScope)
      }
      if (searchField) {
        params.append('searchField', searchField)
      }
      if (period) {
        params.append('period', period)
      }
      if (initial) {
        params.append('initial', initial)
      }
      if (initialType) {
        params.append('initialType', initialType)
      }

      const response = await fetch(`${API_BASE_URL}/api/documents/status?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.success ? data.data : data
    } catch (error) {
      console.error('[DocumentStatusService] Get documents failed:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusService.getRecentDocuments' })
      throw error
    }
  }

  /**
   * 문서 초성 카운트 조회 (DB 전체 대상)
   * @param fileScope 파일 범위 필터
   * @returns 초성별 카운트 (예: { 'ㄱ': 3, 'ㅋ': 1 })
   */
  static async getDocumentInitials(fileScope?: 'all' | 'excludeMyFiles' | 'onlyMyFiles'): Promise<Record<string, number>> {
    try {
      const params = new URLSearchParams()
      if (fileScope) params.append('fileScope', fileScope)

      const response = await fetch(`${API_BASE_URL}/api/documents/status/initials?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.success ? (data.data?.initials || {}) : {}
    } catch (error) {
      console.error('[DocumentStatusService] Get initials failed:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusService.getDocumentInitials' })
      return {}
    }
  }

  /**
   * 문서 탐색기 트리 조회 (서버사이드 집계)
   * @param fileScope 파일 범위 필터
   * @param initial 초성 필터 (설정 시 해당 초성의 문서도 반환)
   * @returns 고객 요약 + 초성 카운트 + (초성 선택 시) 문서 목록
   */
  static async getExplorerTree(fileScope?: string, initial?: string): Promise<{
    customers: Array<{ customerId: string; name: string; initial: string; docCount: number; latestUpload: string | null }>;
    totalCustomers: number;
    totalDocuments: number;
    initials: Record<string, number>;
    documents?: Document[];
  }> {
    try {
      const params = new URLSearchParams()
      if (fileScope) params.append('fileScope', fileScope)
      if (initial) params.append('initial', initial)

      const response = await fetch(`${API_BASE_URL}/api/documents/status/explorer-tree?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.success ? data.data : { customers: [], totalCustomers: 0, totalDocuments: 0, initials: {} }
    } catch (error) {
      console.error('[DocumentStatusService] Get explorer tree failed:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusService.getExplorerTree' })
      return { customers: [], totalCustomers: 0, totalDocuments: 0, initials: {} }
    }
  }

  /**
   * 특정 문서 상태 조회
   */
  static async getDocumentStatus(documentId: string): Promise<DocumentDetailResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[DocumentStatusService] Get document status failed:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusService.getDocumentStatus', payload: { documentId } })
      throw error
    }
  }

  /**
   * 문서 상세 정보 조회 (고객 문서 프리뷰용)
   * /api/documents/:id/status API 사용
   */
  static async getDocumentDetailViaWebhook(documentId: string): Promise<Document | Record<string, unknown> | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      if (data && typeof data === 'object') {
        return data as Document | Record<string, unknown>
      }
      return null
    } catch (error) {
      console.error('[DocumentStatusService] Get document detail failed:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentStatusService.getDocumentDetailViaWebhook', payload: { documentId } })
      throw error
    }
  }

  /**
   * 📦 NEW: raw 필드에서 파일명 추출 (투명성 보장)
   */
  static extractFilenameFromRaw(raw: RawDocumentData | undefined): string | null {
    if (!raw) return null

    // raw.upload.originalName 우선
    if (raw.upload?.originalName) {
      return raw.upload.originalName
    }

    // raw.meta.filename fallback
    if (raw.meta?.filename) {
      return raw.meta.filename
    }

    return null
  }

  /**
   * MongoDB 구조에서 파일명 추출
   * AR/CRS 파일의 경우 displayName이 있으면 우선 반환
   * @deprecated raw 필드 사용 권장 (extractFilenameFromRaw)
   */
  static extractFilename(document: Document): string {
    // 1. displayName이 있으면 우선 사용 (AR/CRS 내용 기반 이름)
    if (document.displayName) {
      return document.displayName
    }

    // 2. 기존 로직 (originalName fallback)
    const uploadData = parseStage<UploadData>(document.upload)
    if (uploadData?.originalName) {
      return uploadData.originalName
    }

    const stageUpload = parseStage<UploadData>(document.stages?.upload)
    if (stageUpload?.originalName) {
      return stageUpload.originalName
    }

    // 기본 필드에서 찾기
    const filename =
      document.originalName ||
      document.filename ||
      document.file_name ||
      document.name ||
      document.title

    if (filename) return filename

    // Meta에서 filename 찾기
    const metaData = parseStage<MetaData>(document.meta)
    if (metaData?.filename) {
      return metaData.filename
    }

    const metaStage = parseStage<MetaData>(document.stages?.meta)
    if (metaStage?.filename) {
      return metaStage.filename
    }

    // 모든 단계에서 찾기
    if (document.stages) {
      for (const value of Object.values(document.stages)) {
        const data = toRecord(value as MaybeSerialized<Record<string, unknown>>)
        const originalName = data?.['originalName']
        if (typeof originalName === 'string') {
          return originalName
        }
        const stageFilename = data?.['filename']
        if (typeof stageFilename === 'string') {
          return stageFilename
        }
      }
    }

    return 'Unknown File'
  }

  /**
   * MongoDB 구조에서 원본 파일명 추출 (displayName 무시)
   * AR/CRS 파일의 툴팁에 원본 파일명 표시용
   */
  static extractOriginalFilename(document: Document): string {
    // displayName 무시하고 항상 originalName 반환
    const uploadData = parseStage<UploadData>(document.upload)
    if (uploadData?.originalName) {
      return uploadData.originalName
    }

    const stageUpload = parseStage<UploadData>(document.stages?.upload)
    if (stageUpload?.originalName) {
      return stageUpload.originalName
    }

    // 기본 필드에서 찾기
    const filename =
      document.originalName ||
      document.filename ||
      document.file_name ||
      document.name ||
      document.title

    if (filename) return filename

    return 'Unknown File'
  }

  /**
   * MongoDB 구조에서 saveName 추출
   */
  static extractSaveName(document: Document): string | null {
    const uploadData = parseStage<UploadData>(document.upload)
    if (uploadData?.saveName) {
      return uploadData.saveName
    }

    const stageUpload = parseStage<UploadData>(document.stages?.upload)
    if (stageUpload?.saveName) {
      return stageUpload.saveName
    }

    return null
  }

  /**
   * 📦 NEW: raw 필드에서 파일 크기 추출 (투명성 보장)
   */
  static extractFileSizeFromRaw(raw: RawDocumentData | undefined): number | null {
    if (!raw) return null

    // raw.meta.size_bytes 우선
    if (raw.meta?.size_bytes !== undefined) {
      return raw.meta.size_bytes
    }

    // raw.upload.fileSize fallback
    if (raw.upload?.fileSize !== undefined) {
      return raw.upload.fileSize
    }

    return null
  }

  /**
   * 파일 크기 추출
   * @deprecated raw 필드 사용 권장 (extractFileSizeFromRaw)
   */
  static extractFileSize(document: Partial<Document>): number {
    const uploadData = parseStage<UploadData>(document.upload)
    if (uploadData?.fileSize !== undefined) {
      return uploadData.fileSize
    }

    const stageUpload = parseStage<UploadData>(document.stages?.upload)
    if (stageUpload?.fileSize !== undefined) {
      return stageUpload.fileSize
    }

    // 기본 필드에서 찾기
    if (document.size !== undefined) {
      return document.size
    }

    if (document.fileSize !== undefined) {
      return document.fileSize
    }

    if (document.file_size !== undefined) {
      return document.file_size
    }

    const metaData = parseStage<MetaData>(document.meta)
    if (metaData?.size !== undefined) {
      return metaData.size
    }

    const stageMeta = parseStage<MetaData>(document.stages?.meta)
    if (stageMeta?.size !== undefined) {
      return stageMeta.size
    }

    return 0
  }

  /**
   * 문서 상태 추출
   * @deprecated 내부적으로 DocumentProcessingModule 사용
   */
  static extractStatus(document: Partial<Document>): DocumentStatus {
    return DocumentProcessingModule.getProcessingStatus(document).status
  }

  /**
   * 문서 진행률 추출
   */
  static extractProgress(document: Document): number {
    const embedStage = parseStage<EmbedData>(document.stages?.embed)
    const embedData = parseStage<EmbedData>(document.embed)
    const embedStatus = embedStage?.status ?? embedData?.status

    const docEmbedStage = parseStage<DocEmbedData>(document.stages?.docembed)
    const docEmbedData = parseStage<DocEmbedData>(document.docembed)
    const docEmbedStatus = docEmbedStage?.status ?? docEmbedData?.status

    const metaStage = parseStage<MetaData>(document.stages?.meta)
    const metaData = parseStage<MetaData>(document.meta)
    const metaStageStatus = metaStage?.status
    const metaFullTextContent = metaStage?.full_text ?? metaData?.full_text
    const hasMetaText = Boolean(metaFullTextContent) || Boolean((document as Partial<Document>)._hasMetaText)

    const uploadStage = parseStage<UploadData>(document.stages?.upload)
    const uploadData = parseStage<UploadData>(document.upload)
    const uploadExists = Boolean(uploadStage || uploadData || document.upload)

    const metaOk = metaData?.meta_status === 'ok'

    if (document.progress !== undefined && document.progress !== null) {
      const embedCompleted =
        embedStatus === 'completed' ||
        docEmbedStatus === 'completed' ||
        docEmbedStatus === 'done'
      const metaFullTextCompleted = hasMetaText && metaStageStatus === 'completed'

      if (embedCompleted || metaFullTextCompleted) {
        return 100
      }
      return document.progress
    }

    if (document.overallStatus === 'completed') {
      return 100
    }

    if (
      docEmbedStatus === 'done' ||
      docEmbedStatus === 'completed' ||
      embedStatus === 'completed'
    ) {
      return 100
    }

    if (metaOk && hasMetaText) {
      return 75
    }

    if (metaOk) {
      return 50
    }

    if (uploadExists) {
      return 25
    }

    return 0
  }

  /**
   * 📦 NEW: raw 필드에서 업로드 날짜 추출 (투명성 보장)
   */
  static extractUploadedDateFromRaw(raw: RawDocumentData | undefined): string | null {
    if (!raw) return null

    // raw.upload.uploaded_at 우선
    let dateString = raw.upload?.uploaded_at ?? raw.upload?.timestamp ?? null

    // raw.meta.created_at fallback
    if (!dateString) {
      dateString = raw.meta?.created_at ?? null
    }

    // 날짜 문자열 정리 (잘못된 밀리초 형식 제거)
    if (dateString && typeof dateString === 'string') {
      dateString = dateString.replace(/xxx$/, '')
      dateString = dateString.replace(/\.\d{3}xxx$/, '')
    }

    return dateString
  }

  /**
   * 업로드 날짜 추출
   * @deprecated raw 필드 사용 권장 (extractUploadedDateFromRaw)
   */
  static extractUploadedDate(document: Document): string | null {
    const uploadData = parseStage<UploadData>(document.upload)
    const stageUpload = parseStage<UploadData>(document.stages?.upload)
    const metaData = parseStage<MetaData>(document.meta)
    const stageMeta = parseStage<MetaData>(document.stages?.meta)

    let dateString =
      uploadData?.timestamp ??
      uploadData?.uploaded_at ??
      stageUpload?.timestamp ??
      stageUpload?.uploaded_at ??
      metaData?.created_at ??
      stageMeta?.created_at ??
      document.uploaded_at ??
      document.created_at ??
      document.timestamp ??
      null

    if (dateString && typeof dateString === 'string') {
      dateString = dateString.replace(/xxx$/, '')
      dateString = dateString.replace(/\.\d{3}xxx$/, '')
    }

    return dateString
  }

  /**
   * 처리 경로 분석
   */
  static analyzeProcessingPath(document: Document): ProcessingPathAnalysis {
    const badges: ProcessingStage[] = []
    let pathType: ProcessingPathType = 'unknown'
    let expectedStages: string[] = []

    const uploadData = parseStage<UploadData>(document.upload) ?? parseStage<UploadData>(document.stages?.upload)
    if (uploadData || document.upload) {
      badges.push({ type: 'U', name: 'Upload', status: 'completed', icon: 'Upload' })
    }

    const metaData = parseStage<MetaData>(document.meta)

    const unsupportedMimes = ['application/postscript', 'application/zip', 'application/octet-stream']

    if (metaData && metaData.meta_status === 'ok') {
      badges.push({ type: 'M', name: 'Meta', status: 'completed', icon: 'Database' })

      if (metaData.mime && unsupportedMimes.includes(metaData.mime)) {
        pathType = 'unsupported'
        expectedStages = ['U', 'M']
        return { badges, pathType, expectedStages }
      }

      // PDF 페이지 수 초과 체크
      if (metaData.pdf_pages && parseInt(String(metaData.pdf_pages)) > 30) {
        pathType = 'page_limit_exceeded'
        expectedStages = ['U', 'M']
        return { badges, pathType, expectedStages }
      }

      // DocMeta에서 full_text가 추출된 경우 (_hasMetaText: 경량화 API 플래그)
      if ((metaData.full_text && metaData.full_text.trim().length > 0) || (document as Partial<Document>)._hasMetaText) {
        pathType = 'meta_fulltext'
        expectedStages = ['U', 'M', 'E']
      }
    } else if (metaData && metaData.meta_status === 'error') {
      badges.push({ type: 'M', name: 'Meta', status: 'error', icon: 'Database' })
      pathType = 'processing'
      expectedStages = ['U', 'M']
      return { badges, pathType, expectedStages }
    } else if (metaData && metaData.meta_status === 'pending') {
      badges.push({ type: 'M', name: 'Meta', status: 'processing', icon: 'Database' })
      pathType = 'processing'
      expectedStages = ['U', 'M']
      return { badges, pathType, expectedStages }
    } else {
      badges.push({ type: 'M', name: 'Meta', status: 'processing', icon: 'Database' })
    }

    const textData = parseStage<TextData>(document.text)
    if (textData && textData.full_text) {
      badges.push({ type: 'T', name: 'Text', status: 'completed', icon: 'FileText' })
      pathType = 'text_plain'
      expectedStages = ['U', 'M', 'T', 'E']
    }

    const docEmbedData = parseStage<DocEmbedData>(document.docembed)
    const docEmbedStatus = docEmbedData?.status

    const ocrData = parseStage<OcrData>(document.ocr)
    if (ocrData && pathType !== 'meta_fulltext' && docEmbedStatus !== 'done') {
      if (ocrData.warn) {
        badges.push({ type: 'O', name: 'OCR', status: 'skipped', icon: 'Eye' })
        if (pathType === 'unknown') {
          pathType = 'ocr_skipped'
          expectedStages = ['U', 'M']
        }
      } else if (ocrData.status === 'done') {
        badges.push({ type: 'O', name: 'OCR', status: 'completed', icon: 'Eye' })
        if (pathType === 'unknown') {
          pathType = 'ocr_normal'
          expectedStages = ['U', 'M', 'O', 'E']
        }
      } else if (ocrData.status === 'error') {
        badges.push({ type: 'O', name: 'OCR', status: 'error', icon: 'Eye' })
      } else if (ocrData.status === 'running') {
        badges.push({ type: 'O', name: 'OCR', status: 'processing', icon: 'Eye' })
        if (pathType === 'unknown') {
          pathType = 'ocr_normal'
          expectedStages = ['U', 'M', 'O', 'E']
        }
      } else if (ocrData.queue) {
        badges.push({ type: 'O', name: 'OCR', status: 'pending', icon: 'Eye' })
        if (pathType === 'unknown') {
          pathType = 'ocr_normal'
          expectedStages = ['U', 'M', 'O', 'E']
        }
      }
    }

    if (docEmbedData) {
      if (docEmbedData.status === 'done' || docEmbedData.status === 'completed') {
        badges.push({ type: 'E', name: 'Embed', status: 'completed', icon: 'Package' })
      } else if (docEmbedData.status === 'failed' || docEmbedData.status === 'error') {
        badges.push({ type: 'E', name: 'Embed', status: 'error', icon: 'Package' })
      } else if (docEmbedData.status === 'processing' || docEmbedData.status === 'running') {
        badges.push({ type: 'E', name: 'Embed', status: 'processing', icon: 'Package' })
      }
    }

    if (pathType === 'unknown') {
      if (metaData && metaData.meta_status === 'ok') {
        pathType = 'ocr_normal'
        expectedStages = ['U', 'M', 'O', 'E']
      } else {
        pathType = 'processing'
        expectedStages = ['U', 'M']
      }
    }

    return { badges, pathType, expectedStages }
  }

  /**
   * 문서 요약 추출
   * @deprecated 내부적으로 DocumentProcessingModule 사용
   */
  static extractSummary(document: Document): string {
    return DocumentProcessingModule.extractSummary(document) ?? '문서 요약을 찾을 수 없습니다.'
  }

  /**
   * 문서 전체 텍스트 추출
   * @deprecated 내부적으로 DocumentProcessingModule 사용
   */
  static extractFullText(document: Document): string {
    return DocumentProcessingModule.extractFullText(document) ?? '문서의 전체 텍스트를 찾을 수 없습니다.'
  }

  /**
   * 상태 레이블 반환
   * @deprecated 내부적으로 DocumentProcessingModule 사용
   */
  static getStatusLabel(status: DocumentStatus): string {
    // 임시 document 객체 생성하여 모듈 호출
    const tempDoc: Document = { status }
    return DocumentProcessingModule.getProcessingStatus(tempDoc).label
  }

  /**
   * 상태 아이콘 반환
   * @deprecated 내부적으로 DocumentProcessingModule 사용
   */
  static getStatusIcon(status: DocumentStatus): string {
    // 임시 document 객체 생성하여 모듈 호출
    const tempDoc: Document = { status }
    return DocumentProcessingModule.getProcessingStatus(tempDoc).icon
  }

  /**
   * 업로드 날짜 포맷
   * "YYYY.MM.DD HH:mm:ss" 형식으로 표시
   */
  static formatUploadDate(dateString: string | null): string {
    if (!dateString) return '-'
    const result = formatDateTime(dateString)
    // formatDateTime이 에러 메시지를 반환하면 '-'로 대체
    if (result === '잘못된 시간') return '-'
    return result
  }
}
