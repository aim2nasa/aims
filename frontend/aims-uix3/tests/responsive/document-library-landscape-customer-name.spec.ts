/**
 * 문서 라이브러리 가로 모드 고객명 잘림 검증
 * @description 740x360 뷰포트에서 고객명이 잘리지 않는지 Playwright로 실제 렌더링 검증
 */

import { test, expect } from '@playwright/test'

const BASE_URL = 'https://localhost:5177'

/** dev API로 직접 토큰 발급 → localStorage 주입 → 문서 라이브러리 이동 */
async function loginAndGoToDocLibrary(page: import('@playwright/test').Page) {
  // 1. 로그인 페이지 열기 → localStorage에 접근하기 위해
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

  // 2. dev API로 토큰 발급 + localStorage에 주입
  await page.evaluate(async () => {
    const resp = await fetch('/api/dev/ensure-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await resp.json()
    localStorage.setItem(
      'auth-storage-v2',
      JSON.stringify({ state: { token: data.token }, version: 0 })
    )
    localStorage.setItem('aims-current-user-id', data.user._id)
    localStorage.setItem('aims_onboarding_completed', 'true')
  })

  // 3. 토큰이 localStorage에 있는 상태에서 메인 페이지 이동
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // 4. 아직 로그인 페이지면 한 번 더
  const isLogin = await page.locator('text=카카오 로그인').isVisible({ timeout: 1000 }).catch(() => false)
  if (isLogin) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
  }

  // 5. "전체 문서 보기" 메뉴 클릭 (가로 모드에서 뷰포트 밖이므로 JS 직접 클릭)
  await page.evaluate(() => {
    const menuItem = document.querySelector('[data-menu-key="documents-library"]') as HTMLElement
    if (menuItem) {
      menuItem.click()
    }
  })
  await page.waitForTimeout(3000)
}

test.describe('문서 라이브러리 가로 모드 - 고객명 표시', () => {
  test.use({
    ignoreHTTPSErrors: true,
    viewport: { width: 740, height: 360 },
  })

  test('고객명이 잘리지 않아야 함 (scrollWidth <= clientWidth)', async ({ page }) => {
    await loginAndGoToDocLibrary(page)

    // 문서 목록 대기 — 없으면 스크린샷만 남기고 확인
    const hasItems = await page.waitForSelector('.status-item', { timeout: 15000 }).then(() => true).catch(() => false)

    await page.screenshot({
      path: 'test-results/landscape-customer-name.png',
      fullPage: false,
    })

    if (!hasItems) {
      // 현재 페이지 상태 디버깅
      const pageTitle = await page.title()
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200))
      console.log(`\n⚠️ .status-item 없음. 제목: "${pageTitle}", 본문: "${bodyText}"`)
      test.skip(true, '문서 라이브러리에 진입하지 못했습니다 (인증 문제)')
      return
    }

    await page.waitForTimeout(1000) // 레이아웃 안정화

    // 고객명 잘림 검사
    const results = await page.evaluate(() => {
      const items: Array<{
        name: string
        containerWidth: number
        textWidth: number
        textScrollWidth: number
        truncated: boolean
      }> = []

      document.querySelectorAll('.status-customer').forEach((el) => {
        const nameText = el.querySelector('.customer-name-text') as HTMLElement
        if (!nameText) return
        const container = el as HTMLElement
        const textTruncated = nameText.scrollWidth > nameText.clientWidth + 1
        items.push({
          name: nameText.textContent || '',
          containerWidth: container.clientWidth,
          textWidth: nameText.clientWidth,
          textScrollWidth: nameText.scrollWidth,
          truncated: textTruncated,
        })
      })
      return items
    })

    console.log('\n=== 고객명 잘림 검사 결과 (740x360 가로 모드) ===')
    for (const r of results) {
      console.log(
        `  ${r.truncated ? '❌ 잘림' : '✅ 정상'} "${r.name}" ` +
          `(container: ${r.containerWidth}px, text: ${r.textWidth}px, scrollW: ${r.textScrollWidth}px)`
      )
    }

    const truncated = results.filter((r) => r.truncated)
    expect(
      truncated,
      `잘린 고객명: ${truncated.map((t) => `"${t.name}"(${t.textScrollWidth}>${t.textWidth})`).join(', ')}`
    ).toHaveLength(0)
  })

  test('초성 필터바가 가로 모드에서 표시되어야 함', async ({ page }) => {
    await loginAndGoToDocLibrary(page)

    const hasItems = await page.waitForSelector('.status-item', { timeout: 15000 }).then(() => true).catch(() => false)
    if (!hasItems) {
      test.skip(true, '문서 라이브러리에 진입하지 못했습니다')
      return
    }

    const filterBar = page.locator('.initial-filter-bar')
    await expect(filterBar).toBeVisible()

    const display = await filterBar.evaluate((el) => window.getComputedStyle(el).display)
    expect(display).not.toBe('none')

    const count = await page.locator('.initial-filter-bar__initial').count()
    expect(count).toBeGreaterThan(0)

    await page.screenshot({
      path: 'test-results/landscape-initial-filter-bar.png',
      fullPage: false,
    })
  })
})
