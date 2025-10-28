/**
 * Document Status Provider
 * @description 문서 처리 현황 상태 관리 Provider
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  DocumentStatusContext,
  type DocumentStatusState,
  type DocumentStatusActions,
  type DocumentStatusContextValue
} from '../contexts/DocumentStatusContext'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import type { Document, DocumentCustomerRelation } from '../types/documentStatus'

interface DocumentStatusProviderProps {
  children: React.ReactNode
  initialFiles?: Document[]
}

/**
 * DocumentStatusProvider 컴포넌트
 */
export const DocumentStatusProvider: React.FC<DocumentStatusProviderProps> = ({
  children,
  initialFiles = []
}) => {
  // State
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [isLoading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'completed' | 'processing' | 'error' | 'pending'
  >('all')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isPollingEnabled, setPollingEnabled] = useState<boolean>(true)
  const [apiHealth, setApiHealth] = useState<boolean | null>(null)

  // 🍎 Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [itemsPerPage, setItemsPerPage] = useState<number>(10)

  // 🍎 Fetch Limit State (가져올 문서 개수)
  const [fetchLimit, setFetchLimit] = useState<number>(100)

  // 🍎 Sort State
  const [sortField, setSortField] = useState<'filename' | 'status' | 'uploadDate' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  /**
   * 문서 목록 가져오기
   */
  const fetchDocuments = useCallback(
    async (isInitialLoad: boolean = false) => {
      try {
        if (isInitialLoad) {
          setLoading(true)
        }
        setError(null)

        const data = await DocumentStatusService.getRecentDocuments(fetchLimit)
        const realDocuments = data.files || data.data?.documents || data.documents || []

        // 각 문서의 customer_relation 정보를 가져오기 위해 개별 문서 조회
        const documentsWithCustomerRelation: Document[] = await Promise.all(
          realDocuments.map(async (doc: Document): Promise<Document> => {
            try {
              const detailedDoc = await DocumentStatusService.getDocumentStatus(doc._id || doc['id'] || '')

              // ✅ NEW: raw 필드 우선 사용, 하위 호환성 유지
              const customerRelation =
                detailedDoc.data?.raw?.customer_relation ||
                detailedDoc.data?.rawDocument?.customer_relation

              return {
                ...doc,
                customer_relation: customerRelation
              } as Document
            } catch (error) {
              console.error(`Failed to fetch detailed info for document ${doc._id}:`, error)
              return doc
            }
          })
        )

        // 실제 DB 문서와 중복되지 않는 임시 문서들만 유지
        setDocuments((prevDocs) => {
          const tempDocs = prevDocs.filter((doc) => doc['id']?.startsWith('temp-'))
          const realDocFilenames = documentsWithCustomerRelation.map((doc: Document) =>
            DocumentStatusService.extractFilename(doc).toLowerCase()
          )
          const uniqueTempDocs = tempDocs.filter((tempDoc) => {
            const tempFilename = DocumentStatusService.extractFilename(tempDoc).toLowerCase()
            return !realDocFilenames.includes(tempFilename)
          })

          return [...documentsWithCustomerRelation, ...uniqueTempDocs]
        })

        setLastUpdated(new Date())
      } catch (err) {
        if (typeof window !== 'undefined') {
          setError('문서 목록을 불러올 수 없습니다.')
        }
        console.error('Fetch documents error:', err)
        if (isInitialLoad && typeof window !== 'undefined') {
          setDocuments([])
        }
      } finally {
        if (isInitialLoad && typeof window !== 'undefined') {
          setLoading(false)
        }
      }
    },
    [fetchLimit]
  )

  /**
   * 문서 목록 새로고침
   */
  const refreshDocuments = useCallback(async () => {
    await fetchDocuments(false)
  }, [fetchDocuments])

  /**
   * 폴링 토글
   */
  const togglePolling = useCallback(() => {
    setPollingEnabled((prev) => !prev)
  }, [])

  /**
   * API 헬스 체크
   */
  const checkApiHealth = useCallback(async () => {
    // 테스트 환경에서는 헬스 체크 스킵
    if (typeof window === 'undefined') {
      return
    }

    try {
      await DocumentStatusService.checkHealth()
      // 테스트 환경 체크 (비동기 작업 후 재확인)
      if (typeof window !== 'undefined') {
        setApiHealth(true)
      }
    } catch {
      // 테스트 환경 체크 (비동기 작업 후 재확인)
      if (typeof window !== 'undefined') {
        setApiHealth(false)
      }
    }
  }, [])

  /**
   * 초기 로드
   */
  useEffect(() => {
    // 테스트 환경에서는 초기 로드 스킵
    if (typeof window === 'undefined') {
      setLoading(false)
      return
    }

    fetchDocuments(true)
    checkApiHealth()
  }, [fetchDocuments, checkApiHealth])

  /**
   * initialFiles 변경 시 임시 문서 추가
   */
  useEffect(() => {
    if (initialFiles.length > 0) {
      setDocuments((prevDocs) => {
        const realDocs = prevDocs.filter((doc) => !doc['id']?.startsWith('temp-'))
        const realDocFilenames = realDocs.map((doc) =>
          DocumentStatusService.extractFilename(doc).toLowerCase()
        )
        const newTempFiles = initialFiles.filter((file) => {
          const tempFilename = DocumentStatusService.extractFilename(file).toLowerCase()
          return !realDocFilenames.includes(tempFilename)
        })

        return [...realDocs, ...newTempFiles]
      })

      if (isLoading) {
        setLoading(false)
      }
    }
  }, [initialFiles, isLoading])

  /**
   * 실시간 폴링 (5초마다)
   */
  useEffect(() => {
    // 테스트 환경에서는 폴링 스킵
    if (typeof window === 'undefined') return
    if (!isPollingEnabled) return

    const interval = setInterval(() => {
      fetchDocuments(false)
      checkApiHealth()
    }, 5000)

    return () => clearInterval(interval)
  }, [isPollingEnabled, fetchDocuments, checkApiHealth])

  /**
   * 검색 및 필터링
   */
  useEffect(() => {
    let filtered = documents

    if (searchTerm) {
      filtered = filtered.filter((doc) => {
        const filename = DocumentStatusService.extractFilename(doc)
        const id = doc['id'] || doc._id || ''
        const searchTermLower = searchTerm.toLowerCase()

        const matchesFilename = filename.toLowerCase().includes(searchTermLower)
        const matchesId = id.toLowerCase().includes(searchTermLower)

        // Meta full_text 검색
        const metaFullText = (typeof doc.meta === 'object' && doc.meta !== null)
          ? doc.meta.full_text || ''
          : ''
        const matchesMetaText = metaFullText.toLowerCase().includes(searchTermLower)

        // OCR full_text 검색
        const ocrFullText = (typeof doc.ocr === 'object' && doc.ocr !== null)
          ? doc.ocr.full_text || ''
          : ''
        const matchesOcrText = ocrFullText.toLowerCase().includes(searchTermLower)

        // Text full_text 검색
        const textFullText = (typeof doc.text === 'object' && doc.text !== null)
          ? doc.text.full_text || ''
          : ''
        const matchesTextText = textFullText.toLowerCase().includes(searchTermLower)

        return matchesFilename || matchesId || matchesMetaText || matchesOcrText || matchesTextText
      })
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((doc) => DocumentStatusService.extractStatus(doc) === statusFilter)
    }

    setFilteredDocuments(filtered)
  }, [documents, searchTerm, statusFilter])

  // 🍎 Pagination Logic
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredDocuments.length / itemsPerPage)),
    [filteredDocuments.length, itemsPerPage]
  )

  const paginatedDocuments = useMemo(() => {
    // 🍎 Apply sorting
    let sortedDocs = [...filteredDocuments]
    if (sortField) {
      sortedDocs.sort((a, b) => {
        switch (sortField) {
          case 'filename': {
            const aFilename = DocumentStatusService.extractFilename(a).toLowerCase()
            const bFilename = DocumentStatusService.extractFilename(b).toLowerCase()
            return sortDirection === 'asc'
              ? aFilename.localeCompare(bFilename)
              : bFilename.localeCompare(aFilename)
          }
          case 'status': {
            const aStatus = DocumentStatusService.extractStatus(a)
            const bStatus = DocumentStatusService.extractStatus(b)
            return sortDirection === 'asc'
              ? aStatus.localeCompare(bStatus)
              : bStatus.localeCompare(aStatus)
          }
          case 'uploadDate': {
            const aDate = DocumentStatusService.extractUploadedDate(a)
            const bDate = DocumentStatusService.extractUploadedDate(b)
            const aTime = aDate ? new Date(aDate).getTime() : 0
            const bTime = bDate ? new Date(bDate).getTime() : 0
            return sortDirection === 'asc' ? aTime - bTime : bTime - aTime
          }
          default:
            return 0
        }
      })
    }

    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return sortedDocs.slice(startIndex, endIndex)
  }, [filteredDocuments, currentPage, itemsPerPage, sortField, sortDirection])

  // 🍎 Pagination Handlers
  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }, [totalPages])

  const handleLimitChange = useCallback((limit: number) => {
    setItemsPerPage(limit)
    setCurrentPage(1) // Reset to first page
  }, [])

  // 🍎 Fetch Limit Handler
  const handleFetchLimitChange = useCallback((limit: number) => {
    setFetchLimit(limit)
    setCurrentPage(1) // Reset to first page
  }, [])

  // 🍎 Sort Handler
  const handleColumnSort = useCallback((field: 'filename' | 'status' | 'uploadDate') => {
    if (sortField === field) {
      // Same field: toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field: set field and default to asc
      setSortField(field)
      setSortDirection('asc')
    }
  }, [sortField, sortDirection])

  /**
   * 특정 문서의 고객 연결 정보를 업데이트
   */
  const updateDocumentCustomerRelation = useCallback(
    (documentId: string, relation: DocumentCustomerRelation | undefined) => {
      setDocuments((prevDocs) =>
        prevDocs.map((doc) => {
          const docId = doc._id || doc['id']
          if (!docId) {
            return doc
          }
          if (docId !== documentId) {
            return doc
          }

          if (relation) {
            return {
              ...doc,
              customer_relation: relation
            }
          }

          const { customer_relation: _prevRelation, ...rest } = doc as Document & {
            customer_relation?: DocumentCustomerRelation
          }
          return rest
        })
      )

      setSelectedDocument((prevSelected) => {
        if (!prevSelected) {
          return prevSelected
        }
        const prevId = prevSelected._id || prevSelected['id']
        if (prevId !== documentId) {
          return prevSelected
        }

        if (relation) {
          return {
            ...prevSelected,
            customer_relation: relation
          }
        }

        const { customer_relation: _prevRelation, ...rest } = prevSelected as Document & {
          customer_relation?: DocumentCustomerRelation
        }
        return rest
      })
    },
    []
  )

  // 🍎 필터 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, searchTerm])

  // 🍎 fetchLimit 변경 시 문서 다시 가져오기
  useEffect(() => {
    if (typeof window === 'undefined') return
    fetchDocuments(false)
  }, [fetchLimit, fetchDocuments])

  // State 객체
  const state: DocumentStatusState = useMemo(
    () => ({
      documents,
      filteredDocuments,
      selectedDocument,
      isLoading,
      error,
      searchTerm,
      statusFilter,
      lastUpdated,
      isPollingEnabled,
      apiHealth,
      currentPage,
      itemsPerPage,
      totalPages,
      paginatedDocuments,
      fetchLimit,
      sortField,
      sortDirection
    }),
    [
      documents,
      filteredDocuments,
      selectedDocument,
      isLoading,
      error,
      searchTerm,
      statusFilter,
      lastUpdated,
      isPollingEnabled,
      apiHealth,
      currentPage,
      itemsPerPage,
      totalPages,
      paginatedDocuments,
      fetchLimit,
      sortField,
      sortDirection
    ]
  )

  // Actions 객체
  const actions: DocumentStatusActions = useMemo(
    () => ({
      setDocuments,
      setFilteredDocuments,
      setSelectedDocument,
      setLoading,
      setError,
      setSearchTerm,
      setStatusFilter,
      setLastUpdated,
      setPollingEnabled,
      togglePolling,
      setApiHealth,
      fetchDocuments,
      refreshDocuments,
      checkApiHealth,
      setCurrentPage,
      setItemsPerPage,
      handlePageChange,
      handleLimitChange,
      setFetchLimit,
      handleFetchLimitChange,
      updateDocumentCustomerRelation,
      setSortField,
      setSortDirection,
      handleColumnSort
    }),
    [
      fetchDocuments,
      refreshDocuments,
      togglePolling,
      checkApiHealth,
      handlePageChange,
      handleLimitChange,
      handleFetchLimitChange,
      updateDocumentCustomerRelation,
      handleColumnSort
    ]
  )

  // Context Value
  const value: DocumentStatusContextValue = useMemo(
    () => ({
      state,
      actions
    }),
    [state, actions]
  )

  return <DocumentStatusContext.Provider value={value}>{children}</DocumentStatusContext.Provider>
}
