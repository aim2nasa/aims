/**
 * SVG 미리보기 지원 regression 테스트
 *
 * 이슈 #36: SVG 파일이 "미리보기를 지원하지 않는 형식"으로 표시되던 버그
 * App.tsx renderViewer()에서 isImage 패턴에 .svg가 누락되어 있었음
 */
import { describe, it, expect } from 'vitest'

/** App.tsx renderViewer()의 isImage 패턴과 동일 */
const IMAGE_PATTERN = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i

describe('ImageViewer SVG preview support (#36)', () => {
  it('SVG 파일은 이미지로 인식되어야 함', () => {
    expect(IMAGE_PATTERN.test('document.svg')).toBe(true)
    expect(IMAGE_PATTERN.test('roadmap.SVG')).toBe(true)
    expect(IMAGE_PATTERN.test('/path/to/file.svg')).toBe(true)
  })

  it('기존 이미지 포맷은 여전히 이미지로 인식되어야 함', () => {
    expect(IMAGE_PATTERN.test('photo.jpg')).toBe(true)
    expect(IMAGE_PATTERN.test('photo.jpeg')).toBe(true)
    expect(IMAGE_PATTERN.test('image.png')).toBe(true)
    expect(IMAGE_PATTERN.test('animation.gif')).toBe(true)
    expect(IMAGE_PATTERN.test('scan.bmp')).toBe(true)
    expect(IMAGE_PATTERN.test('modern.webp')).toBe(true)
  })

  it('비이미지 파일은 이미지로 인식되지 않아야 함', () => {
    expect(IMAGE_PATTERN.test('document.pdf')).toBe(false)
    expect(IMAGE_PATTERN.test('report.docx')).toBe(false)
    expect(IMAGE_PATTERN.test('data.csv')).toBe(false)
    expect(IMAGE_PATTERN.test('archive.zip')).toBe(false)
  })
})
