import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';

const SECRET = '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4';
const USER = { _id: '695cfe260e822face7a78535', name: '곽승철', role: 'user' };
const token = jwt.sign({ id: USER._id, name: USER.name, role: USER.role }, SECRET, { expiresIn: '1d' });

const browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 4, hasTouch: true, isMobile: true });
await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-N960N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36');

await page.goto('https://aims.giize.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate((t, u) => {
  localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: t }, version: 0 }));
  localStorage.setItem('aims-current-user-id', u);
  localStorage.setItem('aims_onboarding_completed', 'true');
  localStorage.setItem('aims_rightclick_guide_shown', 'true');
}, token, USER._id);

await page.goto('https://aims.giize.com', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  const slider = document.querySelector('.theme-switch-slider');
  const input = document.querySelector('.theme-switch-input');
  const container = document.querySelector('.theme-toggle-container');
  const label = document.querySelector('.theme-switch');

  if (!container) return { error: 'no theme-toggle-container' };

  // 슬라이더 또는 라벨 기준으로 hit-test
  const target = slider || label || container;
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const topEl = document.elementFromPoint(cx, cy);
  const allEls = document.elementsFromPoint(cx, cy);

  return {
    containerRect: container.getBoundingClientRect(),
    sliderRect: slider ? slider.getBoundingClientRect() : null,
    labelRect: label ? label.getBoundingClientRect() : null,
    targetCenter: { x: cx, y: cy },
    inputExists: !!input,
    inputChecked: input?.checked,
    currentTheme: document.documentElement.getAttribute('data-theme'),
    topElement: topEl ? { tag: topEl.tagName, className: String(topEl.className || '').substring(0, 80) } : null,
    allElements: allEls.slice(0, 10).map(el => ({
      tag: el.tagName,
      className: String(el.className || '').substring(0, 60),
      zIndex: getComputedStyle(el).zIndex,
      pointerEvents: getComputedStyle(el).pointerEvents,
    })),
    headerClasses: document.querySelector('.header-progressive')?.className,
  };
});

console.log('=== THEME TOGGLE HIT TEST ===');
console.log(JSON.stringify(result, null, 2));

// touchscreen.tap으로 테마 토글 시도
if (result.targetCenter) {
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('\n=== TAP TEST ===');
  console.log('Theme before:', themeBefore);

  await page.touchscreen.tap(result.targetCenter.x, result.targetCenter.y);
  await new Promise(r => setTimeout(r, 1000));

  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('Theme after:', themeAfter);
  console.log('Changed:', themeBefore !== themeAfter);
}

await browser.close();
