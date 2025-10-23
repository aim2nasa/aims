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
import RefreshButton from '../../RefreshButton/RefreshButton'
import FileUploadArea from './FileUploadArea/FileUploadArea'
import FileList from './FileList/FileList'
import ProgressIndicator from './ProgressIndicator/ProgressIndicator'
import ProcessingLog from './ProcessingLog/ProcessingLog'
import { showAppleConfirm, showOversizedFilesModal } from '../../../utils/appleConfirm'
import { UploadFile, UploadState, UploadStatus, UploadProgressEvent } from './types/uploadTypes'
import { ProcessingLog as Log, LogLevel } from './types/logTypes'
import { uploadService, fileValidator } from './services/uploadService'
import { uploadConfig } from './services/userContextService'
import { CustomerIdentificationModal } from '@/features/customer/components/CustomerIdentificationModal'
import { AnnualReportApi } from '@/features/customer/api/annualReportApi'
import { checkAnnualReportFromPDF, type CheckAnnualReportResult } from '@/features/customer/utils/pdfParser'
import type { Customer } from '@/entities/customer/model'
import { DocumentService } from '@/services/DocumentService'
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
        identifierValue: 'rossi.kwak@gmail.com'
      }
    }
  }

  // 업로드 상태 관리
  const [uploadState, setUploadState] = useState<UploadState>(getInitialState)

  // 자동 성공 메시지 숨김 타이머
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // Annual Report 고객 식별 모달 상태
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [annualReportMetadata, setAnnualReportMetadata] = useState<CheckAnnualReportResult['metadata']>(null)
  const [annualReportCustomers, setAnnualReportCustomers] = useState<Customer[]>([])
  const [annualReportFile, setAnnualReportFile] = useState<{ file: File; fileName: string } | null>(null)

  // 🎯 AR 파일 큐 (여러 AR을 순차 처리)
  const arQueueRef = useRef<Array<{
    file: File
    fileName: string
    metadata: CheckAnnualReportResult['metadata']
    customers: Customer[]
  }>>([])

  // Annual Report 자동 등록 로그 메시지
  const [autoRegistrationLog, setAutoRegistrationLog] = useState<string | null>(null)

  // 🏷️ AR 파일명 추적 (업로드 완료 후 DB 플래그 설정용)
  const arFilenamesRef = useRef<Set<string>>(new Set())

  // 🔗 AR 파일명 → 고객 ID 매핑 (자동 연결용)
  const arCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 🔗 AR 문서 ID → 고객 ID 매핑 (더 확실한 연결용)
  const arDocumentCustomerMappingRef = useRef<Map<string, string>>(new Map())

  // 📝 처리 로그 상태
  const [processingLogs, setProcessingLogs] = useState<Log[]>([])

  /**
   * 로그 추가 헬퍼 함수
   */
  const addLog = useCallback((level: LogLevel, message: string, details?: string) => {
    const newLog: Log = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      details
    }
    setProcessingLogs(prev => [newLog, ...prev]) // 최신 로그를 맨 위에
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
   * 고유 ID 생성
   */
  const generateFileId = useCallback((): string => {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // 🔒 절대 신뢰성 모달 함수는 utils에서 import

  /**
   * 🎯 AR 큐에서 다음 파일을 꺼내서 모달 표시 (isProcessingArQueue 체크 없음!)
   */
  const processNextArInQueue = useCallback(() => {
    console.log('🔥 [processNextArInQueue] 큐 길이:', arQueueRef.current.length)

    if (arQueueRef.current.length === 0) {
      console.log('✅ [processNextArInQueue] 큐 비어있음 - AR 처리 완료')
      addLog('success', 'Annual Report 처리 완료', '모든 AR 파일이 처리되었습니다')
      return
    }

    const nextAr = arQueueRef.current.shift()
    if (!nextAr) return

    console.log('✅ [processNextArInQueue] 다음 AR:', nextAr.fileName, '| 남은:', arQueueRef.current.length)

    setAnnualReportMetadata(nextAr.metadata)
    setAnnualReportCustomers(nextAr.customers)
    setAnnualReportFile({ file: nextAr.file, fileName: nextAr.fileName })
    setIsCustomerModalOpen(true)

    addLog('ar-detect', `AR 모달: ${nextAr.metadata?.customer_name}`, `남은 AR: ${arQueueRef.current.length}개`)
  }, [addLog])

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
            addLog('info', `PDF 분석 중: ${file.name}`)
            console.log('[DocumentRegistrationView] 🔍 PDF 파일 감지, Annual Report 체크:', file.name);
            const checkResult = await checkAnnualReportFromPDF(file);

            if (checkResult.is_annual_report && checkResult.metadata) {
              console.log('[DocumentRegistrationView] ✅ Annual Report 감지!', checkResult.metadata);

              // 고객명으로 검색
              const customers = await AnnualReportApi.searchCustomersByName(checkResult.metadata.customer_name);
              console.log('[DocumentRegistrationView] 고객 검색 결과:', customers.length, '명');

              addLog(
                'ar-detect',
                `Annual Report 감지: ${checkResult.metadata.customer_name}`,
                `발행일: ${checkResult.metadata.issue_date} | 고객 ${customers.length}명 검색됨`
              )

              // 🎯 AR 큐에 추가
              arQueueRef.current.push({
                file,
                fileName: file.name,
                metadata: checkResult.metadata,
                customers
              })

              console.log('🔥 [handleFilesSelected] AR 큐 추가:', file.name, '| 큐:', arQueueRef.current.length);
              continue;
            } else {
              addLog('info', `일반 PDF 문서: ${file.name}`)
            }
          } catch (error) {
            console.error('[DocumentRegistrationView] Annual Report 체크 실패:', error);
            addLog('warning', `PDF 분석 실패: ${file.name}`, error instanceof Error ? error.message : String(error))
            // 체크 실패 시 일반 문서로 처리
          }
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
          relativePath: (file as FileWithRelativePath).webkitRelativePath || undefined
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

    // 상태 업데이트 - 새 파일을 맨 앞에 추가
    setUploadState(prev => ({
      ...prev,
      files: [...newUploadFiles, ...prev.files]
    }))

    // 유효한 파일들만 업로드 큐에 추가
    const validFiles = newUploadFiles.filter(f => f.status === 'pending')
    if (validFiles.length > 0) {
      uploadService.queueFiles(validFiles)
      addLog('info', `일반 문서 ${validFiles.length}개 업로드 시작`)
    }

    // 🎯 AR 큐 처리 시작
    if (arQueueRef.current.length > 0) {
      console.log('🔥 [handleFilesSelected] AR 큐 처리 시작, 큐:', arQueueRef.current.length)
      processNextArInQueue()
    }
  }, [generateFileId, addLog, processNextArInQueue])

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
   * 상태 완전 초기화 (수동)
   */
  const handleClearAll = useCallback(() => {
    uploadService.cancelAllUploads()
    setUploadState({
      files: [],
      uploading: false,
      totalProgress: 0,
      completedCount: 0,
      errors: [],
      context: {
        identifierType: 'userId',
        identifierValue: 'rossi.kwak@gmail.com'
      }
    })
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      console.warn('[DocumentRegistrationView] Failed to clear state:', error)
    }
  }, [SESSION_KEY])

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
    try {
      const response = await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileName })
      });
      const responseData = await response.json();
      console.log(`✅ [AR] is_annual_report=true 설정 완료:`, responseData);

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
            const docResponse = await fetch(`http://tars.giize.com:3010/api/documents/${documentId}/status`);
            const response = await docResponse.json();

            // 문서 처리 완료 확인 (overallStatus === 'completed')
            if (response.success && response.data?.computed?.overallStatus === 'completed') {
              clearInterval(checkAndLink);

              console.log(`🔗 [AR 자동 연결] 문서 처리 완료 확인, 연결 시작`);

              await DocumentService.linkDocumentToCustomer(customerId, {
                document_id: documentId,
                relationship_type: 'annual_report'
              });

              console.log(`✅ [AR 자동 연결] 완료`);
              arCustomerMappingRef.current.delete(fileName);
              arDocumentCustomerMappingRef.current.delete(documentId);
            } else if (attempts >= maxAttempts) {
              clearInterval(checkAndLink);
              console.warn(`⚠️ [AR] 문서 처리 대기 시간 초과`);
              arCustomerMappingRef.current.delete(fileName);
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
   * 고객 선택 완료 핸들러
   */
  const handleCustomerSelected = useCallback(async (customerId: string) => {
    if (!annualReportFile) return;

    try {
      // 🏷️ AR 파일로 추적 (업로드 완료 후 DB 플래그 설정용)
      arFilenamesRef.current.add(annualReportFile.fileName);
      console.log(`[DocumentRegistrationView] 🏷️ AR 파일 추적 추가 (모달): ${annualReportFile.fileName}`);

      // 🔗 AR 파일명 → 고객 ID 매핑 저장 (문서 처리 완료 후 자동 연결용)
      arCustomerMappingRef.current.set(annualReportFile.fileName, customerId);
      console.log(`[DocumentRegistrationView] 🔗 AR 고객 매핑 저장: ${annualReportFile.fileName} → ${customerId}`);

      // Annual Report 파싱 요청 (백그라운드 AI 처리)
      const parseResult = await AnnualReportApi.parseAnnualReportFile(
        annualReportFile.file,
        customerId
      );

      if (parseResult.success) {
        console.log('[DocumentRegistrationView] Annual Report 파싱 요청 성공:', parseResult);
      } else {
        console.error('[DocumentRegistrationView] Annual Report 파싱 요청 실패:', parseResult.message);
      }

      // 📤 Annual Report PDF를 일반 문서처럼 업로드 큐에 추가
      const uploadFile: UploadFile = {
        id: generateFileId(),
        file: annualReportFile.file,
        fileSize: annualReportFile.file.size,
        status: 'pending',
        progress: 0,
        error: undefined,
        completedAt: undefined,
      };

      // 업로드 상태에 추가
      setUploadState(prev => ({
        ...prev,
        files: [uploadFile, ...prev.files]
      }));

      // 업로드 큐에 추가 및 즉시 시작
      uploadService.queueFiles([uploadFile]);

      // ⚠️ 업로드가 자동 시작되지 않는 경우를 위해 명시적으로 업로드 시작 트리거
      console.log('[DocumentRegistrationView] Annual Report 파일을 업로드 큐에 추가:', annualReportFile.fileName);

      // 업로드 서비스가 이미 실행 중이 아니면 시작
      if (!uploadState.uploading) {
        setUploadState(prev => ({ ...prev, uploading: true }));
      }

    } catch (error) {
      console.error('[DocumentRegistrationView] Annual Report 처리 중 오류:', error);
    } finally {
      // 모달 닫기
      setIsCustomerModalOpen(false);
      setAnnualReportMetadata(null);
      setAnnualReportCustomers([]);
      setAnnualReportFile(null);

      // 🎯 다음 AR 처리
      setTimeout(() => processNextArInQueue(), 100)
    }
  }, [annualReportFile, generateFileId, processNextArInQueue]);

  /**
   * 고객 식별 모달 닫기 (취소)
   */
  const handleCustomerModalClose = useCallback(() => {
    if (annualReportFile) {
      addLog('warning', `AR 등록 취소: ${annualReportFile.fileName}`)
    }

    setIsCustomerModalOpen(false);
    setAnnualReportMetadata(null);
    setAnnualReportCustomers([]);
    setAnnualReportFile(null);

    // 🎯 취소해도 다음 AR 처리
    setTimeout(() => processNextArInQueue(), 100)
  }, [annualReportFile, addLog, processNextArInQueue]);

  /**
   * 업로드 상태 변경 콜백
   */
  const handleStatusChange = useCallback((fileId: string, status: UploadStatus, error?: string) => {
    console.log(`🔍 [handleStatusChange] fileId=${fileId}, status=${status}`);
    setUploadState(prev => {
      const updatedFiles = prev.files.map(f => {
        if (f.id === fileId) {
          console.log(`🔍 [handleStatusChange] Matched file: name=${f.file.name}, type=${f.file.type}`);
          const updatedFile = { ...f, status, error }

          // 로그 추가
          if (status === 'uploading') {
            addLog('info', `업로드 시작: ${f.file.name}`)
          } else if (status === 'completed') {
            addLog('success', `업로드 완료: ${f.file.name}`)
          } else if (status === 'error') {
            addLog('error', `업로드 실패: ${f.file.name}`, error)
          } else if (status === 'warning') {
            addLog('warning', `업로드 경고: ${f.file.name}`, error)
          }

          if (status === 'completed' || status === 'warning') {
            updatedFile.completedAt = new Date()
            updatedFile.progress = 100

            // 🏷️ Annual Report 파일이면 DB 플래그 설정
            if (status === 'completed' && arFilenamesRef.current.has(f.file.name)) {
              console.log(`✅ [handleStatusChange] AR 파일 업로드 완료, DB 플래그 설정: ${f.file.name}`);
              addLog('ar-detect', `AR 문서 처리 중: ${f.file.name}`, '고객과 자동 연결 대기 중...')
              setAnnualReportFlag(f.file.name);
              // 추적 목록에서 제거
              arFilenamesRef.current.delete(f.file.name);
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
  }, [setAnnualReportFlag, addLog])

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
   * 성공 메시지 자동 숨김
   */
  useEffect(() => {
    const allCompleted = uploadState.files.length > 0 &&
      uploadState.files.every(f => f.status === 'completed' || f.status === 'warning' || f.status === 'error')
    const hasSuccessfulUploads = uploadState.files.some(f => f.status === 'completed' || f.status === 'warning')

    if (allCompleted && hasSuccessfulUploads && !uploadState.uploading) {
      setShowSuccessMessage(true)

      // 3초 후 성공 메시지 숨김
      const timer = setTimeout(() => {
        setShowSuccessMessage(false)
      }, 3000)

      return () => clearTimeout(timer)
    } else {
      setShowSuccessMessage(false)
    }

    return undefined
  }, [uploadState.files, uploadState.uploading])

  /**
   * Annual Report 자동 등록 로그 자동 숨김
   */
  useEffect(() => {
    if (autoRegistrationLog) {
      // 5초 후 로그 메시지 숨김
      const timer = setTimeout(() => {
        setAutoRegistrationLog(null)
      }, 5000)

      return () => clearTimeout(timer)
    }
    return undefined
  }, [autoRegistrationLog])

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

  // 제목에 진행 상태 표시
  const getTitle = () => {
    if (uploadState.uploading) {
      return `문서 등록 (업로드 중... ${stats.completed}/${stats.total})`
    }
    if (stats.total > 0 && !uploadState.uploading) {
      return `문서 등록 (${stats.completed}/${stats.total} 완료)`
    }
    return "문서 등록"
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
    >
      <div className="document-registration-content">
        {/* Header with Refresh Button */}
        {uploadState.files.length > 0 && (
          <div className="document-registration-header">
            <RefreshButton
              onClick={async () => {
                const confirmed = await showAppleConfirm(
                  '모든 업로드 기록을 초기화하시겠습니까?',
                  '업로드 초기화'
                );
                if (confirmed) {
                  handleClearAll();
                }
              }}
              tooltip="업로드 기록 초기화"
              size="small"
            />
          </div>
        )}

        {/* 파일 업로드 영역 */}
        <FileUploadArea
          onFilesSelected={handleFilesSelected}
          options={fileSelectionOptions}
          uploading={uploadState.uploading}
          disabled={false}
        />

        {/* 진행률 표시 - 업로드 중인 파일이 있으면 항상 표시 */}
        {(uploadState.uploading || showSuccessMessage || stats.uploading > 0) && (
          <ProgressIndicator
            uploadState={uploadState}
            onCancel={(uploadState.uploading || stats.uploading > 0) ? handleCancelAll : (() => {})}
          />
        )}

        {/* 파일 목록 */}
        {uploadState.files.length > 0 && (
          <FileList
            files={uploadState.files}
            onRetryFile={handleRetryFile}
            onClearAll={handleClearAll}
            readonly={false}
          />
        )}

        {/* 처리 로그 */}
        <ProcessingLog
          logs={processingLogs}
          maxHeight={300}
          onClear={() => setProcessingLogs([])}
        />

        {/* 🍎 SUCCESS MESSAGE: Ultra-minimal notification */}
        {showSuccessMessage && stats.completed > 0 && (
          <div className="upload-success">
            <div className="upload-success__content">
              <SFSymbol
                name="checkmark"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                className="upload-success__icon"
              />
              <span className="upload-success__text">
                {stats.errors > 0
                  ? `${stats.completed} uploaded, ${stats.errors} errors`
                  : `${stats.completed} files uploaded`
                }
              </span>
              {!uploadState.uploading && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="upload-success__button"
                  aria-label="Clear completed uploads"
                >
                  <SFSymbol
                    name="xmark"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                  />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 🍎 Annual Report 자동 등록 로그 메시지 */}
        {autoRegistrationLog && (
          <div className="upload-success">
            <div className="upload-success__content">
              <SFSymbol
                name="checkmark.circle.fill"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
                className="upload-success__icon"
              />
              <span className="upload-success__text">{autoRegistrationLog}</span>
              <button
                type="button"
                onClick={() => setAutoRegistrationLog(null)}
                className="upload-success__button"
                aria-label="Close notification"
              >
                <SFSymbol
                  name="xmark"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                />
              </button>
            </div>
          </div>
        )}

        {/* 🔒 절대 신뢰성 모달은 DOM 직접 조작으로 처리됨 */}

        {/* Annual Report 고객 식별 모달 */}
        <CustomerIdentificationModal
          isOpen={isCustomerModalOpen}
          onClose={handleCustomerModalClose}
          metadata={annualReportMetadata}
          customers={annualReportCustomers}
          onCustomerSelected={handleCustomerSelected}
          fileName={annualReportFile?.fileName || ''}
        />
      </div>
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
