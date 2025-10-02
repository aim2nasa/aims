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
import { DocumentStatusService } from '../services/documentStatusService'
import type { Document } from '../types/documentStatus'

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

        const data = await DocumentStatusService.getRecentDocuments(1000)
        const realDocuments = data.documents || []

        // 각 문서의 customer_relation 정보를 가져오기 위해 개별 문서 조회
        const documentsWithCustomerRelation = await Promise.all(
          realDocuments.map(async (doc) => {
            try {
              const detailedDoc = await DocumentStatusService.getDocumentStatus(doc._id || doc.id || '')
              return {
                ...doc,
                customer_relation: detailedDoc.data?.rawDocument?.customer_relation
              }
            } catch (error) {
              console.error(`Failed to fetch detailed info for document ${doc._id}:`, error)
              return { ...doc, customer_relation: undefined }
            }
          })
        )

        // 실제 DB 문서와 중복되지 않는 임시 문서들만 유지
        setDocuments((prevDocs) => {
          const tempDocs = prevDocs.filter((doc) => doc.id?.startsWith('temp-'))
          const realDocFilenames = documentsWithCustomerRelation.map((doc) =>
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
        setError('문서 목록을 불러올 수 없습니다.')
        console.error('Fetch documents error:', err)
        if (isInitialLoad) {
          setDocuments([])
        }
      } finally {
        if (isInitialLoad) {
          setLoading(false)
        }
      }
    },
    []
  )

  /**
   * 문서 목록 새로고침
   */
  const refreshDocuments = useCallback(async () => {
    await fetchDocuments(false)
  }, [fetchDocuments])

  /**
   * API 헬스 체크
   */
  const checkApiHealth = useCallback(async () => {
    try {
      await DocumentStatusService.checkHealth()
      setApiHealth(true)
    } catch (err) {
      setApiHealth(false)
    }
  }, [])

  /**
   * 초기 로드
   */
  useEffect(() => {
    fetchDocuments(true)
    checkApiHealth()
  }, [fetchDocuments, checkApiHealth])

  /**
   * initialFiles 변경 시 임시 문서 추가
   */
  useEffect(() => {
    if (initialFiles.length > 0) {
      setDocuments((prevDocs) => {
        const realDocs = prevDocs.filter((doc) => !doc.id?.startsWith('temp-'))
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
        const id = doc.id || doc._id || ''
        const searchTermLower = searchTerm.toLowerCase()

        const matchesFilename = filename.toLowerCase().includes(searchTermLower)
        const matchesId = id.toLowerCase().includes(searchTermLower)

        // Meta full_text 검색
        const metaFullText = (doc.meta as any)?.full_text || ''
        const matchesMetaText = metaFullText.toLowerCase().includes(searchTermLower)

        // OCR full_text 검색
        const ocrFullText = (doc.ocr as any)?.full_text || ''
        const matchesOcrText = ocrFullText.toLowerCase().includes(searchTermLower)

        // Text full_text 검색
        const textFullText = (doc.text as any)?.full_text || ''
        const matchesTextText = textFullText.toLowerCase().includes(searchTermLower)

        return matchesFilename || matchesId || matchesMetaText || matchesOcrText || matchesTextText
      })
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((doc) => DocumentStatusService.extractStatus(doc) === statusFilter)
    }

    setFilteredDocuments(filtered)
  }, [documents, searchTerm, statusFilter])

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
      apiHealth
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
      apiHealth
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
      setApiHealth,
      fetchDocuments,
      refreshDocuments,
      checkApiHealth
    }),
    [fetchDocuments, refreshDocuments, checkApiHealth]
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
