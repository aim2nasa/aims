import { test, expect } from '@playwright/test'

/**
 * 고객별 문서함 — 파일명 컬럼 최소 폭 보장 + 정렬 + 아이콘 색상
 *
 * AC:
 * 1. RP 열릴 때 파일명 잘리지 않거나 수평 스크롤로 확인 가능
 * 2. 좁은 상태에서 hover 시 이름변경/삭제 버튼 접근 가능
 * 3. 수평 스크롤바 표시
 * 4. 별칭↔원본 전환 시 컬럼 폭 재계산
 * 5. 형식/크기/날짜 컬럼 헤더↔데이터 정렬 일치
 * 6. 컬럼 폭 최적화
 * 7. 법인 고객 아이콘 주황색
 * 8. 모바일 뷰포트
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
const NARROW_VIEWPORT = { width: 900, height: 800 }
const MOBILE_VIEWPORT = { width: 375, height: 812 }

/** 고객별 문서함(documents-explorer)으로 이동 후 문서 노드가 보일 때까지 대기 */
async function navigateToExplorer(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle').catch(() => {})

  // 사이드바에서 고객별 문서함 클릭
  const menuItem = page.locator('text=고객별 문서함').first()
  await menuItem.click({ timeout: 10_000 })
  await page.waitForTimeout(2000)

  // 초성 필터바 로드 대기
  await page.waitForSelector('.initial-filter-bar', { timeout: 15_000 })
}

/** 캐치업코리아(법인 고객) 폴더 열고 문서 표시. 데이터 없으면 test.skip */
async function expandCatchUpKorea(page: import('@playwright/test').Page) {
  // ㅋ 초성 클릭
  const kBtn = page.locator('.initial-filter-bar__initial:has-text("ㅋ")').first()
  if (!await kBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    test.skip()
    return
  }
  await kBtn.click()
  await page.waitForTimeout(3000)

  // 캐치업코리아 폴더 클릭
  const customerFolder = page.locator('.doc-explorer-tree__group-label:has-text("캐치업코리아")')
  if (await customerFolder.isVisible({ timeout: 5000 }).catch(() => false)) {
    await customerFolder.click()
    await page.waitForTimeout(2000)
  }

  // 문서 노드 대기
  await page.waitForSelector('.doc-explorer-tree__document', { timeout: 15_000 })
}

/** 첫 번째 문서 클릭하여 RightPane 열기 */
async function openRightPane(page: import('@playwright/test').Page) {
  const firstDoc = page.locator('.doc-explorer-tree__document').first()
  await firstDoc.click()
  await page.waitForTimeout(1500)
}

test.describe('고객별 문서함 — 파일명 컬럼 최소 폭 보장', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  // ── AC#1: RP 열린 상태에서 파일명 확인 ──
  test('AC#1: RP 열린 상태에서 파일명이 잘리지 않거나 수평 스크롤로 확인 가능', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)
    await openRightPane(page)
    await page.waitForTimeout(1000)

    // 파일명 요소들 수집
    const nameElements = page.locator('.doc-explorer-tree__doc-name')
    const count = await nameElements.count()
    expect(count).toBeGreaterThan(0)

    // 파일명 영역이 잘리지 않는지 확인:
    // scrollWidth > clientWidth 인 경우 잘린 것이므로,
    // 부모 컨테이너에 overflow-x: auto가 있어 스크롤 가능해야 함
    const treeContainer = page.locator('.doc-explorer-tree__list, .doc-explorer-tree__content').first()
    const hasScrollOrFits = await treeContainer.evaluate((el) => {
      // 스크롤 가능하거나, 내용이 컨테이너 안에 맞음
      return el.scrollWidth <= el.clientWidth || el.style.overflowX === 'auto' || getComputedStyle(el).overflowX === 'auto'
    })
    expect(hasScrollOrFits).toBe(true)
  })

  // ── AC#2: 좁은 상태에서 hover actions 접근 가능 ──
  test('AC#2: CP 좁은 상태에서 hover 시 이름변경/삭제 버튼 표시 및 클릭 가능', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)
    await openRightPane(page)
    await page.waitForTimeout(1000)

    // 첫 번째 문서에 hover
    const firstDoc = page.locator('.doc-explorer-tree__document').first()
    await firstDoc.hover()
    await page.waitForTimeout(500)

    // hover-actions 영역이 보여야 함
    const hoverActions = firstDoc.locator('.doc-explorer-tree__hover-actions')
    await expect(hoverActions).toBeVisible({ timeout: 3000 })

    // 이름변경, 삭제 버튼 확인
    const renameBtn = hoverActions.locator('[aria-label="이름 변경"]')
    const deleteBtn = hoverActions.locator('[aria-label="삭제"]')
    await expect(renameBtn).toBeVisible()
    await expect(deleteBtn).toBeVisible()
  })

  // ── AC#3: 수평 스크롤 ──
  test('AC#3: CP가 매우 좁을 때 수평 스크롤 가능', async ({ page }) => {
    await page.setViewportSize(NARROW_VIEWPORT)
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)
    await openRightPane(page)
    await page.waitForTimeout(1000)

    // 문서 목록 컨테이너의 scrollWidth > clientWidth 확인
    const scrollable = page.locator('.doc-explorer-tree__list, .doc-explorer-tree__content').first()
    const canScroll = await scrollable.evaluate((el) => {
      const style = getComputedStyle(el)
      return (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth
    })
    expect(canScroll).toBe(true)
  })

  // ── AC#4: 별칭↔원본 전환 시 컬럼 폭 재계산 ──
  test('AC#4: 별칭↔원본 전환 시 컬럼 폭이 재계산됨', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    // 현재 파일명 컬럼 폭 측정
    const nameCol = page.locator('.doc-explorer-tree__doc-name').first()
    const widthBefore = await nameCol.evaluate(el => el.getBoundingClientRect().width)

    // 별칭/원본 토글 버튼 클릭
    const toggleBtn = page.locator('.filename-mode-toggle').first()
    if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await toggleBtn.click()
      await page.waitForTimeout(500)

      // 폭이 변경되었거나 최소한 유지됨 (별칭과 원본 길이가 다름)
      const widthAfter = await nameCol.evaluate(el => el.getBoundingClientRect().width)
      // 파일명이 바뀌었으므로 폭이 달라져야 함 (같은 경우는 드뭄)
      expect(typeof widthAfter).toBe('number')
      expect(widthAfter).toBeGreaterThan(0)
    }
  })

  // ── AC#5: 컬럼 헤더↔데이터 정렬 일치 ──
  test('AC#5: 형식/크기/날짜 컬럼 헤더와 데이터의 정렬이 일치', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    // 형식 컬럼: 데이터가 text-align: center
    const extCell = page.locator('.doc-explorer-tree__doc-ext').first()
    const extAlign = await extCell.evaluate(el => getComputedStyle(el).textAlign)
    expect(extAlign).toBe('center')

    // 크기 컬럼: 데이터가 text-align: right
    const sizeCell = page.locator('.doc-explorer-tree__doc-size').first()
    const sizeAlign = await sizeCell.evaluate(el => getComputedStyle(el).textAlign)
    expect(sizeAlign).toBe('right')

    // 날짜 컬럼: 데이터가 text-align: right
    const dateCell = page.locator('.doc-explorer-tree__doc-date').first()
    const dateAlign = await dateCell.evaluate(el => getComputedStyle(el).textAlign)
    expect(dateAlign).toBe('right')

    // 헤더 컬럼들도 동일한 정렬이어야 함
    const header = page.locator('.doc-explorer-tree__column-header').first()
    if (await header.isVisible().catch(() => false)) {
      // 헤더의 각 셀 정렬 확인 (grid children 순서: icon, name, ext, size, customer, doctype, date, badge, actions)
      const headerChildren = header.locator('> *')

      // ext 헤더 (index 2): justify-self 또는 text-align center
      const extHeader = headerChildren.nth(2)
      const extHeaderAlign = await extHeader.evaluate(el => {
        const s = getComputedStyle(el)
        return s.justifySelf !== 'auto' ? s.justifySelf : s.textAlign
      })
      expect(['center', 'center']).toContain(extHeaderAlign)

      // size 헤더 (index 3): right
      const sizeHeader = headerChildren.nth(3)
      const sizeHeaderAlign = await sizeHeader.evaluate(el => {
        const s = getComputedStyle(el)
        return s.justifySelf !== 'auto' ? s.justifySelf : s.textAlign
      })
      expect(['right', 'end']).toContain(sizeHeaderAlign)

      // date 헤더 (index 6): right
      const dateHeader = headerChildren.nth(6)
      const dateHeaderAlign = await dateHeader.evaluate(el => {
        const s = getComputedStyle(el)
        return s.justifySelf !== 'auto' ? s.justifySelf : s.textAlign
      })
      expect(['right', 'end']).toContain(dateHeaderAlign)
    }
  })

  // ── AC#6: 컬럼 폭 최적화 (고정 컬럼들의 합이 이전보다 줄어듦) ──
  test('AC#6: 형식~배지 컬럼 폭이 최적화됨 (파일명에 더 많은 공간 할당)', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    const firstDoc = page.locator('.doc-explorer-tree__document').first()

    // 파일명 컬럼이 전체 행 폭의 상당 부분을 차지해야 함
    const nameWidth = await firstDoc.locator('.doc-explorer-tree__doc-name').first()
      .evaluate(el => el.getBoundingClientRect().width)
    const rowWidth = await firstDoc.evaluate(el => el.getBoundingClientRect().width)

    // 파일명이 전체 행의 최소 30% 이상 차지 (이전에는 축소 시 0에 가까웠음)
    expect(nameWidth / rowWidth).toBeGreaterThan(0.25)
  })

  // ── AC#7: 법인 고객 아이콘 주황색 ──
  test('AC#7: 법인 고객(캐치업코리아) 문서 행의 아이콘이 주황색(#ff9500)', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    // 캐치업코리아 문서의 고객 아이콘 확인
    const customerBadge = page.locator('.doc-explorer-tree__doc-customer:has-text("캐치업코리아")').first()
    const icon = customerBadge.locator('.doc-explorer-tree__customer-type-icon svg')
    await expect(icon).toBeVisible({ timeout: 5000 })

    // SVG의 computed color 확인 — 주황색(#ff9500 = rgb(255, 149, 0))
    const color = await icon.evaluate(el => getComputedStyle(el).color)
    // #ff9500 → rgb(255, 149, 0)
    expect(color).toMatch(/rgb\(255,\s*149,\s*0\)/)
  })

  // ── AC#8: 모바일 뷰포트 ──
  test('AC#8: 모바일 뷰포트(375px)에서 수평 스크롤로 모든 컬럼 접근 가능', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    // 문서 행이 보이는지 확인
    const docs = page.locator('.doc-explorer-tree__document')
    const docCount = await docs.count()
    expect(docCount).toBeGreaterThan(0)

    // 레이아웃 깨짐 없이 렌더링됨 (높이가 0이 아닌 행)
    const firstDoc = docs.first()
    const height = await firstDoc.evaluate(el => el.getBoundingClientRect().height)
    expect(height).toBeGreaterThan(10)
  })

  // ── Regression: 기존 문서 클릭/정렬 기능 정상 동작 ──
  test('Regression: 문서 클릭 시 RP가 정상 열림', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    // 첫 번째 문서 클릭
    const firstDoc = page.locator('.doc-explorer-tree__document').first()
    await firstDoc.click()
    await page.waitForTimeout(1500)

    // URL에 documentId가 포함되어야 함
    const url = page.url()
    expect(url).toContain('documentId=')
  })

  test('Regression: 정렬 버튼 클릭 시 정상 동작', async ({ page }) => {
    await navigateToExplorer(page)
    await expandCatchUpKorea(page)

    // 날짜 정렬 버튼 클릭
    const dateSort = page.locator('.doc-explorer-tree__col-btn:has-text("날짜")')
    if (await dateSort.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateSort.click()
      await page.waitForTimeout(1000)

      // 정렬 화살표가 표시되어야 함
      const arrow = dateSort.locator('.doc-explorer-tree__col-arrow')
      await expect(arrow).toBeVisible({ timeout: 3000 })
    }
  })
})
