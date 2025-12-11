/**
 * DocumentRegistrationView Component
 * @since 1.0.0
 *
 * 문서 등록 View 컴포넌트
 * 애플 스타일의 파일 업로드 시스템 구현
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import FileUploadArea from './FileUploadArea/FileUploadArea'
import CustomerFileUploadArea from './CustomerFileUploadArea/CustomerFileUploadArea'
import ProcessingLog from './ProcessingLog/ProcessingLog'
import { Modal, Tooltip } from '@/shared/ui'
import { showAppleConfirm, showOversizedFilesModal } from '../../../utils/appleConfirm'
import { UploadFile, UploadState, UploadStatus, UploadProgressEvent } from './types/uploadTypes'
import { ProcessingLog as Log, LogLevel } from './types/logTypes'
import { uploadService, fileValidator } from './services/uploadService'
import { uploadConfig, UserContextService } from './services/userContextService'
import { api } from '@/shared/lib/api'
import { checkAnnualReportFromPDF } from '@/features/customer/utils/pdfParser'
import type { Customer } from '@/entities/customer/model'
import type { Document } from '../../../types/documentStatus'
import { DocumentService } from '@/services/DocumentService'
import { processAnnualReportFile, registerArDocument } from './utils/annualReportProcessor'
import './DocumentRegistrationView.css'

interface DocumentRegistrationViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

/**
 * DocumentRegistrationView React 컴포넌트
 *
 * 애플 스타일의 문서 업로드 시스템
 * - 드래그앤드롭 파일 선택
 * - 실시간 업로드 진행률
 * - 에러 처리 및 재시도
 * - 사용자별 업로드 지원 (미래 확장)
 *
 * @example
 * ```tsx
 * <DocumentRegistrationView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentRegistrationView: React.FC<DocumentRegistrationViewProps> = ({
  visible,
  onClose
}) => {
  // 고객 파일 등록 상태
  const [customerFileCustomer, setCustomerFileCustomer] = useState<Customer | null>(null)
  const [customerFileDocType, setCustomerFileDocType] = useState<string>('unspecified')
  const [customerFileNotes, setCustomerFileNotes] = useState<string>('')

  // 🍎 처리 로그 표시 상태 (업로드 시작 전에는 숨김)
  const [isLogVisible, setIsLogVisible] = useState<boolean>(false)

  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

  // UI 상태 (localStorage에서 복원)
  const [isGuideExpanded, setIsGuideExpanded] = useState(() => {
    const saved = localStorage.getItem('doc-reg-guide-expanded')
    return saved === null ? false : saved === 'true' // 기본값: 접힌 상태
  })
  const [isNotesExpanded, setIsNotesExpanded] = useState(() => {
    const saved = localStorage.getItem('doc-reg-notes-expanded')
    return saved === null ? false : saved === 'true' // 기본값: 접힌 상태
  })

  // 가이드 접기/펼치기 토글
  const toggleGuide = useCallback(() => {
    setIsGuideExpanded(prev => {
      const newValue = !prev
      localStorage.setItem('doc-reg-guide-expanded', String(newValue))
      return newValue
    })
  }, [])

  // 메모 접기/펼치기 토글
  const toggleNotes = useCallback(() => {
    setIsNotesExpanded(prev => {
      const newValue = !prev
      localStorage.setItem('doc-reg-notes-expanded', String(newValue))
      return newValue
    })
  }, [])

  // SessionStorage 키
  const SESSION_KEY = 'document-upload-state'

  // 초기 상태 복원 또는 기본값
  const getInitialState = (): UploadState => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as StoredUploadState
        const restoredFiles: UploadFile[] = parsed.files?.map((savedFile) => {
          // 더미 File 객체 생성 (실제 파일은 복원 불가)
          const dummyFile = new File(
            [''], // 빈 내용
            savedFile.fileInfo?.name ?? 'unknown',
            {
              type: savedFile.fileInfo?.type ?? 'application/octet-stream',
              lastModified: savedFile.fileInfo?.lastModified ?? Date.now()
            }
          )

          return {
            id: savedFile.id,
            file: dummyFile,
            fileSize: savedFile.fileSize ?? savedFile.fileInfo?.size ?? 0,
            status: savedFile.status,
            progress: savedFile.progress,
            error: savedFile.error,
            completedAt: savedFile.completedAt ? new Date(savedFile.completedAt) : undefined,
            relativePath: savedFile.relativePath
          }
        }) ?? []

        // 업로드 중인 파일이 있으면 uploading 상태 복원
        const hasUploadingFiles = restoredFiles.some((f) => f.status === 'uploading')

        return {
          ...parsed,
          files: restoredFiles,
          uploading: hasUploadingFiles // 업로드 중인 파일이 있으면 true 유지
        }
      }
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to restore state:', error)
    }

    return {
      files: [],
      uploading: false,
      totalProgress: 0,
      completedCount: 0,
      errors: [],
      context: {
        identifierType: 'userId',
        identifierValue: typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester'
      }
    }
  }

  // 업로드 상태 관리
  const [uploadState, setUploadState] = useState<UploadState>(getInitialState)


  // 🏷️ AR 파일명 추적 (업로드 완료 후 DB 플래그 설정용)
  const arFilenamesRef = useRef<Set<string>>(new Set())

  // 🔗 AR 파일명 → 고객 ID 매핑 (자동 연결용)
  const arCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 📝 AR 파일명 → metadata 매핑 (발행일 등 DB 저장용)
  const arMetadataMappingRef = useRef<Map<string, { issue_date?: string; report_title?: string }>>(new Map())

  // 🔗 AR 문서 ID → 고객 ID 매핑 (더 확실한 연결용)
  const arDocumentCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 👤 고객 ID → 고객명 매핑 (로그 표시용)
  const customerNameMappingRef = useRef<Map<string, string>>(new Map())

  // 📊 AR 처리 성공 카운터 (중복 건너뛴 건 제외)
  const arProcessedCountRef = useRef<number>(0)

  // 📄 일반 문서 파일명 → 문서 ID 매핑 (백그라운드 처리 완료 확인용)
  const normalDocumentMappingRef = useRef<Map<string, string>>(new Map())

  // 🔗 고객 파일 등록 탭에서 업로드된 파일 추적 (파일명 → 고객 정보 매핑)
  const customerFileUploadMappingRef = useRef<Map<string, {
    customerId: string
    customerName: string
    documentType: string
    notes: string
  }>>(new Map())

  // 📝 처리 로그 상태 (sessionStorage에서 복원)
  const getInitialLogs = (): Log[] => {
    try {
      const LOGS_KEY = 'document-upload-logs'
      const saved = sessionStorage.getItem(LOGS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Log[]
        // timestamp를 Date 객체로 변환
        return parsed.map(log => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }))
      }
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to restore logs:', error)
    }
    return []
  }

  const [processingLogs, setProcessingLogs] = useState<Log[]>(getInitialLogs)
  const logCounterRef = useRef(0) // 로그 카운터 (고유 ID 보장)

  /**
   * 로그 추가 헬퍼 함수
   * 고객명이 지정되면 메시지 앞에 [고객명]을 자동으로 추가
   *
   * @param level - 로그 레벨
   * @param message - 로그 메시지
   * @param details - 상세 정보 (선택)
   * @param customerName - 고객명 (선택)
   */
  const addLog = useCallback((level: LogLevel, message: string, details?: string, customerName?: string) => {
    logCounterRef.current += 1
    const counter = logCounterRef.current

    // 고객명이 있으면 메시지 앞에 [고객명] 추가
    const finalMessage = customerName ? `[${customerName}] ${message}` : message

    const newLog: Log = {
      id: `log_${Date.now()}_${counter}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message: finalMessage,
      details
    }

    setProcessingLogs(prev => [newLog, ...prev])
  }, [])

  /**
   * 상태를 sessionStorage에 저장
   */
  useEffect(() => {
    try {
      // File 객체는 직렬화할 수 없으므로 파일 정보만 저장
      const stateToSave = {
        ...uploadState,
        files: uploadState.files.map(file => ({
          id: file.id,
          status: file.status,
          progress: file.progress,
          error: file.error,
          completedAt: file.completedAt,
          relativePath: file.relativePath,
          // File 객체 정보만 저장 (실제 File 객체는 저장 불가)
          fileInfo: {
            name: file.file.name,
            size: file.fileSize,
            type: file.file.type,
            lastModified: file.file.lastModified
          }
        }))
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave))
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to save state:', error)
    }
  }, [uploadState, SESSION_KEY])

  /**
   * 처리 로그를 sessionStorage에 저장
   */
  useEffect(() => {
    try {
      const LOGS_KEY = 'document-upload-logs'
      sessionStorage.setItem(LOGS_KEY, JSON.stringify(processingLogs))
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to save logs:', error)
    }
  }, [processingLogs])

  /**
   * 고유 ID 생성
   */
  const generateFileId = useCallback((): string => {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  /**
   * 파일 선택 핸들러
   */
  const handleFilesSelected = useCallback(async (files: File[]) => {
    console.log('🚨🚨🚨 handleFilesSelected 실행! files:', files.length);
    const newUploadFiles: UploadFile[] = []

    // 🔍 PDF 파일 중 Annual Report 체크 (파일 선택 직후, 업로드 전!)
    for (const file of files) {
      // 파일 검증
      const validation = fileValidator.validateFile(file)

      if (validation.valid) {
        // PDF 파일이면 Annual Report 체크
        if (file.type === 'application/pdf') {
          try {
            addLog('info', `[1/4] PDF 분석 중: ${file.name}`)
            console.log('[DocumentRegistrationView] 🔍 PDF 파일 감지, Annual Report 체크:', file.name);
            const checkResult = await checkAnnualReportFromPDF(file);

            if (checkResult.is_annual_report) {
              console.log('[DocumentRegistrationView] ✅ Annual Report 감지!', checkResult.metadata);

              // 🎯 사전 선택된 고객 확인 (고객 검색 불필요)
              if (!customerFileCustomer) {
                addLog('warning', `AR 문서 감지됨: ${file.name}`, '고객을 먼저 선택해주세요');
                continue;
              }

              const customerId = customerFileCustomer._id;
              const customerName = customerFileCustomer.personal_info?.name || '알 수 없음';

              // 중복 문서 체크
              const processResult = await processAnnualReportFile(file, customerId);
              if (processResult.isDuplicateDoc) {
                addLog(
                  'warning',
                  `중복 문서 감지: ${file.name}`,
                  `이미 존재하는 파일이므로 업로드를 건너뜁니다.`
                );
                continue;
              }

              // 🍎 AR 처리 시작 시 처리 로그 표시
              setIsLogVisible(true)
              addLog('success', `[1/4] PDF 분석 완료: ${file.name}`)
              addLog(
                'ar-detect',
                `[2/5] Annual Report 감지`,
                `사전 선택된 고객: ${customerName} → AR 전용 처리로 전환`
              )

              addLog(
                'ar-auto',
                `AR 자동 등록: ${file.name}`,
                `사전 선택된 고객: ${customerName}`
              );

              // ✅ 사전 선택된 고객으로 AR 등록
              const result = await registerArDocument(file, customerId, checkResult.metadata?.issue_date, {
                addLog,
                generateFileId,
                addToUploadQueue: (uploadFile) => {
                  newUploadFiles.push(uploadFile);
                },
                trackArFile: (fileName, custId) => {
                  arFilenamesRef.current.add(fileName);
                  arCustomerMappingRef.current.set(fileName, custId);
                  if (checkResult.metadata) {
                    arMetadataMappingRef.current.set(fileName, checkResult.metadata);
                  }
                  // 고객명 매핑 저장 (자동 연결 로그에서 사용)
                  customerNameMappingRef.current.set(custId, customerName);
                }
              });

              if (result.success) {
                console.log('[DocumentRegistrationView] AR 문서 등록 성공:', file.name);
                arProcessedCountRef.current += 1;
              }

              continue;
            } else {
              addLog('info', `[1/4] PDF 분석 완료: ${file.name}`, 'Annual Report 아님 - 일반 문서로 처리')
            }
          } catch (error) {
            console.error('[DocumentRegistrationView] Annual Report 체크 실패:', error);
            addLog('warning', `PDF 분석 실패: ${file.name}`, error instanceof Error ? error.message : String(error))
            // 체크 실패 시 일반 문서로 처리
          }
        } else {
          // 이미지 등 PDF가 아닌 일반 파일
          addLog('info', `[1/4] 일반 파일 감지: ${file.name}`, file.type || '알 수 없는 형식')
        }

        // 일반 문서 또는 Annual Report가 아닌 PDF
        newUploadFiles.push({
          id: generateFileId(),
          file,
          fileSize: file.size,
          status: 'pending',
          progress: 0,
          error: undefined,
          completedAt: undefined,
          relativePath: (file as FileWithRelativePath).webkitRelativePath || undefined,
          customerId: customerFileCustomer?._id  // 🔗 고객 선택 시 자동 연결
        })
      } else {
        // 검증 실패한 파일은 에러로 표시
        const errorFile: UploadFile = {
          id: generateFileId(),
          file,
          fileSize: file.size,
          status: 'error',
          progress: 0,
          error: validation.errors.join(', ')
        }
        newUploadFiles.push(errorFile)
      }
    }

    // 크기 초과 파일 개수 확인 및 팝업 표시
    const oversizedFiles = newUploadFiles.filter(f =>
      f.status === 'error' && f.error?.includes('MB 초과')
    )

    if (oversizedFiles.length > 0) {
      const oversizedCount = oversizedFiles.length
      const sizeLimitMB = Math.round(uploadConfig.limits.maxFileSize / (1024 * 1024))

      // 🍎 애플 스타일 확인 모달 - 새로운 메시지 형식과 클릭 가능한 링크
      const confirmed = await showAppleConfirm(
        `총 ${newUploadFiles.length}개의 파일들중에 ${oversizedCount}개의 파일이 ${sizeLimitMB}MB의 사이즈 제한을 초과합니다. 사이즈 제한 초과 파일들은 업로드에서 제외됩니다.`,
        undefined, // 타이틀 없음 - "확인" 문구 제거
        {
          linkText: '사이즈 제한 초과 파일들',
          onLinkClick: async () => {
            // 파일 정보를 올바른 형식으로 변환
            const fileList = oversizedFiles.map(uploadFile => ({
              name: uploadFile.file.name,
              size: uploadFile.fileSize
            }))

            // mod2.png 모달 표시
            await showOversizedFilesModal(fileList, uploadConfig.limits.maxFileSize)

            // mod2.png에서 "확인" 후 mod1.png 모달로 다시 돌아오기
            // 링크 클릭 후에는 아무것도 하지 않음 (모달이 열린 상태 유지)
          },
          showConfirmButton: true // "취소" "확인" 두 버튼 유지
        }
      )

      if (!confirmed) {
        return // 사용자가 취소하면 아무것도 하지 않음
      }
    }

    // 상태 업데이트 - 이전 업로드 기록 초기화 후 새 파일만
    setUploadState(prev => ({
      ...prev,
      files: newUploadFiles
    }))

    // 유효한 파일들만 업로드 큐에 추가
    const validFiles = newUploadFiles.filter(f => f.status === 'pending')
    if (validFiles.length > 0) {
      // 🍎 업로드 시작 시 처리 로그 표시
      setIsLogVisible(true)
      uploadService.queueFiles(validFiles)
      addLog('info', `[2/4] 일반 문서 ${validFiles.length}개 업로드 시작`)

      // 🔗 고객이 선택되어 있으면 추적 목록에 추가 (업로드 후 자동 연결)
      // 문서유형은 기본값 'unspecified'가 있으므로 체크 불필요
      if (customerFileCustomer) {
        validFiles.forEach(f => {
          customerFileUploadMappingRef.current.set(f.file.name, {
            customerId: customerFileCustomer._id,
            customerName: customerFileCustomer.personal_info?.name || '이름 없음',
            documentType: customerFileDocType,
            notes: customerFileNotes
          })
          console.log(`🔗 [고객 파일 자동 연결] 추적 추가: ${f.file.name} → 고객: ${customerFileCustomer.personal_info?.name}, 문서유형: ${customerFileDocType}`)
        })
      }
    }

  }, [generateFileId, addLog, customerFileCustomer, customerFileDocType, customerFileNotes])

  /**
   * 파일 재시도 핸들러
   */
  const handleRetryFile = useCallback((fileId: string) => {
    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === fileId
          ? { ...f, status: 'pending' as UploadStatus, progress: 0, error: undefined, completedAt: undefined }
          : f
      )
    }))

    const file = uploadState.files.find(f => f.id === fileId)
    if (file) {
      uploadService.queueFiles([{ ...file, status: 'pending', progress: 0, error: undefined, completedAt: undefined }])
    }
  }, [uploadState.files])

  /**
   * 전체 업로드 취소
   */
  const handleCancelAll = useCallback(() => {
    uploadService.cancelAllUploads()
    setUploadState(prev => ({
      ...prev,
      uploading: false,
      files: prev.files.map(f =>
        f.status === 'uploading' || f.status === 'pending'
          ? { ...f, status: 'cancelled' as UploadStatus }
          : f
      )
    }))
  }, [])

  /**
   * 업로드 진행률 콜백
   */
  const handleProgress = useCallback((event: UploadProgressEvent) => {
    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === event.fileId
          ? { ...f, progress: event.progress }
          : f
      )
    }))
  }, [])

  /**
   * 업로드 완료 후 AR DB 플래그 설정 + 문서 처리 완료 대기 후 자동 연결
   */
  const setAnnualReportFlag = useCallback(async (fileName: string) => {
    // 🔒 중복 실행 방지: 이미 처리 중이면 건너뛰기
    if (!arFilenamesRef.current.has(fileName)) {
      console.log(`⚠️ [AR] 이미 처리 중이거나 완료된 파일: ${fileName}`);
      return;
    }

    // 🔒 즉시 추적 목록에서 제거 (중복 실행 방지)
    arFilenamesRef.current.delete(fileName);
    console.log(`🔒 [AR] 추적 목록에서 제거: ${fileName}, 남은 파일: ${arFilenamesRef.current.size}`);

    try {
      // 매핑된 metadata 가져오기
      const metadata = arMetadataMappingRef.current.get(fileName);

      // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
      const responseData = await api.patch<{ success: boolean; document_id?: string }>(
        '/api/documents/set-annual-report',
        { filename: fileName, metadata }
      );
      console.log(`✅ [AR] is_annual_report=true 설정 완료 (metadata 포함):`, responseData);

      // 🔗 문서 처리 완료 대기 후 자동 연결
      const customerId = arCustomerMappingRef.current.get(fileName);
      const documentId = responseData.document_id;

      console.log(`🔍 [AR] 매핑 조회: fileName="${fileName}", customerId="${customerId}", documentId="${documentId}"`);
      console.log(`🔍 [AR] 전체 매핑:`, Array.from(arCustomerMappingRef.current.entries()));

      if (customerId && documentId) {
        // 문서 ID 기반 매핑 저장 (더 확실함)
        arDocumentCustomerMappingRef.current.set(documentId, customerId);
        console.log(`🔗 [AR] 문서 ID → 고객 ID 매핑 저장: ${documentId} → ${customerId}`);
        console.log(`⏳ [AR] 문서 처리 완료 대기 시작: ${documentId}`);

        // 문서 처리 완료될 때까지 polling
        const checkInterval = 5000; // 5초마다 체크
        const maxAttempts = 36; // 최대 180초 (3분)
        let attempts = 0;

        const checkAndLink = setInterval(async () => {
          attempts++;

          try {
            // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
            const response = await api.get<{ success: boolean; data?: { computed?: { overallStatus?: string } } }>(
              `/api/documents/${documentId}/status`
            );

            // 문서 처리 완료 확인 (overallStatus === 'completed')
            if (response.success && response.data?.computed?.overallStatus === 'completed') {
              clearInterval(checkAndLink);

              // 👤 고객명 가져오기
              const customerName = customerNameMappingRef.current.get(customerId);

              console.log(`🔗 [AR 자동 연결] 문서 처리 완료 확인, 연결 시작`);
              addLog('info', `[5/5] 문서-고객 자동 연결 시작: ${fileName}`, undefined, customerName);

              await DocumentService.linkDocumentToCustomer(customerId, {
                document_id: documentId,
                relationship_type: 'annual_report'
              });

              console.log(`✅ [AR 자동 연결] 완료`);
              addLog('success', `[5/5] 문서-고객 자동 연결 완료 - AR 처리 최종 완료: ${fileName}`, undefined, customerName);

              // 🚀 고객 연결 완료 직후 백그라운드 파싱 트리거!
              try {
                console.log(`🚀 [AR 백그라운드 파싱] 트리거 시작: ${fileName}, customerId=${customerId}`);
                // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
                const bgParseData = await api.post<{ success: boolean; message?: string }>(
                  '/api/ar-background/trigger-parsing',
                  {
                    customer_id: customerId,
                    file_id: documentId
                  }
                );
                console.log(`✅ [AR 백그라운드 파싱] 트리거 완료:`, bgParseData);
              } catch (bgError) {
                console.error(`❌ [AR 백그라운드 파싱] 트리거 실패:`, bgError);
              }

              arCustomerMappingRef.current.delete(fileName);
              arMetadataMappingRef.current.delete(fileName);
              arDocumentCustomerMappingRef.current.delete(documentId);
            } else if (attempts >= maxAttempts) {
              clearInterval(checkAndLink);
              console.warn(`⚠️ [AR] 문서 처리 대기 시간 초과`);
              arCustomerMappingRef.current.delete(fileName);
              arMetadataMappingRef.current.delete(fileName);
              arDocumentCustomerMappingRef.current.delete(documentId);
            } else {
              console.log(`⏳ [AR] 대기 중... (${attempts}/${maxAttempts})`);
            }
          } catch (error) {
            console.error(`❌ [AR] 문서 상태 확인 실패:`, error);
          }
        }, checkInterval);
      } else {
        console.warn(`⚠️ [AR] 매핑을 찾을 수 없어서 자동 연결을 건너뜁니다. customerId=${customerId}, documentId=${documentId}`);
      }
    } catch (error) {
      console.error(`❌ [AR] 처리 실패:`, error);
    }
  }, []);

  /**
   * 고객 파일 등록 탭에서 업로드된 문서를 고객에게 자동 연결
   */
  const linkCustomerFile = useCallback(async (fileName: string) => {
    const customerFileInfo = customerFileUploadMappingRef.current.get(fileName);
    if (!customerFileInfo) {
      console.log(`⚠️ [고객 파일 자동 연결] 추적 정보 없음: ${fileName}`);
      return;
    }

    console.log(`🔗 [고객 파일 자동 연결] 시작: ${fileName} → 고객: ${customerFileInfo.customerName}`);

    try {
      // 1. 파일명으로 문서 조회
      const searchData = await api.get<{ success: boolean; data: { documents: Document[] } }>(`/api/documents?limit=100`);

      if (!searchData.success || !searchData.data || !searchData.data.documents) {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서 목록 조회 실패`);
        return;
      }

      const document = searchData.data.documents.find((doc: Document) => doc.filename === fileName);
      if (!document) {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서를 찾을 수 없음: ${fileName}`);
        return;
      }

      const documentId = document._id;
      if (!documentId) {
        console.warn(`⚠️ [고객 파일 자동 연결] 문서 ID가 없음: ${fileName}`);
        return;
      }

      console.log(`🔍 [고객 파일 자동 연결] 문서 ID 확인: ${fileName} → ${documentId}`);

      // 2. 문서 처리 완료 대기 (overallStatus === 'completed')
      const checkInterval = 5000; // 5초마다 체크
      const maxAttempts = 36; // 최대 180초 (3분)
      let attempts = 0;

      const checkAndLink = setInterval(async () => {
        attempts++;

        try {
          // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
          const response = await api.get<{ success: boolean; data?: { computed?: { overallStatus?: string } } }>(
            `/api/documents/${documentId}/status`
          );

          if (response.success && response.data?.computed?.overallStatus === 'completed') {
            clearInterval(checkAndLink);

            console.log(`🔗 [고객 파일 자동 연결] 문서 처리 완료, 연결 시작`);
            addLog('info', `[4/4] 문서-고객 자동 연결 시작: ${fileName}`, undefined, customerFileInfo.customerName);

            // 3. 고객에게 문서 연결
            try {
              // notes가 있을 때만 포함 (exactOptionalPropertyTypes 준수)
              const linkPayload = {
                document_id: documentId,
                relationship_type: customerFileInfo.documentType,
                assigned_by: UserContextService.getContext().identifierValue,
                ...(customerFileInfo.notes ? { notes: customerFileInfo.notes } : {})
              };

              console.log(`📤 [고객 파일 자동 연결] API 호출 시작:`, {
                customerId: customerFileInfo.customerId,
                customerName: customerFileInfo.customerName,
                documentId,
                fileName,
                payload: linkPayload
              });

              await DocumentService.linkDocumentToCustomer(customerFileInfo.customerId, linkPayload);

              console.log(`✅ [고객 파일 자동 연결] API 호출 성공`);
              addLog('success', `[4/4] 문서-고객 자동 연결 완료: ${fileName}`, undefined, customerFileInfo.customerName);

              // 추적 목록에서 제거
              customerFileUploadMappingRef.current.delete(fileName);
            } catch (linkError) {
              console.error(`❌ [고객 파일 자동 연결] API 호출 실패:`, linkError);
              addLog('error', `문서 자동 연결 실패: ${fileName}`, linkError instanceof Error ? linkError.message : String(linkError), customerFileInfo.customerName);
              customerFileUploadMappingRef.current.delete(fileName);
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(checkAndLink);
            console.warn(`⚠️ [고객 파일 자동 연결] 문서 처리 대기 시간 초과: ${fileName}`);
            addLog('warning', `문서 자동 연결 시간 초과: ${fileName}`, '처리가 지연되고 있습니다. 나중에 수동으로 연결해주세요.', customerFileInfo.customerName);
            customerFileUploadMappingRef.current.delete(fileName);
          } else {
            console.log(`⏳ [고객 파일 자동 연결] 대기 중... (${attempts}/${maxAttempts}) - ${fileName}`);
          }
        } catch (error) {
          console.error(`❌ [고객 파일 자동 연결] 상태 확인 실패:`, error);
        }
      }, checkInterval);
    } catch (error) {
      console.error(`❌ [고객 파일 자동 연결] 처리 실패:`, error);
      addLog('error', `문서 자동 연결 실패: ${fileName}`, error instanceof Error ? error.message : String(error), customerFileInfo.customerName);
    }
  }, [addLog]);

  /**
   * 일반 문서 백그라운드 처리 완료 확인 (polling)
   */
  const checkNormalDocumentCompletion = useCallback(async (fileName: string) => {
    try {
      // 1. 파일명으로 문서 조회 (/api/documents에서 최근 문서 목록 조회)
      const searchData = await api.get<{ success: boolean; data: { documents: Document[] } }>(`/api/documents?limit=100`);

      if (!searchData.success || !searchData.data || !searchData.data.documents) {
        console.warn(`⚠️ [일반 문서] 문서 목록 조회 실패`);
        return;
      }

      // 파일명으로 문서 찾기 (filename 필드 사용)
      const document = searchData.data.documents.find((doc: Document) => doc.filename === fileName);
      if (!document) {
        console.warn(`⚠️ [일반 문서] 문서를 찾을 수 없음: ${fileName}`);
        return;
      }

      const documentId = document._id;
      if (!documentId) {
        console.warn(`⚠️ [일반 문서] 문서 ID가 없음: ${fileName}`);
        return;
      }
      console.log(`🔍 [일반 문서] 문서 ID 확인: ${fileName} → ${documentId}`);

      // 2. overallStatus가 completed가 될 때까지 polling
      const checkInterval = 5000; // 5초마다 체크
      const maxAttempts = 36; // 최대 180초 (3분)
      let attempts = 0;

      const checkStatus = setInterval(async () => {
        attempts++;

        try {
          // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
          const response = await api.get<{ success: boolean; data?: { computed?: { overallStatus?: string } } }>(
            `/api/documents/${documentId}/status`
          );

          // 문서 처리 완료 확인 (overallStatus === 'completed')
          if (response.success && response.data?.computed?.overallStatus === 'completed') {
            clearInterval(checkStatus);

            console.log(`✅ [일반 문서] 백그라운드 처리 완료: ${fileName}`);
            addLog('success', `[4/4] 백그라운드 처리 완료 - 일반 문서 처리 최종 완료: ${fileName}`);

            // 매핑에서 제거
            normalDocumentMappingRef.current.delete(fileName);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkStatus);
            console.warn(`⚠️ [일반 문서] 처리 대기 시간 초과: ${fileName}`);
            addLog('warning', `백그라운드 처리 시간 초과: ${fileName}`, '처리가 지연되고 있습니다. 나중에 확인해주세요.');
            normalDocumentMappingRef.current.delete(fileName);
          } else {
            console.log(`⏳ [일반 문서] 대기 중... (${attempts}/${maxAttempts}) - ${fileName}`);
          }
        } catch (error) {
          console.error(`❌ [일반 문서] 상태 확인 실패:`, error);
        }
      }, checkInterval);

      // 매핑에 추가
      normalDocumentMappingRef.current.set(fileName, documentId);
    } catch (error) {
      console.error(`❌ [일반 문서] 처리 실패:`, error);
    }
  }, [addLog]);

  /**
   * 업로드 상태 변경 콜백
   */
  const handleStatusChange = useCallback((fileId: string, status: UploadStatus, error?: string) => {
    console.log(`🔍 [handleStatusChange] fileId=${fileId}, status=${status}`);

    // 🔍 상태 업데이트 전에 파일 정보 미리 찾기
    const currentFile = uploadState.files.find(f => f.id === fileId);

    setUploadState(prev => {
      const updatedFiles = prev.files.map(f => {
        if (f.id === fileId) {
          console.log(`🔍 [handleStatusChange] Matched file: name=${f.file.name}, type=${f.file.type}`);
          const updatedFile = { ...f, status, error }

          if (status === 'completed' || status === 'warning') {
            updatedFile.completedAt = new Date()
            updatedFile.progress = 100

            // 🏷️ Annual Report 파일이면 DB 플래그 설정 및 고객 자동 연결
            if (status === 'completed' && arFilenamesRef.current.has(f.file.name)) {
              console.log(`✅ [handleStatusChange] AR 파일 업로드 완료, 고객 자동 연결 예약: ${f.file.name}`);
              const fileName = f.file.name;
              // ⚠️ 중요: arFilenamesRef 삭제를 setAnnualReportFlag로 이동
              // (handleStatusChange가 두 번 호출될 때 race condition 방지)
              // 즉시 실행 (arCustomerMappingRef는 setAnnualReportFlag 내부에서 사용됨)
              setTimeout(() => setAnnualReportFlag(fileName), 0);
            }
          }
          return updatedFile
        }
        return f
      })

      const completedCount = updatedFiles.filter(f => f.status === 'completed' || f.status === 'warning').length
      const uploadingCount = updatedFiles.filter(f => f.status === 'uploading').length
      const totalProgress = updatedFiles.length > 0
        ? Math.round(updatedFiles.reduce((sum, f) => sum + (f.status === 'completed' || f.status === 'warning' ? 100 : f.progress), 0) / updatedFiles.length)
        : 0

      return {
        ...prev,
        files: updatedFiles,
        uploading: uploadingCount > 0,
        totalProgress,
        completedCount
      }
    })

    // ✅ 로그는 상태 업데이트 함수 밖에서 호출 (부작용 제거)
    if (currentFile) {
      // 👤 AR 파일이면 고객명 가져오기
      const customerId = arCustomerMappingRef.current.get(currentFile.file.name);
      const customerName = customerId ? customerNameMappingRef.current.get(customerId) : undefined;

      if (status === 'uploading') {
        // AR 파일이면 AR 단계 표시, 일반 파일이면 일반 단계 표시
        if (arFilenamesRef.current.has(currentFile.file.name)) {
          addLog('info', `[4/5] 문서 업로드 중: ${currentFile.file.name}`, undefined, customerName)
        } else {
          addLog('info', `[2/4] 문서 업로드 중: ${currentFile.file.name}`, undefined, customerName)
        }
      } else if (status === 'completed') {
        // AR 파일이면 AR 단계 표시, 일반 파일이면 일반 단계 표시
        if (arFilenamesRef.current.has(currentFile.file.name)) {
          addLog('success', `[4/5] 문서 업로드 완료: ${currentFile.file.name}`, undefined, customerName)
          addLog('ar-detect', `AR 문서 처리 중: ${currentFile.file.name}`, '고객 자동 연결 대기 중...', customerName)
        } else {
          // 🔗 고객 파일 등록 탭에서 업로드된 파일인지 확인
          const isCustomerFile = customerFileUploadMappingRef.current.has(currentFile.file.name);

          if (isCustomerFile) {
            // 고객 파일 등록 - 자동 연결 시작
            const customerFileInfo = customerFileUploadMappingRef.current.get(currentFile.file.name);
            addLog('success', `[3/4] 문서 업로드 완료: ${currentFile.file.name}`, '메타데이터 추출 및 임베딩 진행 중...', customerFileInfo?.customerName)

            console.log(`🔗 [고객 파일 자동 연결] linkCustomerFile 호출 예약: ${currentFile.file.name}`);
            setTimeout(() => {
              console.log(`🔗 [고객 파일 자동 연결] linkCustomerFile 호출: ${currentFile.file.name}`);
              linkCustomerFile(currentFile.file.name);
            }, 1000);
          } else {
            // 일반 문서 - 백그라운드 처리 완료 확인
            addLog('success', `[3/4] 문서 업로드 완료: ${currentFile.file.name}`, '메타데이터 추출 및 임베딩 진행 중...', customerName)

            // ✅ 일반 문서도 백그라운드 처리 완료 확인 시작
            console.log(`🚀 [일반 문서] 백그라운드 처리 확인 시작: ${currentFile.file.name}`);
            // 파일명으로부터 문서 ID를 얻어야 하므로 약간의 딜레이 후 polling 시작
            setTimeout(() => {
              console.log(`🔍 [일반 문서] checkNormalDocumentCompletion 호출: ${currentFile.file.name}`);
              checkNormalDocumentCompletion(currentFile.file.name);
            }, 1000);
          }
        }
      } else if (status === 'error') {
        addLog('error', `업로드 실패: ${currentFile.file.name}`, error, customerName)
      } else if (status === 'warning') {
        addLog('warning', `업로드 경고: ${currentFile.file.name}`, error, customerName)
      }
    }
  }, [uploadState.files, setAnnualReportFlag, addLog, linkCustomerFile, checkNormalDocumentCompletion])

  /**
   * 업로드 서비스 콜백 설정 - useRef로 안정적인 참조 유지
   */
  const handleProgressRef = useRef(handleProgress)
  const handleStatusChangeRef = useRef(handleStatusChange)

  // 최신 콜백 함수를 ref에 저장
  handleProgressRef.current = handleProgress
  handleStatusChangeRef.current = handleStatusChange

  useEffect(() => {
    // 안정적인 래퍼 함수 사용
    const stableProgressCallback = (event: UploadProgressEvent) => {
      handleProgressRef.current(event)
    }

    const stableStatusCallback = (fileId: string, status: UploadStatus, error?: string) => {
      handleStatusChangeRef.current(fileId, status, error)
    }

    uploadService.setProgressCallback(stableProgressCallback)
    uploadService.setStatusCallback(stableStatusCallback)

    // 컴포넌트 언마운트 시에도 업로드 중단하지 않음
    return () => {
      // cleanup 호출하지 않음 - 브라우저 크기 변경 등으로 업로드 취소 방지
    }
  }, []) // 빈 배열로 한 번만 실행, 재렌더링 시 cleanup 방지

  /**
   * 개발 환경에서 업로드 중 페이지 이탈 경고
   */
  useEffect(() => {
    if (uploadState.uploading) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = '업로드가 진행 중입니다. 페이지를 떠나면 업로드가 취소됩니다.'
        return e.returnValue
      }

      window.addEventListener('beforeunload', handleBeforeUnload)

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
    return undefined
  }, [uploadState.uploading])

  /**
   * 업로드 완료 시 자동 정리 (선택적)
   */
  useEffect(() => {
    const allCompleted = uploadState.files.length > 0 &&
      uploadState.files.every(f => f.status === 'completed' || f.status === 'warning' || f.status === 'error')
    const hasSuccessfulUploads = uploadState.files.some(f => f.status === 'completed' || f.status === 'warning')

    // 모든 업로드 완료 후 5분 뒤 자동 정리 (사용자가 수동으로 정리하지 않은 경우)
    if (allCompleted && hasSuccessfulUploads && !uploadState.uploading) {
      const autoCleanupTimer = setTimeout(() => {
        try {
          sessionStorage.removeItem(SESSION_KEY)
          if (import.meta.env.DEV) {
            console.log('[DocumentRegistrationView] Auto-cleanup completed upload state')
          }
        } catch (error) {
          console.warn('[DocumentRegistrationView] Failed to auto-clear state:', error)
        }
      }, 5 * 60 * 1000) // 5분

      return () => clearTimeout(autoCleanupTimer)
    }
    return undefined
  }, [uploadState, SESSION_KEY])


  /**
   * 파일 선택 옵션
   */
  const fileSelectionOptions = useMemo(() => ({
    multiple: true,
    directory: true,
    maxFileSize: uploadConfig.limits.maxFileSize,
    maxFileCount: uploadConfig.limits.maxFileCount
  }), [])

  /**
   * 통계 계산
   */
  const stats = useMemo(() => {
    const total = uploadState.files.length
    const completed = uploadState.files.filter(f => f.status === 'completed' || f.status === 'warning').length
    const errors = uploadState.files.filter(f => f.status === 'error').length
    const uploading = uploadState.files.filter(f => f.status === 'uploading').length

    return { total, completed, errors, uploading }
  }, [uploadState.files])

  /**
   * 업로드 완료 시 uploading 상태 자동 해제
   */
  useEffect(() => {
    // 업로드 중인 파일이 없는데 uploading 상태가 true면 false로 변경
    if (uploadState.uploading && stats.uploading === 0 && uploadState.files.length > 0) {
      setUploadState(prev => ({ ...prev, uploading: false }))
    }
  }, [stats.uploading, uploadState.uploading, uploadState.files.length])

  // 제목에 진행 상태 표시
  const getTitle = () => {
    if (uploadState.uploading) {
      return `문서 등록 (업로드 중... ${stats.completed}/${stats.total})`
    }
    if (stats.total > 0 && !uploadState.uploading) {
      return `문서 등록 (${stats.completed}/${stats.total} 완료)`
    }
    return "새 문서 등록"
  }

  return (
    <CenterPaneView
      visible={visible}
      title={getTitle()}
      titleIcon={<SFSymbol name="doc-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} style={{ color: 'var(--color-icon-doc-register)' }} />}
      onClose={onClose}
      marginTop={4}
      marginBottom={4}
      marginLeft={4}
      marginRight={4}
      className="document-registration-view"
      placeholderIcon="doc.badge.plus"
      placeholderMessage="문서를 업로드하여 시스템에 등록할 수 있습니다"
      titleAccessory={
        <Tooltip content="도움말">
          <button
            type="button"
            className="help-icon-button"
            onClick={() => setHelpModalVisible(true)}
            aria-label="도움말"
          >
            <SFSymbol name="questionmark.circle" size={SFSymbolSize.BODY} weight={SFSymbolWeight.REGULAR} />
          </button>
        </Tooltip>
      }
    >
      <div className="document-registration-content">
        {/* 🍎 등록 방법 안내 (접기/펼치기 가능) */}
        <div className={`registration-guide ${isGuideExpanded ? 'registration-guide--expanded' : 'registration-guide--collapsed'}`}>
          <button
            type="button"
            className="registration-guide__toggle"
            onClick={toggleGuide}
            aria-expanded={isGuideExpanded ? "true" : "false"}
            aria-label={isGuideExpanded ? '도움말 접기' : '도움말 펼치기'}
          >
            <div className="guide-header">
              <div className="guide-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path className="lightbulb-bulb" d="M12 3C8.68629 3 6 5.68629 6 9C6 11.4363 7.4152 13.5392 9.42857 14.3572V17C9.42857 17.5523 9.87629 18 10.4286 18H13.5714C14.1237 18 14.5714 17.5523 14.5714 17V14.3572C16.5848 13.5392 18 11.4363 18 9C18 5.68629 15.3137 3 12 3Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path className="lightbulb-base" d="M9 18H15M10 21H14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="guide-title">문서 등록 방법</h3>
              <span className="guide-toggle-icon" aria-hidden="true">
                {isGuideExpanded ? '▲' : '▼'}
              </span>
            </div>
          </button>

          {isGuideExpanded && (
            <div className="guide-content">
              <div className="guide-section">
                <div className="guide-step">
                  <span className="step-number">1</span>
                  <div className="step-content">
                    <h4 className="step-title">고객 선택하기 (필수)</h4>
                    <p className="step-description">• 문서를 등록할 고객을 먼저 선택해주세요</p>
                    <p className="step-description">• 문서 유형과 메모는 선택사항이에요</p>
                  </div>
                </div>

                <div className="guide-step">
                  <span className="step-number">2</span>
                  <div className="step-content">
                    <h4 className="step-title">파일 올리기</h4>
                    <p className="step-description">• 고객을 선택하면 파일 업로드가 활성화돼요</p>
                    <p className="step-description">• 업로드된 문서는 선택한 고객에게 자동 연결돼요</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🎯 [필수] 고객 선택 영역 - 항상 펼쳐진 상태 */}
        <div className="customer-info-section customer-info-section--always-expanded">
          <div className="customer-info-content">
            <CustomerFileUploadArea
              selectedCustomer={customerFileCustomer}
              onCustomerSelect={setCustomerFileCustomer}
              documentType={customerFileDocType}
              onDocumentTypeChange={setCustomerFileDocType}
              notes={customerFileNotes}
              onNotesChange={setCustomerFileNotes}
              disabled={false}
              isNotesExpanded={isNotesExpanded}
              onToggleNotes={toggleNotes}
            />
          </div>
        </div>

        {/* 🎯 [핵심] 파일 업로드 영역 - 고객 선택 후 활성화 */}
        <FileUploadArea
          onFilesSelected={handleFilesSelected}
          options={fileSelectionOptions}
          uploading={uploadState.uploading}
          disabled={!customerFileCustomer || uploadState.uploading}
        />

        {/* 🍎 처리 로그 (업로드 시작 후에만 표시) */}
        {isLogVisible && (
          <div className="file-log-container">
            <ProcessingLog
              logs={processingLogs}
              maxHeight={9999}
              onClear={() => {
                setProcessingLogs([])
                setUploadState(prev => ({ ...prev, files: [] }))
                // 🍎 로그 지우기 시 로그 영역 숨김
                setIsLogVisible(false)
              }}
              uploadState={uploadState}
              uploadStats={stats}
              onCancelUpload={handleCancelAll}
              onRetryFile={handleRetryFile}
            />
          </div>
        )}

      </div>

      {/* 🍎 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📄 새 문서 등록 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>📋 등록 방법</strong></p>
            <ul>
              <li><strong>1단계</strong>: 고객을 먼저 선택</li>
              <li><strong>2단계</strong>: 파일 드래그 또는 클릭</li>
              <li>문서는 선택한 고객에게 <strong>자동 연결</strong>됩니다</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>📎 지원 형식</strong></p>
            <ul>
              <li><strong>문서</strong>: PDF, DOCX, XLSX, HWP</li>
              <li><strong>이미지</strong>: JPG, PNG</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>🤖 AR 자동 분석</strong></p>
            <ul>
              <li>보험 연간보고서(AR) PDF → AI가 자동 분석</li>
              <li>고객명 감지 시 해당 고객에게 자동 연결</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>💡 팁</strong></p>
            <ul>
              <li>여러 파일 동시 업로드 가능</li>
              <li>대량 등록은 <strong>"문서 일괄등록"</strong> 활용</li>
            </ul>
          </div>
        </div>
      </Modal>
    </CenterPaneView>
  )
}

export default DocumentRegistrationView
type StoredUploadFile = {
  id: string
  status: UploadStatus
  progress: number
  error?: string
  completedAt?: string
  relativePath?: string
  fileSize?: number
  fileInfo?: {
    name?: string
    size?: number
    type?: string
    lastModified?: number
  }
}

type StoredUploadState = Omit<UploadState, 'files'> & {
  files?: StoredUploadFile[]
}

type FileWithRelativePath = File & { webkitRelativePath?: string }
