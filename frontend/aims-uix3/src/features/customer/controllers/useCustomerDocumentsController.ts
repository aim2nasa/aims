/**
 * useCustomerDocumentsController
 * @since 2025-10-25
 *
 * 고객 상세 문서 탭 전용 컨트롤러 훅
 * - DocumentService를 통해 고객별 문서 목록 관리
 * - 문서 프리뷰, 다운로드, 연결 해제 로직 캡슐화
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DocumentService,
  type CustomerDocumentItem
} from '@/services/DocumentService'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { handleApiError, isRequestCancelledError } from '@/shared/lib/api'

interface UseCustomerDocumentsControllerOptions {
  /** 마운트 시 자동 로드 여부 (기본값 true) */
  autoLoad?: boolean
  /** 로딩 활성화 여부 (기본값 true) */
  enabled?: boolean
  /** 문서 개수 변경 시 콜백 */
  onDocumentsChange?: (count: number) => void
}

export interface PreviewDocumentInfo {
  id: string
  originalName: string
  fileUrl: string | null
  /** 프리뷰용 URL (변환된 PDF 또는 원본) */
  previewFileUrl: string | null
  mimeType?: string
  uploadedAt?: string
  sizeBytes?: number | null
  /** PDF 변환 상태 */
  conversionStatus?: string | null
  /** 프리뷰 가능 여부 */
  canPreview?: boolean
  /** 변환된 PDF로 프리뷰하는지 여부 */
  isConverted?: boolean
  /** 원본 파일 확장자 (예: 'xlsx', 'pptx') */
  originalExtension?: string
  document: CustomerDocumentItem
  rawDetail: Record<string, unknown> | null
  /** 바이러스 스캔 정보 */
  virusScan?: {
    status?: 'pending' | 'clean' | 'infected' | 'deleted' | 'error'
    threatName?: string
  }
}

interface PreviewState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
  data: PreviewDocumentInfo | null
  target: CustomerDocumentItem | null
}

/**
 * 파일 경로를 절대 URL로 변환
 */
const buildFileUrl = (path?: string | null): string | null => {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalized = path.startsWith('/data') ? path.replace('/data', '') : path
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `https://tars.giize.com${prefixed}`
}

/**
 * 문서 상세 응답에서 파일 메타데이터 추출 (원본 방식 복원)
 * @param detail - API 응답의 raw 데이터
 * @param computed - API 응답의 computed 데이터 (PDF 변환 정보 포함)
 * @param fallback - 폴백용 문서 정보
 */
const extractPreviewInfo = (
  detail: Record<string, any> | null,
  computed: Record<string, any> | null,
  fallback: CustomerDocumentItem
): Omit<PreviewDocumentInfo, 'document' | 'rawDetail'> => {
  const upload = detail?.['upload']
  const payload = detail?.['payload']
  const meta = detail?.['meta']

  const originalName =
    upload?.originalName ??
    payload?.original_name ??
    meta?.originalName ??
    detail?.['originalName'] ??
    detail?.['filename'] ??
    fallback.originalName ??
    '이름 없는 문서'

  const destPath =
    upload?.destPath ??
    payload?.dest_path ??
    meta?.destPath ??
    detail?.['destPath'] ??
    null

  // PDF 변환 관련 정보 (computed에서 추출)
  const previewFilePath = computed?.['previewFilePath'] ?? null
  const conversionStatus = computed?.['conversionStatus'] ?? upload?.['conversion_status'] ?? null
  const canPreview = computed?.['canPreview'] ?? false

  const mimeType =
    upload?.mimeType ??
    payload?.mime_type ??
    meta?.mimeType ??
    meta?.mime ??
    detail?.['mimeType'] ??
    detail?.['mime'] ??
    fallback.mimeType

  const sizeBytes =
    upload?.fileSize ??
    upload?.size ??
    payload?.size_bytes ??
    meta?.size_bytes ??
    detail?.['size_bytes'] ??
    fallback.fileSize ??
    null

  const uploadedAt =
    upload?.uploaded_at ??
    payload?.uploaded_at ??
    meta?.uploaded_at ??
    detail?.['uploaded_at'] ??
    fallback.uploadedAt ??
    fallback.linkedAt

  const fileUrl = buildFileUrl(destPath)
  const previewFileUrl = buildFileUrl(previewFilePath) ?? fileUrl

  // 변환된 PDF로 프리뷰하는지 여부 (previewFileUrl이 fileUrl과 다르고 .pdf로 끝나면 변환된 것)
  const isConverted = !!(
    previewFileUrl &&
    fileUrl &&
    previewFileUrl !== fileUrl &&
    previewFileUrl.toLowerCase().endsWith('.pdf')
  )

  // 원본 파일 확장자 추출
  const extMatch = originalName.match(/\.([^.]+)$/)
  const originalExtension = extMatch ? extMatch[1].toLowerCase() : undefined

  return {
    id: fallback._id,
    originalName,
    fileUrl,
    previewFileUrl,
    mimeType,
    sizeBytes,
    uploadedAt: uploadedAt ?? undefined,
    conversionStatus,
    canPreview,
    isConverted,
    originalExtension
  }
}

export const useCustomerDocumentsController = (
  customerId: string | null | undefined,
  options: UseCustomerDocumentsControllerOptions = {}
) => {
  const {
    autoLoad = true,
    enabled = true,
    onDocumentsChange
  } = options

  const [documents, setDocuments] = useState<CustomerDocumentItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)

  const [previewState, setPreviewState] = useState<PreviewState>({
    isOpen: false,
    isLoading: false,
    error: null,
    data: null,
    target: null
  })

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadDocuments = useCallback(async () => {
    if (!customerId || !enabled) {
      setDocuments([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await DocumentService.getCustomerDocuments(customerId)
      if (!mountedRef.current) return

      const nextDocuments = response.documents ?? []
      setDocuments(nextDocuments)
      setLastUpdated(Date.now())
      setIsLoading(false) // 🔧 성공 시에만 로딩 종료
    } catch (err) {
      if (!mountedRef.current) return
      // 🔧 취소된 요청은 조용히 무시 (고객 전환 등 정상적인 상황)
      if (isRequestCancelledError(err)) {
        // setIsLoading(false) 호출하지 않음 - 새 요청이 진행 중
        return
      }
      setError(handleApiError(err))
      setDocuments([])
      setIsLoading(false) // 🔧 실제 에러 시에만 로딩 종료
    }
    // 🔧 finally 제거 - 취소된 요청에서 setIsLoading(false) 호출하면 새 요청의 로딩 상태가 풀림
  }, [customerId, enabled])

  // 자동 로드
  useEffect(() => {
    if (!customerId) {
      setDocuments([])
      setError(null)
      return
    }

    if (enabled && autoLoad) {
      void loadDocuments()
    }
  }, [customerId, enabled, autoLoad, loadDocuments])

  // 문서 개수 변경 알림
  useEffect(() => {
    onDocumentsChange?.(documents.length)
  }, [documents.length, onDocumentsChange])

  const refresh = useCallback(async () => {
    await loadDocuments()
  }, [loadDocuments])

  const unlinkDocument = useCallback(
    async (documentId: string) => {
      if (!customerId) return

      setUnlinkingId(documentId)
      setError(null)

      try {
        await DocumentService.unlinkDocumentFromCustomer(customerId, documentId)
        if (!mountedRef.current) return

        setDocuments(prev => prev.filter(doc => doc._id !== documentId))
        setLastUpdated(Date.now())
      } catch (err) {
        if (!mountedRef.current) return
        setError(handleApiError(err))
      } finally {
        if (mountedRef.current) {
          setUnlinkingId(null)
        }
      }
    },
    [customerId]
  )

  const openPreview = useCallback(
    async (document: CustomerDocumentItem) => {
      if (!document?._id) return

      setPreviewState({
        isOpen: true,
        isLoading: true,
        error: null,
        data: null,
        target: document
      })

      try {
        const response = await DocumentStatusService.getDocumentDetailViaWebhook(document._id)

        if (!mountedRef.current) return

        if (!response) {
          setPreviewState({
            isOpen: true,
            isLoading: false,
            error: '문서 상세 정보를 찾을 수 없습니다.',
            data: null,
            target: document
          })
          return
        }

        // API 응답 구조: { success: true, data: { raw: {...}, computed: {...} } }
        const apiResponse = response as Record<string, any>
        const raw = apiResponse['data']?.['raw'] || apiResponse['raw'] || response
        const computed = apiResponse['data']?.['computed'] || apiResponse['computed'] || null

        // raw + computed 데이터에서 메타데이터 추출
        const metadata = extractPreviewInfo(raw, computed, document)

        setPreviewState({
          isOpen: true,
          isLoading: false,
          error: null,
          target: document,
          data: {
            ...metadata,
            document,
            rawDetail: raw
          }
        })
      } catch (err) {
        if (!mountedRef.current) return
        setPreviewState({
          isOpen: true,
          isLoading: false,
          error: handleApiError(err),
          data: null,
          target: document
        })
      }
    },
    []
  )

  const closePreview = useCallback(() => {
    setPreviewState({
      isOpen: false,
      isLoading: false,
      error: null,
      data: null,
      target: null
    })
  }, [])

  const retryPreview = useCallback(async () => {
    if (previewState.target) {
      await openPreview(previewState.target)
    }
  }, [openPreview, previewState.target])

  const documentCount = documents.length
  const isEmpty = !isLoading && documentCount === 0

  const statusSummary = useMemo(() => {
    return documents.reduce<Record<string, number>>((acc, doc) => {
      const rawStatus =
        doc.status ??
        (doc as { overallStatus?: string }).overallStatus ??
        'linked'
      const statusKey = String(rawStatus).toLowerCase()
      acc[statusKey] = (acc[statusKey] ?? 0) + 1
      return acc
    }, {})
  }, [documents])

  // 🍎 낙관적 업데이트: 문서 로컬 상태 즉시 업데이트
  const updateDocumentLocally = useCallback((documentId: string, updates: Partial<CustomerDocumentItem>) => {
    setDocuments(prev => prev.map(doc =>
      doc._id === documentId ? { ...doc, ...updates } : doc
    ))
  }, [])

  return {
    documents,
    documentCount,
    isLoading,
    isEmpty,
    error,
    lastUpdated,
    unlinkingId,
    statusSummary,

    // Actions
    refresh,
    unlinkDocument,
    updateDocumentLocally,

    // Preview
    previewState,
    previewTarget: previewState.target,
    retryPreview,
    openPreview,
    closePreview
  }
}

export type UseCustomerDocumentsControllerReturn = ReturnType<typeof useCustomerDocumentsController>

export default useCustomerDocumentsController
