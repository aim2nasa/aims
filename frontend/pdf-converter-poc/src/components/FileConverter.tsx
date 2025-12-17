import { useState, useRef, useCallback, useEffect } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'
type ProgressStage = 'upload' | 'convert' | 'finalize'

interface ConversionResult {
  pdfUrl: string
  fileName: string
  conversionTime: number
}

interface ProgressInfo {
  stage: ProgressStage
  percent: number
  message: string
}

function FileConverter() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>('')
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [progress, setProgress] = useState<ProgressInfo>({ stage: 'upload', percent: 0, message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressIntervalRef = useRef<number | null>(null)

  const allowedExtensions = [
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.rtf', '.txt', '.csv', '.html',
    '.hwp'  // HWP 지원 (베타)
  ]

  const validateFile = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowedExtensions.includes(ext)) {
      setError(`지원하지 않는 파일 형식입니다: ${ext}`)
      return false
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('파일 크기는 50MB를 초과할 수 없습니다.')
      return false
    }
    return true
  }

  const handleFileSelect = (file: File) => {
    setError('')
    setResult(null)
    setShowPreview(false)

    if (validateFile(file)) {
      setSelectedFile(file)
      setStatus('idle')
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // 프로그레스 시뮬레이션 정리
  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => clearProgressInterval()
  }, [clearProgressInterval])

  // 프로그레스 시뮬레이션 시작
  const startProgressSimulation = useCallback(() => {
    setProgress({ stage: 'upload', percent: 0, message: '파일 업로드 중...' })

    let currentPercent = 0
    let currentStage: ProgressStage = 'upload'

    progressIntervalRef.current = window.setInterval(() => {
      // 단계별 진행 속도 조절
      let increment = 0
      if (currentStage === 'upload') {
        increment = Math.random() * 8 + 2 // 2-10%씩 증가
        if (currentPercent >= 30) {
          currentStage = 'convert'
          setProgress({ stage: 'convert', percent: 30, message: 'PDF 변환 중...' })
        }
      } else if (currentStage === 'convert') {
        increment = Math.random() * 3 + 1 // 1-4%씩 증가 (변환은 느리게)
        if (currentPercent >= 85) {
          currentStage = 'finalize'
          setProgress({ stage: 'finalize', percent: 85, message: '마무리 중...' })
        }
      } else {
        increment = Math.random() * 2 + 0.5 // 0.5-2.5%씩 증가
        if (currentPercent >= 95) {
          // 95%에서 멈춤 (실제 완료 시 100%로)
          increment = 0
        }
      }

      currentPercent = Math.min(currentPercent + increment, 95)

      const messages: Record<ProgressStage, string> = {
        upload: '파일 업로드 중...',
        convert: 'PDF 변환 중...',
        finalize: '마무리 중...'
      }

      setProgress(prev => ({
        ...prev,
        stage: currentStage,
        percent: Math.round(currentPercent),
        message: messages[currentStage]
      }))
    }, 200)
  }, [])

  const handleConvert = async () => {
    if (!selectedFile) return

    setStatus('loading')
    setError('')
    setResult(null)
    startProgressSimulation()

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const startTime = Date.now()
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData
      })

      clearProgressInterval()

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || ''
        let errorMessage = `변환 실패 (HTTP ${response.status})`
        try {
          if (contentType.includes('application/json')) {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } else {
            const text = await response.text()
            if (text) errorMessage = text
          }
        } catch {
          // 파싱 실패 시 기본 에러 메시지 사용
        }
        throw new Error(errorMessage)
      }

      // 완료 시 100%로 설정
      setProgress({ stage: 'finalize', percent: 100, message: '완료!' })

      // PDF blob 생성 (명시적 type 지정으로 프리뷰 호환성 향상)
      const arrayBuffer = await response.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
      const pdfUrl = URL.createObjectURL(blob)
      const conversionTime = parseInt(response.headers.get('X-Conversion-Time') || '0', 10) || (Date.now() - startTime)

      const pdfFileName = selectedFile.name.replace(/\.[^/.]+$/, '.pdf')

      setResult({
        pdfUrl,
        fileName: pdfFileName,
        conversionTime
      })
      setStatus('success')
    } catch (err) {
      clearProgressInterval()
      setProgress({ stage: 'upload', percent: 0, message: '' })
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setStatus('error')
    }
  }

  const handleDownload = () => {
    if (!result) return

    const link = document.createElement('a')
    link.href = result.pdfUrl
    link.download = result.fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleReset = () => {
    if (result?.pdfUrl) {
      URL.revokeObjectURL(result.pdfUrl)
    }
    setSelectedFile(null)
    setStatus('idle')
    setError('')
    setResult(null)
    setShowPreview(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'doc':
      case 'docx':
      case 'odt':
        return '📝'
      case 'xls':
      case 'xlsx':
      case 'ods':
      case 'csv':
        return '📊'
      case 'ppt':
      case 'pptx':
      case 'odp':
        return '📽️'
      case 'txt':
      case 'rtf':
        return '📄'
      case 'html':
        return '🌐'
      case 'hwp':
        return '📃'
      default:
        return '📁'
    }
  }

  return (
    <div className="file-converter">
      <div
        className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-zone-icon">📎</div>
        <div className="drop-zone-text">
          파일을 여기에 드래그하거나 클릭하여 선택하세요
        </div>
        <div className="drop-zone-hint">
          DOCX, XLSX, PPTX, HWP, CSV, ODT, RTF, TXT, HTML (최대 50MB)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="file-input"
          accept={allowedExtensions.join(',')}
          onChange={handleInputChange}
        />
      </div>

      {selectedFile && (
        <div className="selected-file">
          <div className="file-info">
            <span className="file-icon">{getFileIcon(selectedFile.name)}</span>
            <div>
              <div className="file-name">{selectedFile.name}</div>
              <div className="file-size">{formatFileSize(selectedFile.size)}</div>
            </div>
          </div>
          <button className="remove-btn" onClick={handleReset} title="파일 제거">
            ✕
          </button>
        </div>
      )}

      <button
        className="convert-btn"
        onClick={handleConvert}
        disabled={!selectedFile || status === 'loading'}
      >
        {status === 'loading' ? (
          <>
            <span className="spinner" />
            변환 중...
          </>
        ) : (
          'PDF로 변환'
        )}
      </button>

      {status === 'loading' && (
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-message">{progress.message}</span>
            <span className="progress-percent">{progress.percent}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="progress-stages">
            <div className={`progress-stage ${progress.stage === 'upload' ? 'active' : ''} ${progress.percent >= 30 ? 'completed' : ''}`}>
              <span className="stage-dot" />
              <span className="stage-label">업로드</span>
            </div>
            <div className={`progress-stage ${progress.stage === 'convert' ? 'active' : ''} ${progress.percent >= 85 ? 'completed' : ''}`}>
              <span className="stage-dot" />
              <span className="stage-label">변환</span>
            </div>
            <div className={`progress-stage ${progress.stage === 'finalize' ? 'active' : ''} ${progress.percent >= 100 ? 'completed' : ''}`}>
              <span className="stage-dot" />
              <span className="stage-label">완료</span>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="status error">
          {error}
        </div>
      )}

      {status === 'success' && result && (
        <>
          <div className="status success">
            변환 완료! (소요 시간: {(result.conversionTime / 1000).toFixed(2)}초)
          </div>

          <div className="result">
            <h3>변환 결과</h3>
            <div className="result-actions">
              <button className="result-btn primary" onClick={handleDownload}>
                📥 PDF 다운로드
              </button>
              <button
                className="result-btn secondary"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? '👁️ 프리뷰 닫기' : '👁️ 프리뷰 보기'}
              </button>
              <button className="result-btn secondary" onClick={handleReset}>
                🔄 새 파일 변환
              </button>
            </div>
          </div>

          {showPreview && (
            <div className="pdf-preview">
              <iframe src={result.pdfUrl} title="PDF Preview" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default FileConverter
