/**
 * FolderDropZone Component
 * @since 2025-12-05
 * @version 2.0.0
 *
 * 폴더 선택 및 드래그앤드롭 영역
 * v2: AR/CR 등록 패턴과 동일한 깔끔한 레이아웃으로 개편
 */

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
import type { BatchAnalyzeProgress, BatchAnalyzeStage } from '../types'
import './FolderDropZone.css'

/**
 * 같은 디렉토리 내 파일 동시 읽기 상한
 * - 너무 크면 브라우저 메모리/핸들 폭발
 * - 너무 작으면 병렬 이점 소실
 * - 한 번에 500개 파일을 Promise.all로 병렬 읽기 → 다음 청크
 */
const FILE_READ_CONCURRENCY = 500

/**
 * Progress 업데이트 throttle 간격 (ms)
 * 1000개 파일에 대해 1000번 setState 방지 — 100ms마다 최대 1번
 */
const PROGRESS_THROTTLE_MS = 100

/**
 * 단계별 라벨 (한글)
 */
function renderStageLabel(stage: BatchAnalyzeStage): string {
  switch (stage) {
    case 'reading':
      return '파일 목록 읽는 중...'
    case 'validating':
      return '파일 검증 중...'
    case 'matching':
      return '고객 매칭 중...'
    case 'checking-storage':
      return '용량 확인 중...'
    default:
      return '폴더 분석 중...'
  }
}

/**
 * 단계별 수치 카운트 텍스트
 * - reading: "{current}개" (총계 미지수)
 * - validating: "{current} / {total}"
 * - matching: "{current} / {total} 폴더"
 * - checking-storage: 카운트 없음
 */
function renderStageCount(progress: BatchAnalyzeProgress): string {
  const { stage, current, total } = progress
  switch (stage) {
    case 'reading':
      return `${current.toLocaleString()}개`
    case 'validating':
      return total !== null
        ? `${current.toLocaleString()} / ${total.toLocaleString()}`
        : `${current.toLocaleString()}개`
    case 'matching':
      return total !== null
        ? `${current.toLocaleString()} / ${total.toLocaleString()} 폴더`
        : `${current.toLocaleString()} 폴더`
    case 'checking-storage':
      return '잠시만 기다려주세요'
    default:
      return ''
  }
}

interface FolderDropZoneProps {
  onFilesSelected: (files: File[]) => void | Promise<void>
  disabled?: boolean
  /**
   * 분석 진행률 표시 (controlled)
   * - null: 분석 중 아님 (드롭존 기본 UI 표시)
   * - 객체: 분석 중 (진행률 UI 표시)
   * 부모가 readDir 이후 validating/matching/checking-storage 단계를 이어서 보고함
   */
  analyzeProgress?: BatchAnalyzeProgress | null
  /**
   * 진행률 변경 콜백 (부모 state로 전달)
   * readDir 단계에서 호출되며, 이후 단계는 부모가 직접 호출
   */
  onAnalyzeProgress?: (progress: BatchAnalyzeProgress | null) => void
}

export default function FolderDropZone({
  onFilesSelected,
  disabled = false,
  analyzeProgress = null,
  onAnalyzeProgress
}: FolderDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isGuideExpanded, setIsGuideExpanded] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // 분석 진행 여부 (UI 비활성화용) — controlled prop 기반
  const isProcessing = analyzeProgress !== null

  /**
   * throttle 헬퍼
   * - 마지막 업데이트 시각을 클로저로 추적
   * - stage 전환/완료는 즉시 flush (force=true)
   */
  const createProgressReporter = useCallback(() => {
    let lastEmit = 0
    const emit = (progress: BatchAnalyzeProgress, force = false) => {
      const now = performance.now()
      if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) return
      lastEmit = now
      onAnalyzeProgress?.(progress)
    }
    return emit
  }, [onAnalyzeProgress])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (disabled) return

    const emitProgress = createProgressReporter()
    emitProgress({ stage: 'reading', current: 0, total: null }, true)
    try {
      const items = e.dataTransfer.items
      const allFiles: File[] = []

      // 폴더 엔트리를 재귀적으로 읽는 함수
      const readEntry = async (entry: FileSystemEntry, path: string): Promise<void> => {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry
          return new Promise((resolve) => {
            fileEntry.file((file) => {
              // webkitRelativePath를 수동으로 설정한 새 File 객체 생성
              const fileWithPath = new File([file], file.name, {
                type: file.type,
                lastModified: file.lastModified,
              })
              // webkitRelativePath는 readonly라서 Object.defineProperty 사용
              Object.defineProperty(fileWithPath, 'webkitRelativePath', {
                value: path + file.name,
                writable: false,
              })
              allFiles.push(fileWithPath)
              emitProgress({ stage: 'reading', current: allFiles.length, total: null })
              resolve()
            })
          })
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry
          const dirReader = dirEntry.createReader()

          // readEntries는 한 번에 최대 100개만 반환하므로 반복 호출 필요
          const readAllEntries = (): Promise<FileSystemEntry[]> => {
            return new Promise((resolve, reject) => {
              const collected: FileSystemEntry[] = []
              const readNext = () => {
                dirReader.readEntries((entries) => {
                  if (entries.length === 0) {
                    resolve(collected)
                    return
                  }
                  collected.push(...entries)
                  readNext()
                }, reject)
              }
              readNext()
            })
          }

          const childEntries = await readAllEntries()
          const childPath = path + entry.name + '/'

          // 파일/디렉토리 분리
          const fileChildren = childEntries.filter(c => c.isFile)
          const dirChildren = childEntries.filter(c => c.isDirectory)

          // 같은 디렉토리 내 파일들을 청크 병렬로 읽기
          for (let i = 0; i < fileChildren.length; i += FILE_READ_CONCURRENCY) {
            const chunk = fileChildren.slice(i, i + FILE_READ_CONCURRENCY)
            await Promise.all(chunk.map(c => readEntry(c, childPath)))
          }

          // 하위 디렉토리 병렬 탐색
          await Promise.all(dirChildren.map(c => readEntry(c, childPath)))
        }
      }

      // DataTransferItemList에서 엔트리 추출
      if (items) {
        const entries: FileSystemEntry[] = []

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.()
            if (entry) {
              entries.push(entry)
            }
          }
        }

        // 루트 엔트리들 병렬 처리
        await Promise.all(entries.map(entry => readEntry(entry, '')))
      }

      // reading 단계 완료 flush (throttle 끝단 누락 방지)
      emitProgress({ stage: 'reading', current: allFiles.length, total: null }, true)

      if (allFiles.length > 0) {
        // 이후 단계(validating/matching/checking-storage)는 부모가 진행률을 보고함
        await onFilesSelected(allFiles)
      } else {
        // 파일 없음 — 진행률 리셋
        onAnalyzeProgress?.(null)
      }
    } catch (err) {
      console.error('[FolderDropZone] 드롭 처리 오류:', err)
      onAnalyzeProgress?.(null)
    }
  }, [disabled, onFilesSelected, onAnalyzeProgress, createProgressReporter])

  const handleInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const allFiles = Array.from(files)

    // webkitdirectory는 브라우저가 파일을 이미 메모리로 읽어 완료 상태로 전달
    // reading 단계는 즉시 완료로 보고 → 바로 다음 단계(부모)로 위임
    onAnalyzeProgress?.({ stage: 'reading', current: allFiles.length, total: allFiles.length })
    try {
      await onFilesSelected(allFiles)
    } catch (err) {
      console.error('[FolderDropZone] 입력 처리 오류:', err)
      onAnalyzeProgress?.(null)
    }

    // input 초기화 (같은 폴더 재선택 가능)
    e.target.value = ''
  }, [onFilesSelected, onAnalyzeProgress])

  // showDirectoryPicker API로 브라우저 확인 모달 없이 폴더 선택
  const handleClick = useCallback(async () => {
    if (disabled || isProcessing) return

    // showDirectoryPicker 미지원 시 기존 input fallback
    if (!('showDirectoryPicker' in window)) {
      folderInputRef.current?.click()
      return
    }

    let dirHandle: any
    try {
      dirHandle = await (window as any).showDirectoryPicker()
    } catch (err: any) {
      // 사용자가 취소한 경우 (AbortError) 무시 — 진행률 표시 시작 전
      if (err?.name !== 'AbortError') {
        console.error('폴더 선택 오류:', err)
      }
      return
    }

    const emitProgress = createProgressReporter()
    emitProgress({ stage: 'reading', current: 0, total: null }, true)

    try {
      const allFiles: File[] = []

      // 디렉토리 병렬 탐색 (엔트리 수집 후 파일을 청크로 병렬 읽기)
      async function readDir(handle: any, path: string): Promise<void> {
        const entries: Array<{ entry: any; path: string }> = []
        const subdirs: Array<{ handle: any; path: string }> = []

        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            entries.push({ entry, path })
          } else if (entry.kind === 'directory') {
            subdirs.push({ handle: entry, path: path ? `${path}/${entry.name}` : entry.name })
          }
        }

        // 같은 디렉토리 내 파일을 청크 병렬로 읽기
        // 기존: for 루프로 50개 배치 순차 → 청크(FILE_READ_CONCURRENCY)로 병렬화
        for (let i = 0; i < entries.length; i += FILE_READ_CONCURRENCY) {
          const chunk = entries.slice(i, i + FILE_READ_CONCURRENCY)
          const files = await Promise.all(chunk.map(async ({ entry, path: p }) => {
            const file = await entry.getFile()
            const newFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified })
            Object.defineProperty(newFile, 'webkitRelativePath', {
              value: p ? `${p}/${file.name}` : file.name,
              writable: false,
            })
            return newFile
          }))
          allFiles.push(...files)
          // 청크 완료마다 진행률 업데이트 (throttle 적용)
          emitProgress({ stage: 'reading', current: allFiles.length, total: null })
        }

        // 하위 디렉토리 병렬 탐색
        await Promise.all(subdirs.map(sub => readDir(sub.handle, sub.path)))
      }

      await readDir(dirHandle, dirHandle.name)

      // reading 단계 완료 flush (throttle 끝단 누락 방지)
      emitProgress({ stage: 'reading', current: allFiles.length, total: null }, true)

      if (allFiles.length > 0) {
        // 이후 단계(validating/matching/checking-storage)는 부모가 진행률을 보고함
        await onFilesSelected(allFiles)
      } else {
        // 파일 없음 — 진행률 리셋
        onAnalyzeProgress?.(null)
      }
    } catch (err) {
      console.error('[FolderDropZone] 폴더 분석 오류:', err)
      onAnalyzeProgress?.(null)
    }
  }, [disabled, isProcessing, onFilesSelected, onAnalyzeProgress, createProgressReporter])

  return (
    <div
      className={`folder-drop-zone ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="region"
      aria-label={disabled ? "폴더 드롭존 (비활성)" : "폴더를 드래그하세요"}
    >
      {/* 접히는 가이드 — AR/CR 등록 방법과 동일한 패턴 */}
      <div className={`folder-guide ${isGuideExpanded ? 'folder-guide--expanded' : 'folder-guide--collapsed'}`}>
        <button
          type="button"
          className="folder-guide__toggle"
          onClick={() => setIsGuideExpanded(!isGuideExpanded)}
          aria-label={isGuideExpanded ? '사용법 접기' : '사용법 펼치기'}
        >
          <div className="folder-guide__header">
            <svg className="folder-guide__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path className="lightbulb-bulb" d="M12 3C8.68629 3 6 5.68629 6 9C6 11.4363 7.4152 13.5392 9.42857 14.3572V17C9.42857 17.5523 9.87629 18 10.4286 18H13.5714C14.1237 18 14.5714 17.5523 14.5714 17V14.3572C16.5848 13.5392 18 11.4363 18 9C18 5.68629 15.3137 3 12 3Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path className="lightbulb-base" d="M9 18H15M10 21H14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3 className="folder-guide__title">폴더 준비 방법</h3>
            <span className="folder-guide__toggle-icon" aria-hidden="true">
              {isGuideExpanded ? '▲' : '▼'}
            </span>
          </div>
        </button>

        {isGuideExpanded && (
          <div className="folder-guide__content">
            <p className="folder-guide__desc">
              내 PC에 고객 이름으로 된 폴더가 있으면 그대로 사용할 수 있어요.
            </p>

            {/* 간결한 2단계 가이드 — 일반 문서 등록 패턴 */}
            <div className="folder-guide__steps">
              <div className="folder-guide__step">
                <span className="folder-guide__step-number">1</span>
                <div className="folder-guide__step-text">
                  <strong>고객별로 문서 정리</strong>
                  <span>고객 이름 폴더 안에 문서를 넣어두세요</span>
                </div>
              </div>
              <div className="folder-guide__step">
                <span className="folder-guide__step-number">2</span>
                <div className="folder-guide__step-text">
                  <strong>여기로 끌어오기</strong>
                  <span>이름이 같은 고객에게 알아서 연결돼요</span>
                </div>
              </div>
            </div>

            {/* 미니 예시 — 한눈에 볼 수 있는 간결한 구조 */}
            <div className="folder-guide__example">
              <span className="folder-guide__example-label">예시</span>
              <div className="folder-guide__example-tree">
                <div className="folder-guide__example-row">
                  <span>📁</span>
                  <span className="folder-guide__example-name">홍길동</span>
                  <span className="folder-guide__example-arrow">→</span>
                  <span className="folder-guide__example-match">홍길동 고객에 자동 연결</span>
                </div>
                <div className="folder-guide__example-row folder-guide__example-row--child">
                  <span>📄</span>
                  <span className="folder-guide__example-file">보험증권.pdf</span>
                </div>
                <div className="folder-guide__example-row folder-guide__example-row--child">
                  <span>📄</span>
                  <span className="folder-guide__example-file">약관.pdf</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 드롭존 — 화면의 주인공 */}
      <div
        className={`folder-drop-zone-content ${disabled ? 'disabled' : ''} ${isProcessing ? 'processing' : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      >
        {/* hidden input은 showDirectoryPicker 미지원 브라우저 fallback용 */}
        <input
          ref={folderInputRef}
          type="file"
          className="folder-input-hidden"
          onChange={handleInputChange}
          disabled={disabled || isProcessing}
          aria-label="폴더 선택"
          /* @ts-expect-error webkitdirectory is non-standard but widely supported */
          webkitdirectory=""
          multiple
        />
        {isProcessing && analyzeProgress ? (
          <>
            <div className="folder-processing-spinner" />
            <span className="folder-drop-zone-title">
              {renderStageLabel(analyzeProgress.stage)}
            </span>
            <span className="folder-drop-zone-description">
              <span className="folder-progress-count">
                {renderStageCount(analyzeProgress)}
              </span>
            </span>
          </>
        ) : (
          <>
            {/* + 버튼 — AR/CR 드롭존과 동일한 세로 배치 */}
            <div className="folder-select-plus-icon">
              <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
                <path d="M24 10V38M10 24H38" stroke="white" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="folder-drop-zone-title">
              {isDragOver ? '여기에 놓으세요' : '지금 바로 폴더를 끌어다 놓으세요!'}
            </span>
            <span className="folder-drop-zone-description">
              또는 클릭하여 폴더 선택
            </span>
            <span className="folder-drop-zone-hint">
              내 PC에서 고객 이름으로 만든 폴더를 선택하세요
            </span>
          </>
        )}
      </div>
    </div>
  )
}
