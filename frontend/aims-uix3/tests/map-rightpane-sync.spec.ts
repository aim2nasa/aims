import { test, expect } from '@playwright/test'

test.describe('지도 RightPane 동기화 테스트', () => {
  test('지도에서 고객 클릭 시 RightPane이 열리면서 지도가 조정되어야 함', async ({ page }) => {
    // 콘솔 로그 수집 시작
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        const text = msg.text()
        logs.push(text)
        console.log(`[브라우저] ${text}`)
      }
    })

    // 1. 페이지 로드
    await page.goto('http://localhost:5174')
    await page.waitForLoadState('networkidle')

    // 2. 지역별 보기 열기
    await page.getByText('지역별 보기').click()
    await page.waitForTimeout(1000)

    // 3. 경기도 폴더 펼치기
    await page.getByText('📁경기도').click()
    await page.waitForTimeout(300)

    // 4. 고양시 폴더 펼치기
    await page.getByText('📁고양시').click()
    await page.waitForTimeout(300)

    // 5. 김보성 고객 클릭 (트리에서)
    await page.locator('div').filter({ hasText: /^김보성$/ }).click()
    await page.waitForTimeout(500)

    // 6. RightPane이 닫혀있는지 확인 (트리 클릭은 RightPane 열지 않음)
    const rightPaneBefore = page.locator('.layout-rightpane-container')
    const rightPaneWidthBefore = await rightPaneBefore.evaluate(el => el.getBoundingClientRect().width)
    console.log(`[테스트] 트리 클릭 후 RightPane width: ${rightPaneWidthBefore}px`)
    expect(rightPaneWidthBefore).toBeLessThan(50) // RightPane이 닫혀있어야 함

    // 7. 지도에서 마커 클릭 (사용자가 녹화한 selector 사용)
    await page.locator('div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div').click()

    // 8. RightPane 애니메이션 완료 대기
    await page.waitForTimeout(1000)

    // 9. RightPane이 열렸는지 확인
    const rightPaneWidthAfter = await rightPaneBefore.evaluate(el => el.getBoundingClientRect().width)
    console.log(`[테스트] 지도 클릭 후 RightPane width: ${rightPaneWidthAfter}px`)
    expect(rightPaneWidthAfter).toBeGreaterThan(300) // RightPane이 열려야 함

    // 10. 콘솔 로그에서 지도 조정 로그 확인
    await page.waitForTimeout(500)
    const hasPanByLog = logs.some(log => log.includes('RightPane 열림 감지 - 마커 위치 조정'))

    console.log('\n[테스트] 수집된 관련 로그:')
    logs.filter(log => log.includes('RightPane') || log.includes('panBy')).forEach(log => {
      console.log(`  ${log}`)
    })

    // 11. 검증: 지도 조정이 실행되었는지
    expect(hasPanByLog).toBeTruthy()
  })

  test('RightPane width 변화 추적 테스트', async ({ page }) => {
    // 콘솔 로그 수집
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        const text = msg.text()
        logs.push(text)
        console.log(`[브라우저] ${text}`)
      }
    })

    // 페이지 로드
    await page.goto('http://localhost:5174')
    await page.waitForLoadState('networkidle')

    // 지역별 보기 열기
    await page.getByText('지역별 보기').click()
    await page.waitForTimeout(1000)

    // 경기도 → 고양시 펼치기
    await page.getByText('📁경기도').click()
    await page.waitForTimeout(300)
    await page.getByText('📁고양시').click()
    await page.waitForTimeout(300)

    // RightPane width 측정 함수
    const getRightPaneWidth = async () => {
      const width = await page.locator('.layout-rightpane-container').evaluate(
        el => el.getBoundingClientRect().width
      )
      return width
    }

    const initialRPWidth = await getRightPaneWidth()
    console.log(`[테스트] 초기 RightPane width: ${initialRPWidth}px`)

    // 지도 마커 클릭
    await page.locator('div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div').click()

    // 1.5초간 100ms 간격으로 width 변화 추적
    console.log('\n[테스트] RightPane width 변화 추적:')
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(100)
      const currentWidth = await getRightPaneWidth()
      console.log(`  ${i * 100}ms: ${Math.round(currentWidth)}px`)
    }

    const finalRPWidth = await getRightPaneWidth()
    console.log(`\n[테스트] 최종 RightPane width: ${finalRPWidth}px`)
    console.log(`[테스트] width 증가량: ${Math.round(finalRPWidth - initialRPWidth)}px`)

    // 로그 분석
    console.log('\n[테스트] 지도 조정 관련 로그:')
    logs.filter(log => log.includes('RightPane') || log.includes('panBy')).forEach(log => {
      console.log(`  ${log}`)
    })

    // 검증
    expect(finalRPWidth).toBeGreaterThan(300) // RightPane이 열렸는지
    expect(finalRPWidth - initialRPWidth).toBeGreaterThan(200) // 충분한 width 변화
  })

  test('RightPane 닫을 때 마커가 전체 지도 중앙으로 재조정되어야 함', async ({ page }) => {
    // 콘솔 로그 수집
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        const text = msg.text()
        logs.push(text)
        console.log(`[브라우저] ${text}`)
      }
    })

    // 1. 페이지 로드
    await page.goto('http://localhost:5174')
    await page.waitForLoadState('networkidle')

    // 2. 지역별 보기 열기
    await page.getByText('지역별 보기').click()
    await page.waitForTimeout(1000)

    // 3. 경기도 → 고양시 펼치기
    await page.getByText('📁경기도').click()
    await page.waitForTimeout(300)
    await page.getByText('📁고양시').click()
    await page.waitForTimeout(300)

    // 4. 트리에서 김보성 클릭
    await page.locator('div').filter({ hasText: /^김보성$/ }).click()
    await page.waitForTimeout(500)

    // 5. 지도 마커 클릭 → RightPane 열림
    await page.locator('div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div').click()
    await page.waitForTimeout(1000)

    // 6. RightPane이 열렸는지 확인
    const rightPane = page.locator('.layout-rightpane-container')
    const rpWidthAfterOpen = await rightPane.evaluate(el => el.getBoundingClientRect().width)
    console.log(`[테스트] RightPane 열림 후 width: ${rpWidthAfterOpen}px`)
    expect(rpWidthAfterOpen).toBeGreaterThan(300)

    // 7. 로그 초기화 (RightPane 열림 로그 제거)
    logs.length = 0

    // 8. RightPane X 버튼 클릭
    await page.click('.base-viewer__close-button')
    await page.waitForTimeout(1200) // RightPane 애니메이션(600ms) + setTimeout(400ms) + 여유(200ms)

    // 9. RightPane이 닫혔는지 확인
    const rpWidthAfterClose = await rightPane.evaluate(el => el.getBoundingClientRect().width)
    console.log(`[테스트] RightPane 닫힘 후 width: ${rpWidthAfterClose}px`)
    expect(rpWidthAfterClose).toBeLessThan(50)

    // 10. 콘솔 로그 확인
    console.log('\n[테스트] RightPane 닫힘 후 수집된 로그:')
    logs.forEach(log => console.log(`  ${log}`))

    // 11. 검증: RightPane 닫힘 감지 로그
    const hasCloseDetectionLog = logs.some(log => log.includes('RightPane 닫힘 감지'))
    expect(hasCloseDetectionLog).toBeTruthy()

    // 12. 검증: 지도 상태 복원 로그
    const hasRestoreLog = logs.some(log => log.includes('지도 상태 복원 완료'))
    expect(hasRestoreLog).toBeTruthy()
  })
})
