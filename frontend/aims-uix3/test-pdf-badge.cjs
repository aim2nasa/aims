const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:5177');
  await page.waitForTimeout(1000);

  // 개발용 로그인 건너뛰기
  const devLoginBtn = await page.$('text=개발용 로그인 건너뛰기');
  if (devLoginBtn) {
    await devLoginBtn.click();
    console.log('Logged in');
    await page.waitForTimeout(2000);
  }

  // 튜토리얼 모달 닫기
  const closeModalBtn = await page.$('text=다시 표시 안 함');
  if (closeModalBtn) {
    await closeModalBtn.click();
    await page.waitForTimeout(1000);
  }

  // 전체 문서 보기 클릭
  await page.click('text=전체 문서 보기', { timeout: 5000 }).catch(() => console.log('전체 문서 보기 not found'));
  await page.waitForTimeout(3000);

  // 스크린샷
  await page.screenshot({ path: 'd:/aims/pdf-badge-screenshot4.png', fullPage: true });
  console.log('Screenshot saved');

  // PDF 배지 찾기
  const badges = await page.$$('.pdf-conversion-badge');
  console.log(`Found ${badges.length} PDF badges`);

  if (badges.length > 0) {
    const style = await badges[0].evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        display: computed.display,
        width: el.offsetWidth,
        height: el.offsetHeight,
        text: el.textContent
      };
    });
    console.log('Badge:', JSON.stringify(style, null, 2));
    await badges[0].screenshot({ path: 'd:/aims/pdf-badge-element.png' });
  } else {
    const items = await page.$$('.status-item');
    console.log(`Found ${items.length} status-item elements`);
    const filenames = await page.$$('.status-filename');
    console.log(`Found ${filenames.length} status-filename elements`);
    if (filenames.length > 0) {
      const html = await filenames[0].innerHTML();
      console.log('HTML:', html.substring(0, 300));
    }
  }

  await browser.close();
})();
