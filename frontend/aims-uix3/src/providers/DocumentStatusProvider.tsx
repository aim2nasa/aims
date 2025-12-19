/**
 * Document Status Provider
 * @description 문서 처리 현황 상태 관리 Provider
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  DocumentStatusContext,
  type DocumentStatusState,
  type DocumentStatusActions,
  type DocumentStatusContextValue
} from '../contexts/DocumentStatusContext'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { getAuthHeaders } from '@/shared/lib/api'
import { useDocumentStatusListSSE } from '@/shared/hooks/useDocumentStatusListSSE'
import type { Document, DocumentCustomerRelation } from '../types/documentStatus'

interface DocumentStatusProviderProps {
  children: React.ReactNode
  initialFiles?: Document[]
  searchQuery?: string
  fileScope?: 'all' | 'excludeMyFiles' | 'onlyMyFiles'
}

/**
 * DocumentStatusProvider 컴포넌트
 */
export const DocumentStatusProvider: React.FC<DocumentStatusProviderProps> = ({
  children,
  initialFiles = [],
  searchQuery = '',
  fileScope = 'all'
}) => {
  // State
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [isLoading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // 🔄 SSE 실시간 업데이트 활성화 여부 (기존 isPollingEnabled와 호환 유지)
  const [isPollingEnabled, setPollingEnabled] = useState<boolean>(true)
  const [apiHealth, setApiHealth] = useState<boolean | null>(null)

  // 🍎 Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [itemsPerPage, setItemsPerPage] = useState<number>(() => {
    // localStorage에서 저장된 값 불러오기
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aims-items-per-page')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed > 0) {
          return parsed
        }
      }
    }
    return 15 // 기본값 (10 → 15로 변경)
  })
  const [totalPages, setTotalPages] = useState<number>(1)
  const [totalCount, setTotalCount] = useState<number>(0)

  // 🍎 Sort State
  const [sortField, setSortField] = useState<'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | null>('uploadDate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  /**
   * 문서 목록 가져오기
   * 🍎 페이지네이션 기반: 현재 페이지와 페이지당 항목 수에 따라 데이터 가져오기
   * 🔍 검색어가 있으면 백엔드에 전달하여 전체 라이브러리 검색
   */
  const fetchDocuments = useCallback(
    async (isInitialLoad: boolean = false) => {
      try {
        if (isInitialLoad) {
          setLoading(true)
        }
        setError(null)

        // 🍎 백엔드 정렬 파라미터 생성
        let sortParam: string | undefined = undefined
        if (sortField === 'status') {
          sortParam = sortDirection === 'asc' ? 'status_asc' : 'status_desc'
        } else if (sortField === 'filename') {
          sortParam = sortDirection === 'asc' ? 'filename_asc' : 'filename_desc'
        } else if (sortField === 'uploadDate') {
          sortParam = sortDirection === 'asc' ? 'uploadDate_asc' : 'uploadDate_desc'
        } else if (sortField === 'fileSize') {
          sortParam = sortDirection === 'asc' ? 'fileSize_asc' : 'fileSize_desc'
        } else if (sortField === 'mimeType') {
          sortParam = sortDirection === 'asc' ? 'mimeType_asc' : 'mimeType_desc'
        } else if (sortField === 'customer') {
          sortParam = sortDirection === 'asc' ? 'customer_asc' : 'customer_desc'
        } else if (sortField === 'badgeType') {
          // badgeType은 백엔드에서 정렬 (전체 DB 대상)
          sortParam = sortDirection === 'asc' ? 'badgeType_asc' : 'badgeType_desc'
        }

        // 🔍 검색어 준비 (trim 처리)
        const searchQuery = searchTerm.trim() || undefined

        // 🍎 파일 범위 필터 파라미터 준비
        const fileScopeParam = fileScope === 'all' ? undefined : fileScope

        // 🍎 페이지네이션 기반으로 변경: page와 limit 전달
        // 🔍 검색어도 함께 전달하여 백엔드에서 전체 라이브러리 검색
        // 🍎 파일 범위 필터도 백엔드로 전달
        const data = await DocumentStatusService.getRecentDocuments(currentPage, itemsPerPage, sortParam, searchQuery, undefined, fileScopeParam)
        const realDocuments = data.files || data.data?.documents || data.documents || []

        // 🍎 백엔드 pagination 정보 저장
        if (data.data?.pagination) {
          setTotalPages(data.data.pagination.totalPages || 1)
          setTotalCount(data.data.pagination.totalCount || 0)
        } else if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1)
          setTotalCount(data.pagination.totalCount || 0)
        }

        // ✅ FIX: /api/documents/status API가 이미 customer_relation을 반환하므로
        // 개별 문서 조회 없이 바로 사용 (N+1 쿼리 방지 + customer_name 보존)
        // 🍎 customer_type 일괄 조회 추가 (DocumentSearchView 패턴 참고)
        const customerIds = new Set<string>()
        realDocuments.forEach((doc: Document) => {
          if (doc.customer_relation?.customer_id) {
            customerIds.add(String(doc.customer_relation.customer_id))
          }
        })

        // customer_type 일괄 조회
        const customerTypeMap: Record<string, string | null> = {}
        if (customerIds.size > 0) {
          await Promise.all(
            Array.from(customerIds).map(async (customerId) => {
              try {
                // ⭐ JWT 인증으로 설계사별 고객 데이터 격리
                const customerResponse = await fetch(`/api/customers/${customerId}`, {
                  headers: getAuthHeaders()
                })
                if (customerResponse.ok) {
                  const customerData = await customerResponse.json()
                  if (customerData.success && customerData.data) {
                    customerTypeMap[customerId] = customerData.data.insurance_info?.customer_type || null
                  }
                }
              } catch (error) {
                console.error(`[DocumentStatusProvider] 고객 ${customerId} 조회 오류:`, error)
              }
            })
          )
        }

        // customer_type을 customer_relation에 추가
        const documentsWithCustomerRelation: Document[] = realDocuments.map((doc: Document): Document => {
          const customerId = doc.customer_relation?.customer_id ? String(doc.customer_relation.customer_id) : null
          const customerType = customerId ? customerTypeMap[customerId] : null

          return {
            ...doc,
            // API가 이미 customer_relation (customer_name 포함)을 반환함
            customer_relation: doc.customer_relation ? {
              ...doc.customer_relation,
              customer_type: customerType
            } : undefined
          } as Document
        })

        // 실제 DB 문서와 중복되지 않는 임시 문서들만 유지
        // 🔧 깜빡임 방지: 문서 변경 시에만 상태 업데이트
        setDocuments((prevDocs) => {
          const tempDocs = prevDocs.filter((doc) => doc['id']?.startsWith('temp-'))
          const realDocFilenames = documentsWithCustomerRelation.map((doc: Document) =>
            DocumentStatusService.extractFilename(doc).toLowerCase()
          )
          const uniqueTempDocs = tempDocs.filter((tempDoc) => {
            const tempFilename = DocumentStatusService.extractFilename(tempDoc).toLowerCase()
            return !realDocFilenames.includes(tempFilename)
          })

          const finalDocs = [...documentsWithCustomerRelation, ...uniqueTempDocs]

          // 🔧 변경 감지: ID + 상태 비교로 불필요한 리렌더링 방지
          // ID가 같아도 상태(overallStatus, progress, conversionStatus 등)가 변경되면 업데이트 필요
          const createDocFingerprint = (doc: Document) => {
            const id = doc._id || doc.id || ''
            const status = doc.overallStatus || ''
            const progress = doc.progress ?? 0
            const customerRelation = doc.customer_relation?.customer_id || ''
            // 🔥 PDF 변환 상태도 fingerprint에 포함 (변환 완료 시 UI 즉시 반영)
            const convStatus = doc.conversionStatus || (typeof doc.upload === 'object' ? doc.upload?.conversion_status : null) || ''
            return `${id}:${status}:${progress}:${customerRelation}:${convStatus}`
          }

          // 🔧 정렬 순서도 반영하기 위해 sort() 제거
          const prevFingerprints = prevDocs.map(createDocFingerprint).join('|')
          const newFingerprints = finalDocs.map(createDocFingerprint).join('|')

          // ID + 상태가 모두 동일하면 기존 배열 유지 (참조 동일 → 리렌더링 없음)
          if (prevFingerprints === newFingerprints) {
            return prevDocs
          }

          return finalDocs
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
    [currentPage, itemsPerPage, sortField, sortDirection, searchTerm, fileScope]
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
   * 문서 즉시 제거 (Optimistic Update)
   */
  const removeDocuments = useCallback((docIds: Set<string>) => {
    setDocuments(prev => prev.filter(doc => {
      const id = doc._id ?? doc.id ?? ''
      return !docIds.has(id)
    }))
  }, [])

  // 🔧 useRef로 최신 함수 참조 유지 (폴링 interval 및 이벤트 리스너 안정화)
  const fetchDocumentsRef = useRef(fetchDocuments)
  const checkApiHealthRef = useRef(checkApiHealth)

  // 최신 함수로 ref 업데이트 (렌더링마다)
  useEffect(() => {
    fetchDocumentsRef.current = fetchDocuments
  }, [fetchDocuments])

  useEffect(() => {
    checkApiHealthRef.current = checkApiHealth
  }, [checkApiHealth])

  /**
   * searchQuery prop 변경 시 searchTerm 동기화
   */
  useEffect(() => {
    setSearchTerm(searchQuery)
  }, [searchQuery])

  // 🔄 SSE 훅 사용: Page Visibility API 및 실시간 업데이트 처리는 훅 내부에서 관리
  useDocumentStatusListSSE(
    () => {
      fetchDocumentsRef.current(false)
      checkApiHealthRef.current()
    },
    { enabled: isPollingEnabled }
  )

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 초기 로드는 마운트 시 한 번만 실행 (fetchDocuments를 dependency에 포함하면 무한 루프)
  }, [])

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

  // 🔄 하이브리드 방식: 폴링(진행률) + SSE(완료 알림)
  // - 5초 폴링: 처리 중인 문서의 진행률 업데이트 (0% → 30% → 60% → 100%)
  // - SSE: 완료 시 즉시 반영 (폴링 대기 없이)
  useEffect(() => {
    if (!isPollingEnabled) return

    const intervalId = setInterval(() => {
      fetchDocumentsRef.current(false)
      checkApiHealthRef.current()
    }, 5000) // 5초마다 폴링

    return () => clearInterval(intervalId)
  }, [isPollingEnabled])

  /**
   * 🔍 검색 및 필터링
   * 백엔드에서 이미 검색되고 필터링된 결과를 받으므로 프론트엔드 필터링 불필요
   * documents를 그대로 filteredDocuments로 사용
   */
  useEffect(() => {
    setFilteredDocuments(documents)
  }, [documents])

  // 🍎 Pagination Logic
  // 백엔드에서 이미 페이지네이션된 데이터를 받으므로 filteredDocuments를 그대로 사용
  const paginatedDocuments = useMemo(() => {
    return filteredDocuments
  }, [filteredDocuments])

  // 🍎 Pagination Handlers
  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }, [totalPages])

  const handleLimitChange = useCallback((limit: number) => {
    setItemsPerPage(limit)
    setCurrentPage(1) // Reset to first page
    // localStorage에 설정 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('aims-items-per-page', limit.toString())
    }
  }, [])

  // 🍎 Sort Handler
  const handleColumnSort = useCallback((field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType') => {
    console.log(`🔍 [정렬 클릭] field=${field}, 현재 sortField=${sortField}, sortDirection=${sortDirection}`)
    if (sortField === field) {
      // Same field: toggle direction
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
      console.log(`🔄 [정렬 방향 변경] ${sortDirection} → ${newDirection}`)
      setSortDirection(newDirection)
      // 🍎 방향만 변경되므로 fetchDocuments가 자동으로 재호출됨 (의존성 배열)
    } else {
      // New field: set field and default to asc
      console.log(`🆕 [정렬 필드 변경] ${sortField} → ${field} (direction: asc)`)
      setSortField(field)
      setSortDirection('asc')
      // 🍎 필드가 변경되므로 fetchDocuments가 자동으로 재호출됨 (의존성 배열)
    }
    setCurrentPage(1) // 정렬 변경 시 첫 페이지로 이동
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

  // 🍎 검색어 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // 🍎 페이지, 페이지네이션, 정렬, 검색어 변경 시 문서 다시 가져오기
  useEffect(() => {
    if (typeof window === 'undefined') return
    fetchDocuments(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // fetchDocuments를 dependency에 포함하면 무한 루프 발생 (fetchDocuments 자체가 자주 재생성됨)
  }, [currentPage, itemsPerPage, sortField, sortDirection, searchTerm])

  // State 객체
  const state: DocumentStatusState = useMemo(
    () => ({
      documents,
      filteredDocuments,
      selectedDocument,
      isLoading,
      error,
      searchTerm,
      lastUpdated,
      isPollingEnabled,
      apiHealth,
      currentPage,
      itemsPerPage,
      totalPages,
      totalCount,
      paginatedDocuments,
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
      lastUpdated,
      isPollingEnabled,
      apiHealth,
      currentPage,
      itemsPerPage,
      totalPages,
      totalCount,
      paginatedDocuments,
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
      updateDocumentCustomerRelation,
      setSortField,
      setSortDirection,
      handleColumnSort,
      removeDocuments
    }),
    [
      fetchDocuments,
      refreshDocuments,
      togglePolling,
      checkApiHealth,
      handlePageChange,
      handleLimitChange,
      updateDocumentCustomerRelation,
      handleColumnSort,
      removeDocuments
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
