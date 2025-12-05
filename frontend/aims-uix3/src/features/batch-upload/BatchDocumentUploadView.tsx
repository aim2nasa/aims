/**
 * BatchDocumentUploadView Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 고객 문서 일괄등록 뷰
 * - 폴더 선택/드래그앤드롭
 * - 폴더명-고객명 자동 매핑
 * - 업로드 진행률 표시
 */

import { useState, useCallback } from 'react'
import CenterPaneView from '../../components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import FolderDropZone from './components/FolderDropZone'
import MappingPreview from './components/MappingPreview'
import { groupFilesByFolder, createFolderMappings, type CustomerForMatching } from './utils/customerMatcher'
import { validateBatch } from './utils/fileValidation'
import type { FolderMapping } from './types'
import { TIER_LIMITS } from './types'
import './BatchDocumentUploadView.css'

interface BatchDocumentUploadViewProps {
  visible: boolean
  onClose: () => void
}

// 임시 고객 데이터 (실제로는 API에서 가져옴)
const mockCustomers: CustomerForMatching[] = []

export default function BatchDocumentUploadView({
  visible,
  onClose
}: BatchDocumentUploadViewProps) {
  const [step, setStep] = useState<'select' | 'preview' | 'upload' | 'complete'>('select')
  const [folderMappings, setFolderMappings] = useState<FolderMapping[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // 현재 사용자의 등급별 배치 업로드 한도 (임시: 일반 등급)
  const tierLimit = TIER_LIMITS.STANDARD.maxBatchUpload

  const handleFilesSelected = useCallback((files: File[]) => {
    // 1. 파일을 폴더별로 그룹화
    const fileGroups = groupFilesByFolder(files)

    if (fileGroups.size === 0) {
      setValidationErrors(['폴더 구조가 없는 파일입니다. 폴더를 선택해주세요.'])
      return
    }

    // 2. 파일 검증
    const allFiles = Array.from(fileGroups.values()).flat()
    const validation = validateBatch(allFiles, tierLimit)

    const errors: string[] = []
    if (validation.invalidFiles.length > 0) {
      errors.push(`${validation.invalidFiles.length}개 파일이 제외되었습니다 (크기 초과 또는 차단된 확장자)`)
    }
    if (validation.isBatchSizeExceeded) {
      errors.push('배치 총 크기가 등급 한도를 초과했습니다')
    }
    setValidationErrors(errors)

    // 3. 폴더-고객 매핑 생성
    // TODO: 실제 고객 목록은 API에서 가져와야 함
    const mappings = createFolderMappings(fileGroups, mockCustomers)
    setFolderMappings(mappings)

    // 4. 미리보기 단계로 이동
    if (mappings.length > 0) {
      setStep('preview')
    }
  }, [tierLimit])

  const handleBack = useCallback(() => {
    setStep('select')
    setFolderMappings([])
    setValidationErrors([])
  }, [])

  const handleStartUpload = useCallback(() => {
    // TODO: 업로드 로직 구현 (Phase 3)
    setStep('upload')
  }, [])

  const renderContent = () => {
    switch (step) {
      case 'select':
        return (
          <div className="batch-upload-content">
            <FolderDropZone onFilesSelected={handleFilesSelected} />
            {validationErrors.length > 0 && (
              <div className="batch-upload-errors">
                {validationErrors.map((error, index) => (
                  <div key={index} className="batch-upload-error">{error}</div>
                ))}
              </div>
            )}
          </div>
        )

      case 'preview':
        return (
          <div className="batch-upload-content">
            <MappingPreview
              mappings={folderMappings}
              onBack={handleBack}
              onStartUpload={handleStartUpload}
            />
          </div>
        )

      case 'upload':
        return (
          <div className="batch-upload-content">
            <div className="batch-upload-progress-placeholder">
              <p>업로드 진행 중... (Phase 3에서 구현)</p>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="batch-upload-content">
            <div className="batch-upload-complete-placeholder">
              <p>업로드 완료! (Phase 3에서 구현)</p>
            </div>
          </div>
        )
    }
  }

  return (
    <CenterPaneView
      visible={visible}
      title="고객 문서 일괄등록"
      titleIcon={
        <span className="menu-icon-cyan">
          <SFSymbol
            name="folder-fill-badge-plus"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="folder-fill-badge-plus"
      placeholderMessage="폴더별로 정리된 문서를 고객에게 일괄 등록합니다."
    >
      {renderContent()}
    </CenterPaneView>
  )
}
