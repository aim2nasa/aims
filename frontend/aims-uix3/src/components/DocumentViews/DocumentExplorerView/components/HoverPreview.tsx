/**
 * HoverPreview
 * @description 문서 호버 시 썸네일 프리뷰를 표시하는 컴포넌트
 */

import React, { useState, useEffect, useRef } from 'react'
import type { Document } from '@/types/documentStatus'

const HOVER_DELAY = 300 // 호버 후 프리뷰 표시까지 딜레이 (ms)
const THUMBNAIL_WIDTH = 200
const PDF_PROXY_BASE = '/pdf-proxy' // Vite proxy를 통해 접근

export interface HoverPreviewProps {
  document: Document | null
  position: { x: number; y: number } | null
  containerRef?: React.RefObject<HTMLElement | null>
}

/**
 * 문서에서 썸네일 API용 PDF 경로 추출
 * - PDF 파일: destPath 사용
 * - 기타 파일: convPdfPath 사용 (변환된 PDF)
 */
function getThumbnailPath(doc: Document): string | null {
  // upload이 string인 경우도 있으므로 체크
  const upload = doc.upload
  if (!upload || typeof upload === 'string') {
    return null
  }

  const destPath = upload.destPath
  const convPdfPath = upload.convPdfPath
  const mimeType = doc.mimeType || upload.mimeType || ''

  // PDF 파일인 경우 직접 destPath 사용
  if (mimeType.includes('pdf') && destPath) {
    // /data/files/ 접두어 제거
    return destPath.replace(/^\/data\/files\//, '')
  }

  // 변환된 PDF가 있는 경우
  if (convPdfPath) {
    return convPdfPath.replace(/^\/data\/files\//, '')
  }

  // PDF가 아니고 변환도 안 된 경우 (이미지 등)
  // 이미지는 별도 처리 필요 - 현재는 null 반환
  return null
}

export const HoverPreview: React.FC<HoverPreviewProps> = ({
  document,
  position,
  containerRef,
}) => {
  const [visible, setVisible] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 썸네일 경로 계산
  const thumbnailPath = document ? getThumbnailPath(document) : null
  const thumbnailUrl = thumbnailPath
    ? `${PDF_PROXY_BASE}/thumbnail/${thumbnailPath}?width=${THUMBNAIL_WIDTH}`
    : null

  // 호버 딜레이 처리
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (document && thumbnailUrl && position) {
      setImageLoaded(false)
      setImageError(false)
      timerRef.current = setTimeout(() => {
        setVisible(true)
      }, HOVER_DELAY)
    } else {
      setVisible(false)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [document, thumbnailUrl, position])

  // 위치 조정 (화면 밖으로 나가지 않도록)
  useEffect(() => {
    if (!visible || !position || !previewRef.current) {
      setAdjustedPosition(null)
      return
    }

    const preview = previewRef.current
    const rect = preview.getBoundingClientRect()
    const containerRect = containerRef?.current?.getBoundingClientRect()

    let x = position.x + 16 // 커서 오른쪽에 표시
    let y = position.y

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // 오른쪽으로 넘어가면 왼쪽에 표시
    if (x + rect.width > viewportWidth - 20) {
      x = position.x - rect.width - 16
    }

    // 아래로 넘어가면 위로 조정
    if (y + rect.height > viewportHeight - 20) {
      y = viewportHeight - rect.height - 20
    }

    // 위로 넘어가면 아래로 조정
    if (y < 20) {
      y = 20
    }

    // 컨테이너 기준 제한 (있는 경우)
    if (containerRect) {
      if (x < containerRect.left) x = containerRect.left
      if (y < containerRect.top) y = containerRect.top
    }

    setAdjustedPosition({ x, y })
  }, [visible, position, containerRef])

  // 표시할 조건 체크
  if (!visible || !thumbnailUrl || !position) {
    return null
  }

  const displayPosition = adjustedPosition || position

  return (
    <div
      ref={previewRef}
      className="hover-preview"
      style={{
        position: 'fixed',
        left: displayPosition.x,
        top: displayPosition.y,
        zIndex: 10000,
      }}
    >
      <div className="hover-preview__content">
        {!imageLoaded && !imageError && (
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
          src={thumbnailUrl}
          alt="문서 미리보기"
          className={`hover-preview__image ${imageLoaded ? 'hover-preview__image--loaded' : ''}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true)
            setImageLoaded(false)
          }}
        />
      </div>
    </div>
  )
}

export default HoverPreview
