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
  EmbedData
} from '../types/documentStatus'
import { DocumentProcessingModule } from '../entities/document/DocumentProcessingModule'

const API_BASE_URL = import.meta.env['VITE_API_URL'] || 'http://tars.giize.com:3010'
const N8N_WEBHOOK_URL = 'https://n8nd.giize.com/webhook/smartsearch'

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
      console.error('Health check failed:', error)
      throw error
    }
  }

  /**
   * 최근 문서 목록 조회
   */
  static async getRecentDocuments(limit: number = 1000): Promise<DocumentStatusResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/status?limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.success ? data.data : data
    } catch (error) {
      console.error('Get documents failed:', error)
      throw error
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
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Get document status failed:', error)
      throw error
    }
  }

  /**
   * n8n Webhook을 통한 문서 상세 조회
   */
  static async getDocumentDetailViaWebhook(documentId: string): Promise<Document | Record<string, unknown> | null> {
    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: documentId })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const detail = Array.isArray(data) ? data[0] : data
      if (detail && typeof detail === 'object') {
        return detail as Document | Record<string, unknown>
      }
      return null
    } catch (error) {
      console.error('Webhook fetch failed:', error)
      throw error
    }
  }

  /**
   * MongoDB 구조에서 파일명 추출
   */
  static extractFilename(document: Document): string {
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
   * 문서 상태 추출
   * @deprecated 내부적으로 DocumentProcessingModule 사용
   */
  static extractStatus(document: Document): DocumentStatus {
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
    const metaFullText = metaStage?.full_text ?? metaData?.full_text

    const uploadStage = parseStage<UploadData>(document.stages?.upload)
    const uploadData = parseStage<UploadData>(document.upload)
    const uploadExists = Boolean(uploadStage || uploadData || document.upload)

    const metaOk = metaData?.meta_status === 'ok'

    if (document.progress !== undefined && document.progress !== null) {
      const embedCompleted =
        embedStatus === 'completed' ||
        docEmbedStatus === 'completed' ||
        docEmbedStatus === 'done'
      const metaFullTextCompleted = Boolean(metaFullText) && metaStageStatus === 'completed'

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

    if (metaOk && metaData?.full_text) {
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
   * 업로드 날짜 추출
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

      // DocMeta에서 full_text가 추출된 경우
      if (metaData.full_text && metaData.full_text.trim().length > 0) {
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
   * "YYYY. MM. DD. HH:MM:SS" 형식으로 표시
   */
  static formatUploadDate(dateString: string | null): string {
    if (!dateString) return '-'

    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return '-'

      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')

      return `${year}. ${month}. ${day}. ${hours}:${minutes}:${seconds}`
    } catch {
      return '-'
    }
  }
}
