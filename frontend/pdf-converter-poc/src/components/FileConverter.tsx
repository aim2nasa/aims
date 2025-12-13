import { useState, useRef, useCallback } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface ConversionResult {
  pdfUrl: string
  fileName: string
  conversionTime: number
}

function FileConverter() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>('')
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allowedExtensions = [
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.rtf', '.txt', '.csv', '.html'
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

  const handleConvert = async () => {
    if (!selectedFile) return

    setStatus('loading')
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const startTime = Date.now()
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '변환 실패')
      }

      const blob = await response.blob()
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
          DOCX, XLSX, PPTX, CSV, ODT, RTF, TXT, HTML (최대 50MB)
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
        <div className="status loading">
          <span className="spinner" />
          파일을 변환하고 있습니다. 잠시만 기다려주세요...
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
