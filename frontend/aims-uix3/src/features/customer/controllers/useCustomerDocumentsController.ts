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
import { handleApiError } from '@/shared/lib/api'

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
  mimeType?: string
  uploadedAt?: string
  sizeBytes?: number | null
  document: CustomerDocumentItem
  rawDetail: Record<string, unknown> | null
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
 * 문서 상세 응답에서 파일 메타데이터 추출
 */
const extractPreviewInfo = (
  detail: Record<string, unknown> | null,
  fallback: CustomerDocumentItem
): Omit<PreviewDocumentInfo, 'document' | 'rawDetail'> => {
  const asRec = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  const rec = detail as Record<string, unknown> | null
  const upload  = asRec(rec?.['upload'])
  const payload = asRec(rec?.['payload'])
  const meta    = asRec(rec?.['meta'])
  const getStr = (o: Record<string, unknown> | undefined, k: string): string | undefined => {
    const v = o?.[k]; return typeof v === 'string' ? v : undefined
  }
  const getNum = (o: Record<string, unknown> | undefined, k: string): number | undefined => {
    const v = o?.[k]; return typeof v === 'number' ? v : undefined
  }

  const originalName =
    getStr(upload, 'originalName') ??
    getStr(payload, 'original_name') ??
    getStr(meta, 'originalName') ??
    getStr(rec ?? undefined, 'originalName') ??
    getStr(rec ?? undefined, 'filename') ??
    fallback.originalName ??
    '이름 없는 문서'

  const destPath =
    getStr(upload, 'destPath') ??
    getStr(payload, 'dest_path') ??
    getStr(meta, 'destPath') ??
    getStr(rec ?? undefined, 'destPath') ??
    null

  const mimeType =
    getStr(upload, 'mimeType') ??
    getStr(payload, 'mime_type') ??
    getStr(meta, 'mimeType') ??
    getStr(meta, 'mime') ??
    getStr(rec ?? undefined, 'mimeType') ??
    getStr(rec ?? undefined, 'mime') ??
    fallback.mimeType

  const sizeBytes =
    getNum(upload, 'fileSize') ??
    getNum(upload, 'size') ??
    getNum(payload, 'size_bytes') ??
    getNum(meta, 'size_bytes') ??
    getNum(rec ?? undefined, 'size_bytes') ??
    fallback.fileSize ?? 0

  const uploadedAt =
    getStr(upload, 'uploaded_at') ??
    getStr(payload, 'uploaded_at') ??
    getStr(meta, 'uploaded_at') ??
    getStr(rec ?? undefined, 'uploaded_at') ??
    fallback.uploadedAt ??
    fallback.linkedAt

  return {
    id: fallback._id,
    originalName,
    fileUrl: buildFileUrl(destPath) ?? '',
    ...(mimeType ? { mimeType } : {}),
    ...((sizeBytes ?? null) !== null ? { sizeBytes } : {}),
    ...(uploadedAt ? { uploadedAt } : {}),
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
    } catch (err) {
      if (!mountedRef.current) return
      setError(handleApiError(err))
      setDocuments([])
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
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
        const detail = await DocumentStatusService.getDocumentDetailViaWebhook(document._id)

        if (!mountedRef.current) return

        if (!detail) {
          setPreviewState({
            isOpen: true,
            isLoading: false,
            error: '문서 상세 정보를 찾을 수 없습니다.',
            data: null,
            target: document
          })
          return
        }

        const recDetail: Record<string, unknown> | null = (detail && typeof detail === 'object' && !('_id' in detail)) ? (detail as Record<string, unknown>) : null
        const metadata = extractPreviewInfo(recDetail, document)

        setPreviewState({
          isOpen: true,
          isLoading: false,
          error: null,
          target: document,
          data: {
            ...metadata,
            document,
            rawDetail: recDetail
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
