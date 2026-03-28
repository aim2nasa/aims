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
import { createPortal } from 'react-dom'
import type { Document } from '@/types/documentStatus'
import { DocumentStatusService } from '@/services/DocumentStatusService'

// 썸네일 크기 설정
const A4_RATIO = 1.414
const MIN_THUMBNAIL_WIDTH = 140
const MAX_THUMBNAIL_WIDTH = 300
const THUMBNAIL_REQUEST_WIDTH = 300 // API 요청 시 고정 해상도 (최대 크기로 요청 후 CSS로 축소)
const REGION_PADDING = 16 // 영역 양쪽 여백
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
  rightPaneVisible?: boolean
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

// 이미지 확장자 목록 (mimeType 누락 시 fallback용)
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif']

/**
 * 문서에서 썸네일 API용 파일 경로 추출
 * - PDF 파일: destPath 사용
 * - 이미지 파일: destPath 직접 사용
 * - 기타 파일: convPdfPath 사용 (변환된 PDF)
 * - mimeType 누락 시 파일 확장자로 판단 (fallback)
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

  // 파일 확장자 추출 (mimeType 누락 시 fallback용)
  const fileExt = destPath ? destPath.split('.').pop()?.toLowerCase() : ''

  // PDF 파일인 경우 직접 destPath 사용 (mimeType 또는 확장자로 판단)
  if ((mimeType.includes('pdf') || fileExt === 'pdf') && destPath) {
    // /data/files/ 접두어 제거
    return destPath.replace(/^\/data\/files\//, '')
  }

  // 이미지 파일인 경우 직접 destPath 사용 (mimeType 또는 확장자로 판단)
  const isImageByMime = IMAGE_MIME_TYPES.some(type => mimeType.includes(type))
  const isImageByExt = fileExt ? IMAGE_EXTENSIONS.includes(fileExt) : false
  if ((isImageByMime || isImageByExt) && destPath) {
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
 * 가용 영역 기반 레이아웃 계산
 * - 영역: 화면 중앙 ~ ext 컬럼 직전
 * - 썸네일 크기: 영역 너비에 비례 (min~max 제한, A4 비율 유지)
 * - Y: 마우스 위치를 따라 상하 이동
 */
function calculateLayout(_mouseX: number, mouseY: number): { x: number; y: number; width: number; height: number } {
  const viewportHeight = window.innerHeight
  const viewportCenter = window.innerWidth / 2

  // ext 컬럼의 왼쪽 가장자리를 찾아 우측 경계로 사용
  const extElement = globalThis.document.querySelector('.doc-explorer-tree__doc-ext')
  const rightBound = extElement
    ? extElement.getBoundingClientRect().left - 8
    : viewportCenter + MAX_THUMBNAIL_WIDTH + REGION_PADDING * 2

  // 가용 영역 너비에서 양쪽 패딩을 뺀 실제 사용 가능 너비
  const regionWidth = rightBound - viewportCenter
  const availableWidth = regionWidth - REGION_PADDING * 2

  // 썸네일 너비: 가용 공간에 비례, min/max 제한
  const width = Math.max(MIN_THUMBNAIL_WIDTH, Math.min(MAX_THUMBNAIL_WIDTH, availableWidth))
  const height = Math.round(width * A4_RATIO)

  // X: 영역 내에서 중앙 정렬
  const x = viewportCenter + (regionWidth - width) / 2

  // Y: 마우스 위치 기준 수직 중앙 정렬
  let y = mouseY - height / 2

  if (y + height > viewportHeight - 10) {
    y = viewportHeight - height - 10
  }
  if (y < 10) {
    y = 10
  }

  return { x, y, width, height }
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
  const imgRef = useRef<HTMLImageElement>(null)

  // 썸네일 경로 계산
  const thumbnailPath = document ? getThumbnailPath(document) : null
  const thumbnailUrl = thumbnailPath
    ? `${PDF_PROXY_BASE}/thumbnail/${thumbnailPath}?width=${THUMBNAIL_REQUEST_WIDTH}`
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

  // ★ 콜백 ref: 이미지 요소가 마운트될 때 브라우저 캐시 즉시 감지
  const imgRefCallback = (img: HTMLImageElement | null) => {
    imgRef.current = img
    // 이미지가 마운트되고, 아직 로드 상태가 아닐 때만 체크
    if (img && thumbnailUrl && !imageLoaded && !imageError) {
      // 브라우저에 캐시된 이미지는 complete가 즉시 true
      if (img.complete && img.naturalWidth > 0) {
        setImageLoaded(true)
        loadedImageCache.add(thumbnailUrl)
      }
    }
  }

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

  // 마우스 위치 기반으로 실시간 계산 (위치 + 동적 크기)
  const layout = calculateLayout(position.x, position.y)

  // RightPane과 겹침 판단: RP가 열려 있으면 RP 영역과 썸네일 영역 비교
  const rpElement = globalThis.document.querySelector('[role="complementary"]')
  if (rpElement) {
    const rpRect = rpElement.getBoundingClientRect()
    const thumbnailRight = layout.x + layout.width
    // 썸네일 오른쪽 끝이 RP 왼쪽 시작보다 오른쪽이면 겹침
    if (thumbnailRight > rpRect.left) {
      return null
    }
  }

  // ★ 캐시된 이미지이거나 이미 로드된 경우: 로딩 스피너 없이 즉시 표시
  const showSpinner = !isImageCached && !imageLoaded && !imageError

  // Portal로 body에 직접 렌더링하여 부모 컴포넌트의 overflow 영향을 받지 않음
  const previewContent = !thumbnailUrl && fileTypeIcon ? (
    // 파일 타입 아이콘 fallback (썸네일 없을 때)
    <div
      className="hover-preview hover-preview--icon"
      style={{
        position: 'fixed',
        left: layout.x,
        top: layout.y,
        zIndex: 10000,
      }}
    >
      <div
        className="hover-preview__file-icon"
        style={{ backgroundColor: fileTypeIcon.color, width: layout.width, height: layout.width * 0.6 }}
      >
        <span className="hover-preview__file-icon-emoji">{fileTypeIcon.icon}</span>
        <span className="hover-preview__file-icon-label">{fileTypeIcon.label}</span>
        <span className="hover-preview__file-icon-name">
          {document ? DocumentStatusService.extractFilename(document) : ''}
        </span>
      </div>
    </div>
  ) : (
    // 썸네일 이미지
    <div
      className="hover-preview"
      style={{
        position: 'fixed',
        left: layout.x,
        top: layout.y,
        zIndex: 10000,
      }}
    >
      <div className="hover-preview__content" style={{ minWidth: layout.width, minHeight: layout.width * 0.7 }}>
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
          ref={imgRefCallback}
          src={thumbnailUrl!}
          alt="문서 미리보기"
          className={`hover-preview__image ${(imageLoaded || isImageCached) ? 'hover-preview__image--loaded' : ''}`}
          style={{ maxWidth: layout.width, maxHeight: layout.height }}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
    </div>
  )

  // createPortal로 body에 직접 렌더링 (CenterPane overflow 무시)
  return createPortal(previewContent, globalThis.document.body)
}

// React.memo로 최적화 - props가 변경되지 않으면 리렌더링 안함
export const HoverPreview = memo(HoverPreviewComponent, (prevProps, nextProps) => {
  // RightPane 상태 변경 시 반드시 리렌더링 (겹침 판단 재평가)
  if (prevProps.rightPaneVisible !== nextProps.rightPaneVisible) return false

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
