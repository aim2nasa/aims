import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://aims.giize.com';
const DIR = path.join(process.cwd(), 'screenshots_touch');
const VP = { width: 360, height: 740, deviceScaleFactor: 4, hasTouch: true, isMobile: true };
const SECRET = '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4';
const USER = { _id: '695cfe260e822face7a78535', name: '곽승철', role: 'user' };

if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const token = jwt.sign({ id: USER._id, name: USER.name, role: USER.role }, SECRET, { expiresIn: '1d' });
const browser = await puppeteer.launch({
  headless: true, ignoreHTTPSErrors: true,
  args: ['--no-sandbox', '--ignore-certificate-errors']
});
const page = await browser.newPage();
await page.setViewport(VP);
await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-N960N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36');

await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate((t, u) => {
  localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: t }, version: 0 }));
  localStorage.setItem('aims-current-user-id', u);
  localStorage.setItem('aims_onboarding_completed', 'true');
  localStorage.setItem('aims_rightclick_guide_shown', 'true');
}, token, USER._id);

await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

const hitTest = await page.evaluate(() => {
  const btn = document.querySelector('.header-mobile-menu-btn');
  const results = { btnExists: !!btn };
  
  if (btn) {
    const rect = btn.getBoundingClientRect();
    results.btnRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    results.btnPointerEvents = getComputedStyle(btn).pointerEvents;
    
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    results.btnCenter = { x: cx, y: cy };
    
    const topEl = document.elementFromPoint(cx, cy);
    results.topElement = topEl ? {
      tag: topEl.tagName,
      className: String(topEl.className || '').substring(0, 80),
      pointerEvents: getComputedStyle(topEl).pointerEvents,
    } : null;
    
    const allEls = document.elementsFromPoint(cx, cy);
    results.allElementsAtPoint = allEls.map(el => ({
      tag: el.tagName,
      className: String(el.className || '').substring(0, 60),
      zIndex: getComputedStyle(el).zIndex,
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));
  }
  
  const drawer = document.querySelector('.layout-leftpane--mobile-drawer');
  if (drawer) {
    const cs = getComputedStyle(drawer);
    results.drawer = { zIndex: cs.zIndex, top: cs.top, transform: cs.transform, pointerEvents: cs.pointerEvents };
  }
  
  return results;
});

console.log('=== HIT TEST ===');
console.log(JSON.stringify(hitTest, null, 2));

await page.screenshot({ path: path.join(DIR, '01_before_tap.png') });

if (hitTest.btnCenter) {
  console.log('\n=== TOUCHSCREEN TAP ===');
  await page.touchscreen.tap(hitTest.btnCenter.x, hitTest.btnCenter.y);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(DIR, '02_after_tap.png') });
  
  const afterTap = await page.evaluate(() => {
    const d = document.querySelector('.layout-leftpane--mobile-drawer');
    return { isOpen: d?.classList.contains('layout-leftpane--mobile-open'), backdrop: !!document.querySelector('.mobile-drawer-backdrop') };
  });
  console.log(JSON.stringify(afterTap, null, 2));
}

await browser.close();
console.log('\nFiles:', fs.readdirSync(DIR).join(', '));
