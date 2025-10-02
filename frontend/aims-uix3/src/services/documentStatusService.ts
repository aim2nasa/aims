/**
 * Document Status Service
 * @description 문서 처리 현황 API 및 비즈니스 로직
 */

import type {
  Document,
  DocumentStatus,
  DocumentStatusResponse,
  DocumentDetailResponse,
  HealthCheckResponse,
  ProcessingPathAnalysis,
  ProcessingPathType,
  UploadData,
  MetaData,
  OcrData,
  TextData
} from '../types/documentStatus'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://tars.giize.com:3010'
const N8N_WEBHOOK_URL = 'https://n8nd.giize.com/webhook/smartsearch'

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
  static async getDocumentDetailViaWebhook(documentId: string): Promise<any> {
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
      return data[0] || null
    } catch (error) {
      console.error('Webhook fetch failed:', error)
      throw error
    }
  }

  /**
   * MongoDB 구조에서 파일명 추출
   */
  static extractFilename(document: Document): string {
    // upload.originalName 우선
    if (document.upload) {
      let uploadData: UploadData = document.upload as UploadData
      if (typeof uploadData === 'string') {
        try {
          uploadData = JSON.parse(uploadData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (uploadData && uploadData.originalName) {
        return uploadData.originalName
      }
    }

    // stages.upload에서 originalName 찾기
    if (document.stages?.upload) {
      let uploadData: UploadData = document.stages.upload as UploadData
      if (typeof uploadData === 'string') {
        try {
          uploadData = JSON.parse(uploadData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (uploadData && uploadData.originalName) {
        return uploadData.originalName
      }
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
    if (document.meta) {
      let metaData: MetaData = document.meta as MetaData
      if (typeof metaData === 'string') {
        try {
          metaData = JSON.parse(metaData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (metaData && metaData.filename) {
        return metaData.filename
      }
    }

    if (document.stages?.meta) {
      let metaData: MetaData = document.stages.meta as MetaData
      if (typeof metaData === 'string') {
        try {
          metaData = JSON.parse(metaData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (metaData && metaData.filename) {
        return metaData.filename
      }
    }

    // 모든 단계에서 찾기
    if (document.stages) {
      for (const [, value] of Object.entries(document.stages)) {
        let data: any = value
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data)
          } catch (e) {
            continue
          }
        }
        if (data && (data.originalName || data.filename)) {
          return data.originalName || data.filename
        }
      }
    }

    return 'Unknown File'
  }

  /**
   * MongoDB 구조에서 saveName 추출
   */
  static extractSaveName(document: Document): string | null {
    // upload.saveName 우선
    if (document.upload) {
      let uploadData: UploadData = document.upload as UploadData
      if (typeof uploadData === 'string') {
        try {
          uploadData = JSON.parse(uploadData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (uploadData && uploadData.saveName) {
        return uploadData.saveName
      }
    }

    // stages.upload에서 saveName 찾기
    if (document.stages?.upload) {
      let uploadData: UploadData = document.stages.upload as UploadData
      if (typeof uploadData === 'string') {
        try {
          uploadData = JSON.parse(uploadData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (uploadData && uploadData.saveName) {
        return uploadData.saveName
      }
    }

    return null
  }

  /**
   * 문서 상태 추출
   */
  static extractStatus(document: Document): DocumentStatus {
    // 서버에서 계산된 overallStatus 우선 사용
    if (document.overallStatus) {
      return document.overallStatus
    }

    // 기본 status 필드 확인
    if (document.status) return document.status

    // stages 구조 확인 (레거시)
    if (document.stages?.upload?.status === 'completed') {
      // embed/docembed가 완료되면 completed
      if (
        document.stages?.embed?.status === 'completed' ||
        document.stages?.docembed?.status === 'completed'
      ) {
        return 'completed'
      }

      // meta.full_text가 있고 OCR만 pending이면 completed
      if (
        (document.stages?.meta?.full_text || (document.meta as MetaData)?.full_text) &&
        (document.stages?.meta as any)?.status === 'completed' &&
        (document.stages?.ocr as any)?.status === 'pending'
      ) {
        return 'completed'
      }

      // 에러 체크
      if (
        (document.stages?.meta as any)?.status === 'error' ||
        document.stages?.embed?.status === 'error' ||
        document.stages?.docembed?.status === 'error'
      ) {
        return 'error'
      }

      return 'processing'
    }

    const { pathType } = this.analyzeProcessingPath(document)

    // Upload 체크
    if (!document.upload) {
      return 'pending'
    }

    // Upload 후 아직 Meta가 시작되지 않았으면 pending
    if (!document.meta) {
      return 'pending'
    }

    const metaData = document.meta as MetaData

    // Meta 체크
    if (metaData.meta_status !== 'ok') {
      if (metaData.meta_status === 'error') {
        return 'error'
      }
      if (metaData.meta_status === 'pending' || !metaData.meta_status) {
        return 'pending'
      }
      return 'processing'
    }

    // 경로별 상태 결정
    switch (pathType) {
      case 'unsupported':
      case 'page_limit_exceeded':
      case 'ocr_skipped':
        return 'completed' // 지원하지 않는 파일들은 Meta 완료 시 끝

      case 'meta_fulltext':
        // Meta에서 full_text 추출 → DocEmbed로 바로 진행
        if (document.docembed) {
          const docembedData = document.docembed as any
          if (docembedData.status === 'done') return 'completed'
          if (docembedData.status === 'failed') return 'error'
          return 'processing'
        }
        // DocEmbed가 없지만 meta.full_text가 있으면 완료로 처리
        if (metaData.full_text) {
          return 'completed'
        }
        return 'pending' // DocEmbed 대기 중

      case 'text_plain':
        // text/plain 파일 → Text → DocEmbed
        const textData = document.text as TextData
        if (!textData || !textData.full_text) return 'processing'
        if (document.docembed) {
          const docembedData = document.docembed as any
          if (docembedData.status === 'done') return 'completed'
          if (docembedData.status === 'failed') return 'error'
          return 'processing'
        }
        return 'pending' // DocEmbed 대기 중

      case 'ocr_normal':
        // 일반 OCR 처리 → OCR → DocEmbed
        if (document.ocr) {
          const ocrData = document.ocr as OcrData
          if (ocrData.status === 'error') return 'error'
          if (ocrData.status === 'done') {
            if (document.docembed) {
              const docembedData = document.docembed as any
              if (docembedData.status === 'done') return 'completed'
              if (docembedData.status === 'failed') return 'error'
              return 'processing'
            }
            return 'pending' // DocEmbed 대기 중
          }
          return 'processing' // OCR 처리 중
        }
        return 'pending' // OCR 대기 중

      default:
        return 'processing'
    }
  }

  /**
   * 문서 진행률 추출
   */
  static extractProgress(document: Document): number {
    // 서버에서 계산된 progress 우선 사용
    if (document.progress !== undefined && document.progress !== null) {
      // embed가 완료되었거나 meta.full_text가 있으면 100%
      const embedCompleted =
        document.stages?.embed?.status === 'completed' ||
        document.stages?.docembed?.status === 'completed'

      const metaFullTextExists =
        ((document.stages?.meta as any)?.full_text || (document.meta as MetaData)?.full_text) &&
        (document.stages?.meta as any)?.status === 'completed'

      if (embedCompleted || metaFullTextExists) {
        return 100
      }
      return document.progress
    }

    // Status가 completed면 무조건 100%
    if (document.overallStatus === 'completed') {
      return 100
    }

    // DocEmbed/Embed가 완료된 경우 무조건 100%
    if (
      (document.docembed && (document.docembed as any).status === 'done') ||
      (document.embed && (document.embed as any).status === 'completed') ||
      (document.stages?.embed && document.stages.embed.status === 'completed')
    ) {
      return 100
    }

    const metaData = document.meta as MetaData

    if (metaData && metaData.meta_status === 'ok' && metaData.full_text) {
      return 75
    }

    if (metaData && metaData.meta_status === 'ok') {
      return 50
    }

    if (document.upload) {
      return 25
    }

    return 0
  }

  /**
   * 업로드 날짜 추출
   */
  static extractUploadedDate(document: Document): string | null {
    let dateString: string | null = null

    // upload.timestamp 우선
    if (document.upload) {
      let uploadData: UploadData = document.upload as UploadData
      if (typeof uploadData === 'string') {
        try {
          uploadData = JSON.parse(uploadData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (uploadData && uploadData.timestamp) {
        dateString = uploadData.timestamp
      } else if (uploadData && uploadData.uploaded_at) {
        dateString = uploadData.uploaded_at
      }
    }

    // stages.upload.timestamp
    if (!dateString && document.stages?.upload) {
      let uploadData: UploadData = document.stages.upload as UploadData
      if (typeof uploadData === 'string') {
        try {
          uploadData = JSON.parse(uploadData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (uploadData && uploadData.timestamp) {
        dateString = uploadData.timestamp
      } else if (uploadData && uploadData.uploaded_at) {
        dateString = uploadData.uploaded_at
      }
    }

    // meta.created_at
    if (!dateString && document.meta) {
      let metaData: MetaData = document.meta as MetaData
      if (typeof metaData === 'string') {
        try {
          metaData = JSON.parse(metaData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (metaData && metaData.created_at) {
        dateString = metaData.created_at
      }
    }

    // stages.meta.created_at
    if (!dateString && document.stages?.meta) {
      let metaData: MetaData = document.stages.meta as MetaData
      if (typeof metaData === 'string') {
        try {
          metaData = JSON.parse(metaData)
        } catch (e) {
          // 파싱 실패 시 무시
        }
      }
      if (metaData && metaData.created_at) {
        dateString = metaData.created_at
      }
    }

    // 기본 필드들
    if (!dateString) {
      dateString = document.uploaded_at || document.created_at || document.timestamp || null
    }

    // 날짜 문자열 정리
    if (dateString && typeof dateString === 'string') {
      dateString = dateString.replace(/xxx$/, '') // 끝의 xxx 제거
      dateString = dateString.replace(/\.\d{3}xxx$/, '') // .123xxx 패턴 제거
    }

    return dateString
  }

  /**
   * 처리 경로 분석
   */
  static analyzeProcessingPath(document: Document): ProcessingPathAnalysis {
    const badges: any[] = []
    let pathType: ProcessingPathType = 'unknown'
    let expectedStages: string[] = []

    // 1. Upload 단계
    if (document.upload) {
      badges.push({ type: 'U', name: 'Upload', status: 'completed', icon: 'Upload' })
    }

    const metaData = document.meta as MetaData

    // 2. Meta 단계
    if (metaData && metaData.meta_status === 'ok') {
      badges.push({ type: 'M', name: 'Meta', status: 'completed', icon: 'Database' })

      // 지원하지 않는 MIME 타입 체크
      const unsupportedMimes = ['application/postscript', 'application/zip', 'application/octet-stream']

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
    }

    // 3. Text 단계
    const textData = document.text as TextData
    if (textData && textData.full_text) {
      badges.push({ type: 'T', name: 'Text', status: 'completed', icon: 'FileText' })
      pathType = 'text_plain'
      expectedStages = ['U', 'M', 'T', 'E']
    }

    // 4. OCR 단계
    const ocrData = document.ocr as OcrData
    if (
      ocrData &&
      pathType !== 'meta_fulltext' &&
      !(document.docembed && (document.docembed as any).status === 'done')
    ) {
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

    // 5. DocEmbed 단계
    if (document.docembed) {
      const docembedData = document.docembed as any
      if (docembedData.status === 'done') {
        badges.push({ type: 'E', name: 'Embed', status: 'completed', icon: 'Package' })
      } else if (docembedData.status === 'failed') {
        badges.push({ type: 'E', name: 'Embed', status: 'error', icon: 'Package' })
      } else if (docembedData.status === 'processing') {
        badges.push({ type: 'E', name: 'Embed', status: 'processing', icon: 'Package' })
      }
    }

    // 경로 타입이 결정되지 않은 경우 기본값 설정
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
   */
  static extractSummary(document: Document): string {
    const metaData = document.meta as MetaData
    const ocrData = document.ocr as OcrData

    // meta에 full_text가 있는 경우 - meta summary 사용
    if (metaData && metaData.full_text && metaData.full_text.trim()) {
      if (metaData.summary && metaData.summary !== 'null') {
        return metaData.summary
      }
      // meta summary가 없으면 meta full_text의 앞부분 사용
      const cleanText = metaData.full_text.trim()
      return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText
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
    if (document.payload?.summary) {
      return document.payload.summary
    }

    return '문서 요약을 찾을 수 없습니다.'
  }

  /**
   * 문서 전체 텍스트 추출
   */
  static extractFullText(document: Document): string {
    const metaData = document.meta as MetaData
    const textData = document.text as TextData
    const ocrData = document.ocr as OcrData

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
    if (document.payload?.full_text) {
      return document.payload.full_text
    }

    return '문서의 전체 텍스트를 찾을 수 없습니다.'
  }
}
