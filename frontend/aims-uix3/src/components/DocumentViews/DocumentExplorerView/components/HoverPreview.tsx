/**
 * HoverPreview
 * @description 문서 호버 시 썸네일 프리뷰를 표시하는 컴포넌트
 *
 * 핵심 최적화:
 * 1. 모듈 레벨 이미지 캐시 - 한 번 로드된 이미지 URL 기억
 * 2. 캐시된 이미지는 로딩 스피너 없이 즉시 표시
 * 3. React.memo로 불필요한 리렌더링 방지
 */

import React, { useState, useEffect, useRef, memo } from 'react'
import type { Document } from '@/types/documentStatus'
import { DocumentStatusService } from '@/services/DocumentStatusService'

// 딜레이 없이 즉시 표시
const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = 283 // A4 비율 (200 * 1.414)
const PDF_PROXY_BASE = '/pdf-proxy' // Vite proxy를 통해 접근

// ★ 모듈 레벨 이미지 캐시 - 컴포넌트가 언마운트되어도 유지됨
const loadedImageCache = new Set<string>()

// 파일 확장자별 아이콘 매핑
const FILE_TYPE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  xlsx: { icon: '📊', color: '#217346', label: 'Excel' },
  xls: { icon: '📊', color: '#217346', label: 'Excel' },
  docx: { icon: '📄', color: '#2B579A', label: 'Word' },
  doc: { icon: '📄', color: '#2B579A', label: 'Word' },
  pptx: { icon: '📽️', color: '#D24726', label: 'PowerPoint' },
  ppt: { icon: '📽️', color: '#D24726', label: 'PowerPoint' },
  hwp: { icon: '📝', color: '#0085CA', label: '한글' },
  hwpx: { icon: '📝', color: '#0085CA', label: '한글' },
  txt: { icon: '📃', color: '#666666', label: 'Text' },
  csv: { icon: '📋', color: '#217346', label: 'CSV' },
  zip: { icon: '🗜️', color: '#FFB900', label: 'ZIP' },
  rar: { icon: '🗜️', color: '#FFB900', label: 'RAR' },
}

export interface HoverPreviewProps {
  document: Document | null
  position: { x: number; y: number } | null
}

// 지원하는 이미지 MIME 타입
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff']

/**
 * 파일명에서 확장자 추출
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  if (parts.length < 2) return ''
  return parts[parts.length - 1].toLowerCase()
}

/**
 * 파일 타입 아이콘 정보 가져오기
 */
function getFileTypeIcon(doc: Document): { icon: string; color: string; label: string } | null {
  const filename = DocumentStatusService.extractFilename(doc)
  const ext = getFileExtension(filename)
  return FILE_TYPE_ICONS[ext] || null
}

/**
 * 문서에서 썸네일 API용 파일 경로 추출
 * - PDF 파일: destPath 사용
 * - 이미지 파일: destPath 직접 사용
 * - 기타 파일: convPdfPath 사용 (변환된 PDF)
 */
function getThumbnailPath(doc: Document): string | null {
  // upload이 string인 경우 JSON 파싱 시도
  let uploadData = doc.upload
  if (typeof uploadData === 'string') {
    try {
      uploadData = JSON.parse(uploadData) as typeof doc.upload
    } catch {
      return null
    }
  }
  if (!uploadData || typeof uploadData === 'string') {
    return null
  }

  const destPath = uploadData.destPath
  const convPdfPath = uploadData.convPdfPath
  const mimeType = doc.mimeType || uploadData.mimeType || ''

  // PDF 파일인 경우 직접 destPath 사용
  if (mimeType.includes('pdf') && destPath) {
    // /data/files/ 접두어 제거
    return destPath.replace(/^\/data\/files\//, '')
  }

  // 이미지 파일인 경우 직접 destPath 사용
  if (IMAGE_MIME_TYPES.some(type => mimeType.includes(type)) && destPath) {
    return destPath.replace(/^\/data\/files\//, '')
  }

  // 변환된 PDF가 있는 경우
  if (convPdfPath) {
    return convPdfPath.replace(/^\/data\/files\//, '')
  }

  // 지원하지 않는 파일 타입
  return null
}

/**
 * 화면 경계를 고려한 위치 계산
 * 썸네일을 마우스 오른쪽 옆에 표시 (수직 중앙 정렬)
 */
function calculatePosition(mouseX: number, mouseY: number): { x: number; y: number } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const gap = 12 // 마우스와 썸네일 사이 간격

  // 기본: 마우스 오른쪽, 수직 중앙 정렬
  let x = mouseX + gap
  let y = mouseY - THUMBNAIL_HEIGHT / 2

  // 오른쪽으로 넘어가면 왼쪽에 표시
  if (x + THUMBNAIL_WIDTH > viewportWidth - 10) {
    x = mouseX - THUMBNAIL_WIDTH - gap
  }

  // 아래로 넘어가면 위로 조정
  if (y + THUMBNAIL_HEIGHT > viewportHeight - 10) {
    y = viewportHeight - THUMBNAIL_HEIGHT - 10
  }

  // 위로 넘어가면 아래로 조정
  if (y < 10) {
    y = 10
  }

  // 왼쪽으로 넘어가면 오른쪽으로 조정
  if (x < 10) {
    x = 10
  }

  return { x, y }
}

/**
 * HoverPreview 컴포넌트 (memo로 최적화)
 */
const HoverPreviewComponent: React.FC<HoverPreviewProps> = ({
  document,
  position,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const prevDocIdRef = useRef<string | null>(null)

  // 썸네일 경로 계산
  const thumbnailPath = document ? getThumbnailPath(document) : null
  const thumbnailUrl = thumbnailPath
    ? `${PDF_PROXY_BASE}/thumbnail/${thumbnailPath}?width=${THUMBNAIL_WIDTH}`
    : null

  // ★ 캐시 확인 - 이미 로드된 이미지는 즉시 표시
  const isImageCached = thumbnailUrl ? loadedImageCache.has(thumbnailUrl) : false

  // 파일 타입 아이콘 (썸네일 없을 때 fallback)
  const fileTypeIcon = document ? getFileTypeIcon(document) : null

  // 현재 문서 ID
  const docId = document?._id || document?.id || null

  // 문서 변경 시 이미지 상태 리셋 (캐시된 이미지는 즉시 로드됨으로 표시)
  useEffect(() => {
    if (prevDocIdRef.current !== docId) {
      // ★ 캐시된 이미지는 즉시 로드 완료 상태로 설정
      if (thumbnailUrl && loadedImageCache.has(thumbnailUrl)) {
        setImageLoaded(true)
        setImageError(false)
      } else {
        setImageLoaded(false)
        setImageError(false)
      }
      prevDocIdRef.current = docId
    }
  }, [docId, thumbnailUrl])

  // 이미지 로드 완료 핸들러
  const handleImageLoad = () => {
    setImageLoaded(true)
    // ★ 캐시에 URL 추가
    if (thumbnailUrl) {
      loadedImageCache.add(thumbnailUrl)
    }
  }

  // 이미지 로드 에러 핸들러
  const handleImageError = () => {
    setImageError(true)
    setImageLoaded(false)
  }

  // 표시 조건: document + position 있고, 썸네일이나 아이콘 있어야 함
  if (!document || !position || (!thumbnailUrl && !fileTypeIcon)) {
    return null
  }

  // 마우스 위치 기반으로 실시간 계산
  const displayPosition = calculatePosition(position.x, position.y)

  // 파일 타입 아이콘 fallback (썸네일 없을 때)
  if (!thumbnailUrl && fileTypeIcon) {
    return (
      <div
        className="hover-preview hover-preview--icon"
        style={{
          position: 'fixed',
          left: displayPosition.x,
          top: displayPosition.y,
          zIndex: 10000,
        }}
      >
        <div
          className="hover-preview__file-icon"
          style={{ backgroundColor: fileTypeIcon.color }}
        >
          <span className="hover-preview__file-icon-emoji">{fileTypeIcon.icon}</span>
          <span className="hover-preview__file-icon-label">{fileTypeIcon.label}</span>
          <span className="hover-preview__file-icon-name">
            {document ? DocumentStatusService.extractFilename(document) : ''}
          </span>
        </div>
      </div>
    )
  }

  // ★ 캐시된 이미지이거나 이미 로드된 경우: 로딩 스피너 없이 즉시 표시
  const showSpinner = !isImageCached && !imageLoaded && !imageError

  return (
    <div
      className="hover-preview"
      style={{
        position: 'fixed',
        left: displayPosition.x,
        top: displayPosition.y,
        zIndex: 10000,
      }}
    >
      <div className="hover-preview__content">
        {showSpinner && (
          <div className="hover-preview__loading">
            <span className="hover-preview__spinner" />
          </div>
        )}
        {imageError && (
          <div className="hover-preview__error">
            미리보기를 불러올 수 없습니다
          </div>
        )}
        <img
          src={thumbnailUrl!}
          alt="문서 미리보기"
          className={`hover-preview__image ${(imageLoaded || isImageCached) ? 'hover-preview__image--loaded' : ''}`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
    </div>
  )
}

// React.memo로 최적화 - props가 변경되지 않으면 리렌더링 안함
export const HoverPreview = memo(HoverPreviewComponent, (prevProps, nextProps) => {
  // document ID와 position이 같으면 리렌더링 안함
  const prevDocId = prevProps.document?._id || prevProps.document?.id
  const nextDocId = nextProps.document?._id || nextProps.document?.id

  if (prevDocId !== nextDocId) return false
  if (!prevProps.position && !nextProps.position) return true
  if (!prevProps.position || !nextProps.position) return false

  // 위치 변화가 10px 미만이면 리렌더링 안함 (성능 최적화)
  const dx = Math.abs(prevProps.position.x - nextProps.position.x)
  const dy = Math.abs(prevProps.position.y - nextProps.position.y)
  return dx < 10 && dy < 10
})

export default HoverPreview
