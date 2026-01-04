/**
 * HoverPreview
 * @description 문서 호버 시 썸네일 프리뷰를 표시하는 컴포넌트
 */

import React, { useState, useEffect, useRef } from 'react'
import type { Document } from '@/types/documentStatus'

const HOVER_DELAY = 300 // 호버 후 프리뷰 표시까지 딜레이 (ms)
const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = 283 // A4 비율 (200 * 1.414)
const PDF_PROXY_BASE = '/pdf-proxy' // Vite proxy를 통해 접근

export interface HoverPreviewProps {
  document: Document | null
  position: { x: number; y: number } | null
}

// 지원하는 이미지 MIME 타입
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff']

/**
 * 문서에서 썸네일 API용 파일 경로 추출
 * - PDF 파일: destPath 사용
 * - 이미지 파일: destPath 직접 사용
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

export const HoverPreview: React.FC<HoverPreviewProps> = ({
  document,
  position,
}) => {
  const [visible, setVisible] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentDocIdRef = useRef<string | null>(null)

  // 썸네일 경로 계산
  const thumbnailPath = document ? getThumbnailPath(document) : null
  const thumbnailUrl = thumbnailPath
    ? `${PDF_PROXY_BASE}/thumbnail/${thumbnailPath}?width=${THUMBNAIL_WIDTH}`
    : null

  // 현재 문서 ID
  const docId = document?._id || document?.id || null

  // 호버 딜레이 처리
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (document && thumbnailUrl) {
      // 문서가 변경되었으면 이미지 상태 초기화
      if (currentDocIdRef.current !== docId) {
        setImageLoaded(false)
        setImageError(false)
        currentDocIdRef.current = docId
      }

      timerRef.current = setTimeout(() => {
        setVisible(true)
      }, HOVER_DELAY)
    } else {
      setVisible(false)
      currentDocIdRef.current = null
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [document, thumbnailUrl, docId])

  // 표시할 조건 체크
  if (!visible || !thumbnailUrl || !position) {
    return null
  }

  // 마우스 위치 기반으로 실시간 계산
  const displayPosition = calculatePosition(position.x, position.y)

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
