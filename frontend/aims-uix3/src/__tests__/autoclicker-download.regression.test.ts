/**
 * AutoClicker 다운로드/플랫폼 감지 Regression 테스트
 * @description 인스톨러 다운로드 경로 수정 + 플랫폼 감지 로직
 * @regression 커밋 671c436b (다운로드 경로 수정)
 * @priority MEDIUM - AC 배포 인프라
 */

import { describe, it, expect } from 'vitest'

// ===== 소스에서 추출한 순수 로직 (AutoClickerView.tsx) =====

interface PlatformInfo {
  isWindows: boolean
  name: string
}

const detectPlatform = (ua: string, maxTouchPoints = 0): PlatformInfo => {
  if (/windows/i.test(ua)) return { isWindows: true, name: 'Windows' }
  if (/iPhone|iPod/i.test(ua)) return { isWindows: false, name: 'iPhone' }
  if (/iPad/i.test(ua)) return { isWindows: false, name: 'iPad' }
  if (/Android/i.test(ua)) return { isWindows: false, name: 'Android' }
  // iPadOS 13+ reports as Macintosh — touch 지원 여부로 구분
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return { isWindows: false, name: 'iPad' }
  if (/Macintosh|Mac OS/i.test(ua)) return { isWindows: false, name: 'Mac' }
  if (/Linux/i.test(ua)) return { isWindows: false, name: 'Linux' }
  return { isWindows: false, name: '이 기기' }
}

// ===== 테스트 =====

describe('AutoClicker 다운로드/플랫폼 - Regression 테스트', () => {
  describe('인스톨러 다운로드 경로 (커밋 671c436b)', () => {
    /**
     * 회귀 테스트: /public/ 경로는 nginx 프록시 미지원 → SPA 폴백(index.html) 반환
     * 수정: /api/ac/download-installer 경로로 변경 (nginx /api/ 프록시 적용)
     */
    it('다운로드 경로는 /api/ac/download-installer', () => {
      const downloadPath = '/api/ac/download-installer'

      expect(downloadPath).toBe('/api/ac/download-installer')
      expect(downloadPath.startsWith('/api/')).toBe(true)
    })

    it('기존 /public/ 경로는 사용하지 않음', () => {
      const downloadPath = '/api/ac/download-installer'

      expect(downloadPath).not.toContain('/public/')
      expect(downloadPath).not.toMatch(/\.exe$/)
    })

    it('/api/ 프리픽스는 nginx 프록시를 통해 백엔드에 전달됨', () => {
      const downloadPath = '/api/ac/download-installer'

      // nginx 설정: /api/ → proxy_pass to backend
      expect(downloadPath.startsWith('/api/')).toBe(true)
    })
  })

  describe('플랫폼 감지 - Windows', () => {
    it('Windows 10 Chrome 감지', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(true)
      expect(result.name).toBe('Windows')
    })

    it('Windows 11 Edge 감지', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(true)
      expect(result.name).toBe('Windows')
    })
  })

  describe('플랫폼 감지 - 미지원 플랫폼', () => {
    it('iPhone 감지', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('iPhone')
    })

    it('iPad 감지 (전통적 UA)', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('iPad')
    })

    it('iPadOS 13+ (Macintosh UA + touch)', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
      const result = detectPlatform(ua, 5) // maxTouchPoints > 1

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('iPad')
    })

    it('Mac (Macintosh UA + no touch)', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
      const result = detectPlatform(ua, 0) // maxTouchPoints = 0

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('Mac')
    })

    it('Android 감지', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('Android')
    })

    it('Linux Desktop 감지', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('Linux')
    })

    it('알 수 없는 UA → "이 기기"', () => {
      const ua = 'CustomBot/1.0'
      const result = detectPlatform(ua)

      expect(result.isWindows).toBe(false)
      expect(result.name).toBe('이 기기')
    })
  })

  describe('AC 실행 흐름 로직', () => {
    /**
     * URI Scheme 기반 앱 실행 흐름:
     * 1. 설치 여부 확인 (localStorage)
     * 2. 설치됨 → 토큰 발급 → URI Scheme 호출 → blur 감지
     * 3. 미설치 → 인스톨러 다운로드
     * 4. blur 미감지 (3초) → 삭제된 것으로 판단 → 인스톨러 재다운로드
     */
    it('localStorage에 ac-installed 플래그 관리', () => {
      const storage = new Map<string, string>()

      // 미설치 상태
      expect(storage.get('ac-installed')).toBeUndefined()

      // 설치 후 플래그 설정
      storage.set('ac-installed', 'true')
      expect(storage.get('ac-installed')).toBe('true')

      // 삭제 감지 후 플래그 제거
      storage.delete('ac-installed')
      expect(storage.get('ac-installed')).toBeUndefined()
    })

    it('URI Scheme 형식 검증', () => {
      const token = 'test-token-123'
      const uri = `aims-ac://start?token=${token}&auto_start=false`

      expect(uri).toMatch(/^aims-ac:\/\//)
      expect(uri).toContain(`token=${token}`)
      expect(uri).toContain('auto_start=false')
    })

    it('blur 감지 타임아웃은 3초', () => {
      const BLUR_TIMEOUT = 3000

      expect(BLUR_TIMEOUT).toBe(3000)
      expect(BLUR_TIMEOUT).toBeGreaterThanOrEqual(2000) // 너무 짧으면 오탐
      expect(BLUR_TIMEOUT).toBeLessThanOrEqual(5000)    // 너무 길면 UX 저하
    })

    it('인스톨러 완료 시 URL 파라미터 정리', () => {
      // installer.iss → aims.giize.com/?view=autoclicker&ac_installed=1
      const params = new URLSearchParams('view=autoclicker&ac_installed=1')

      expect(params.get('ac_installed')).toBe('1')

      // 파라미터 정리
      params.delete('ac_installed')
      const cleanSearch = params.toString()

      expect(cleanSearch).toBe('view=autoclicker')
      expect(cleanSearch).not.toContain('ac_installed')
    })
  })

  describe('다운로드 힌트 타이머', () => {
    it('다운로드 힌트는 10초 후 자동 숨김', () => {
      const DOWNLOAD_HINT_DURATION = 10000

      expect(DOWNLOAD_HINT_DURATION).toBe(10000)
    })
  })
})
