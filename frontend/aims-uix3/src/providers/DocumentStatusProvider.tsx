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
import { errorReporter } from '@/shared/lib/errorReporter'
import { useDocumentStatusListSSE } from '@/shared/hooks/useDocumentStatusListSSE'
import type { Document, DocumentCustomerRelation } from '../types/documentStatus'

// 🍎 모듈 레벨 캐시: 컴포넌트 언마운트 후에도 데이터 유지
// 네비게이션 시 빈 화면 대신 이전 데이터 표시
let documentCache: Document[] = []
let paginationCache = { totalPages: 1, totalCount: 0 }

interface DocumentStatusProviderProps {
  children: React.ReactNode
  initialFiles?: Document[]
  searchQuery?: string
  fileScope?: 'all' | 'excludeMyFiles' | 'onlyMyFiles'
  /** 초기 페이지당 항목 수 (문서 탐색기는 전체 문서 필요하므로 큰 값 사용) */
  initialItemsPerPage?: number
}

/**
 * DocumentStatusProvider 컴포넌트
 */
export const DocumentStatusProvider: React.FC<DocumentStatusProviderProps> = ({
  children,
  initialFiles = [],
  searchQuery = '',
  fileScope = 'all',
  initialItemsPerPage
}) => {
  // State - 캐시된 데이터로 초기화 (네비게이션 시 빈 화면 방지)
  const [documents, setDocuments] = useState<Document[]>(documentCache)
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>(documentCache)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  // 캐시가 있으면 로딩 상태 false로 시작 (이전 데이터 즉시 표시)
  const [isLoading, setLoading] = useState<boolean>(documentCache.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // 🔄 SSE 실시간 업데이트 활성화 여부 (기존 isPollingEnabled와 호환 유지)
  const [isPollingEnabled, setPollingEnabled] = useState<boolean>(true)
  const [apiHealth, setApiHealth] = useState<boolean | null>(null)

  // 🍎 Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [itemsPerPage, setItemsPerPage] = useState<number>(() => {
    // 🍎 initialItemsPerPage prop이 있으면 우선 사용 (문서 탐색기 등 전체 문서 필요 시)
    if (initialItemsPerPage !== undefined && initialItemsPerPage > 0) {
      return initialItemsPerPage
    }
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
  // 캐시된 페이지네이션 정보로 초기화
  const [totalPages, setTotalPages] = useState<number>(paginationCache.totalPages)
  const [totalCount, setTotalCount] = useState<number>(paginationCache.totalCount)

  // 🍎 Sort State
  const [sortField, setSortField] = useState<'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType' | null>('uploadDate')
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
        } else if (sortField === 'docType') {
          // docType은 백엔드에서 정렬 (전체 DB 대상)
          sortParam = sortDirection === 'asc' ? 'docType_asc' : 'docType_desc'
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

        // 🍎 백엔드 pagination 정보 저장 + 캐시 업데이트
        if (data.data?.pagination) {
          setTotalPages(data.data.pagination.totalPages || 1)
          setTotalCount(data.data.pagination.totalCount || 0)
          paginationCache = {
            totalPages: data.data.pagination.totalPages || 1,
            totalCount: data.data.pagination.totalCount || 0
          }
        } else if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1)
          setTotalCount(data.pagination.totalCount || 0)
          paginationCache = {
            totalPages: data.pagination.totalPages || 1,
            totalCount: data.pagination.totalCount || 0
          }
        }

        // ✅ FIX: /api/documents/status API가 이미 customer_relation을 반환하므로
        // 개별 문서 조회 없이 바로 사용 (N+1 쿼리 방지 + customer_name 보존)
        // 🚀 PERF FIX: customer_type은 먼저 문서 표시 후 백그라운드에서 로드
        const documentsWithCustomerRelation: Document[] = realDocuments.map((doc: Document): Document => {
          return {
            ...doc,
            // API가 이미 customer_relation (customer_name 포함)을 반환함
            customer_relation: doc.customer_relation
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
            // 🏷️ 문서 유형도 fingerprint에 포함 (유형 변경 시 UI 즉시 반영)
            const docType = doc.document_type || doc.docType || ''
            // 🔴 바이러스 스캔 상태도 fingerprint에 포함 (바이러스 감지 시 UI 즉시 반영)
            const virusScanStatus = doc.virusScan?.status || ''
            return `${id}:${status}:${progress}:${customerRelation}:${convStatus}:${docType}:${virusScanStatus}`
          }

          // 🔧 정렬 순서도 반영하기 위해 sort() 제거
          const prevFingerprints = prevDocs.map(createDocFingerprint).join('|')
          const newFingerprints = finalDocs.map(createDocFingerprint).join('|')

          // ID + 상태가 모두 동일하면 기존 배열 유지 (참조 동일 → 리렌더링 없음)
          if (prevFingerprints === newFingerprints) {
            return prevDocs
          }

          // 🍎 모듈 레벨 캐시 업데이트 (네비게이션 시 데이터 유지)
          documentCache = finalDocs

          return finalDocs
        })

        setLastUpdated(new Date())
      } catch (err) {
        if (typeof window !== 'undefined') {
          setError('문서 목록을 불러올 수 없습니다.')
        }
        console.error('Fetch documents error:', err)
        errorReporter.reportApiError(err as Error, { component: 'DocumentStatusProvider.fetchDocuments' })
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
   * 🚀 customer_type 백그라운드 로드
   * - 문서 표시 후 비동기로 customer_type 가져옴 (N+1 쿼리이지만 UI 블로킹 없음)
   * - customer_type이 없는 고객만 조회
   */
  const fetchCustomerTypesInBackground = useCallback(async (docs: Document[]) => {
    // customer_type이 없는 고객 ID 수집
    const customerIdsToFetch = new Set<string>()
    docs.forEach((doc) => {
      if (doc.customer_relation?.customer_id && !doc.customer_relation?.customer_type) {
        customerIdsToFetch.add(String(doc.customer_relation.customer_id))
      }
    })

    if (customerIdsToFetch.size === 0) return

    // customer_type 일괄 조회 (백그라운드)
    const customerTypeMap: Record<string, string | null> = {}
    await Promise.all(
      Array.from(customerIdsToFetch).map(async (customerId) => {
        try {
          const customerResponse = await fetch(`/api/customers/${customerId}`, {
            headers: getAuthHeaders()
          })
          if (customerResponse.ok) {
            const customerData = await customerResponse.json()
            if (customerData.success && customerData.data) {
              customerTypeMap[customerId] = customerData.data.insurance_info?.customer_type || null
            }
          }
        } catch {
          // 백그라운드 로드이므로 에러 무시
        }
      })
    )

    // customer_type 업데이트 (이미 표시된 문서에 추가)
    if (Object.keys(customerTypeMap).length > 0) {
      setDocuments((prevDocs) =>
        prevDocs.map((doc) => {
          const customerId = doc.customer_relation?.customer_id
            ? String(doc.customer_relation.customer_id)
            : null
          if (customerId && customerTypeMap[customerId] !== undefined && doc.customer_relation) {
            return {
              ...doc,
              customer_relation: {
                ...doc.customer_relation,
                customer_type: customerTypeMap[customerId]
              }
            }
          }
          return doc
        })
      )
    }
  }, [])

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

  // 🔧 초기 마운트 여부 추적 (정렬/페이지/검색 변경 시 재조회용)
  const isInitialMountRef = useRef(true)

  /**
   * 🍎 정렬, 페이지네이션, 검색어 변경 시 즉시 재조회
   * - 초기 로드는 별도 useEffect에서 처리하므로 스킵
   * - 폴링 5초 대기 없이 즉시 반영
   */
  useEffect(() => {
    // 초기 마운트 시에는 스킵 (초기 로드 useEffect에서 처리)
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      return
    }

    // 테스트 환경에서는 스킵
    if (typeof window === 'undefined') return

    // 정렬/페이지/검색어 변경 시 즉시 재조회
    fetchDocumentsRef.current(false)
  }, [sortField, sortDirection, currentPage, itemsPerPage, searchTerm])

  // 🔄 SSE 훅 사용 (폴링 대체)
  // - document-list-change: 문서 업로드/삭제/연결 변경 시 즉시 반영
  // - document-progress: 진행률 업데이트 시 즉시 반영 (폴링 제거)
  // - Page Visibility API로 탭 비활성화 시 자동 연결 해제/재연결
  useDocumentStatusListSSE(
    () => {
      fetchDocumentsRef.current(false)
      checkApiHealthRef.current()
    },
    {
      enabled: isPollingEnabled,
      // 🔧 FIX: SSE 이벤트에서 받은 progress 값을 직접 상태에 반영
      // API 재호출 없이 즉시 UI 업데이트 (MongoDB 동기화 지연 문제 해결)
      onDocumentChange: (event) => {
        if (event.type === 'progress-update' && event.documentId && event.progress !== undefined) {
          setDocuments((prevDocs) =>
            prevDocs.map((doc) => {
              const docId = doc._id || doc.id
              if (docId === event.documentId) {
                return {
                  ...doc,
                  progress: event.progress,
                  overallStatus: event.progress === 100 ? 'completed' : doc.overallStatus
                }
              }
              return doc
            })
          )
        }
      }
    }
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

  // 🔄 SSE 단독 사용 (폴링 제거 - 2026-01-06)
  // - document-list-change: 문서 업로드/삭제/상태변경 시 즉시 반영
  // - document-progress: 진행률 업데이트 시 즉시 반영 (20% → 40% → 60% → 80% → 100%)
  // - 폴링 대비 서버 부하 60-70% 감소, 실시간성 향상
  // 참고: useDocumentStatusListSSE 훅에서 SSE 이벤트 처리

  /**
   * 🔍 검색 및 필터링
   * 백엔드에서 이미 검색되고 필터링된 결과를 받으므로 프론트엔드 필터링 불필요
   * documents를 그대로 filteredDocuments로 사용
   */
  useEffect(() => {
    setFilteredDocuments(documents)
  }, [documents])

  /**
   * 🚀 customer_type 백그라운드 로드 트리거
   * - documents가 변경되면 customer_type이 없는 고객에 대해 백그라운드 로드
   * - 비동기 처리로 UI 블로킹 없음
   */
  useEffect(() => {
    if (documents.length === 0 || typeof window === 'undefined') {
      return
    }
    // setTimeout으로 렌더링 완료 후 실행
    const timeoutId = setTimeout(() => {
      fetchCustomerTypesInBackground(documents)
    }, 100)
    return () => clearTimeout(timeoutId)
  }, [documents, fetchCustomerTypesInBackground])

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
  const handleColumnSort = useCallback((field: 'filename' | 'status' | 'uploadDate' | 'fileSize' | 'mimeType' | 'customer' | 'badgeType' | 'docType') => {
    console.log(`🔍 [정렬 클릭] field=${field}, 현재 sortField=${sortField}, sortDirection=${sortDirection}`)
    if (sortField === field) {
      // Same field: toggle direction
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc'
      console.log(`🔄 [정렬 방향 변경] ${sortDirection} → ${newDirection}`)
      setSortDirection(newDirection)
    } else {
      // New field: set field and default to asc
      console.log(`🆕 [정렬 필드 변경] ${sortField} → ${field} (direction: asc)`)
      setSortField(field)
      setSortDirection('asc')
    }
    // 🍎 상태 변경 → useEffect에서 fetchDocuments 자동 호출
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

  // 🔧 중복 useEffect 제거 (2026-01-12)
  // - 기존: line 348-360과 동일한 의존성으로 fetchDocuments(false) 호출
  // - 문제: isInitialMountRef 체크 없이 초기 마운트 시에도 실행되어 중복 API 호출
  // - 해결: line 348-360이 동일한 역할을 하고 isInitialMountRef로 초기 스킵 처리하므로 제거

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
