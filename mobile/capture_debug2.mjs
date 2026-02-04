/**
 * AIMS 모바일 드로어 디버그 - Z-index & Stacking Context 분석
 */
import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://aims.giize.com';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots_debug2');
const VIEWPORT = { width: 393, height: 852, deviceScaleFactor: 3 };

const JWT_SECRET = '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4';
const USER = { _id: '695cfe260e822face7a78535', name: '곽승철', role: 'user' };

function generateToken() {
  return jwt.sign({ id: USER._id, name: USER.name, role: USER.role }, JWT_SECRET, { expiresIn: '1d' });
}

async function main() {
  if (fs.existsSync(SCREENSHOT_DIR)) fs.rmSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const token = generateToken();
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate((tkn, userId) => {
    localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: tkn }, version: 0 }));
    localStorage.setItem('aims-current-user-id', userId);
    localStorage.setItem('aims_onboarding_completed', 'true');
    localStorage.setItem('aims_rightclick_guide_shown', 'true');
  }, token, USER._id);

  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  // 햄버거 버튼 클릭
  await page.evaluate(() => {
    const btn = document.querySelector('.header-mobile-menu-btn');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 상세 디버그 정보
  const debug = await page.evaluate(() => {
    const results = {};

    // 1. 드로어 상세 스타일
    const drawer = document.querySelector('.layout-leftpane--mobile-drawer');
    if (drawer) {
      const cs = window.getComputedStyle(drawer);
      results.drawer = {
        position: cs.position,
        top: cs.top,
        left: cs.left,
        width: cs.width,
        height: cs.height,
        zIndex: cs.zIndex,
        backgroundColor: cs.backgroundColor,
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        transform: cs.transform,
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        pointerEvents: cs.pointerEvents,
        clipPath: cs.clipPath,
        clip: cs.clip,
        containIntrinsicSize: cs.containIntrinsicSize,
        contain: cs.contain,
        rect: drawer.getBoundingClientRect(),
      };
    }

    // 2. 백드롭
    const backdrop = document.querySelector('.mobile-drawer-backdrop');
    if (backdrop) {
      const cs = window.getComputedStyle(backdrop);
      results.backdrop = {
        position: cs.position,
        zIndex: cs.zIndex,
        backgroundColor: cs.backgroundColor,
        opacity: cs.opacity,
        rect: backdrop.getBoundingClientRect(),
      };
    }

    // 3. layout-main (부모)
    const layoutMain = document.querySelector('.layout-main');
    if (layoutMain) {
      const cs = window.getComputedStyle(layoutMain);
      results.layoutMain = {
        position: cs.position,
        zIndex: cs.zIndex,
        transform: cs.transform,
        willChange: cs.willChange,
        filter: cs.filter,
        contain: cs.contain,
        opacity: cs.opacity,
        overflow: cs.overflow,
        perspective: cs.perspective,
        isolation: cs.isolation,
        mixBlendMode: cs.mixBlendMode,
      };
    }

    // 4. Header
    const header = document.querySelector('.header-progressive');
    if (header) {
      const cs = window.getComputedStyle(header);
      results.header = {
        position: cs.position,
        zIndex: cs.zIndex,
        transform: cs.transform,
        rect: header.getBoundingClientRect(),
      };
    }

    // 5. 콘텐츠 영역 (layout-pane들)
    const panes = document.querySelectorAll('.layout-pane');
    results.panes = Array.from(panes).map(el => {
      const cs = window.getComputedStyle(el);
      return {
        className: el.className.substring(0, 50),
        position: cs.position,
        zIndex: cs.zIndex,
        transform: cs.transform,
        rect: el.getBoundingClientRect(),
      };
    });

    // 6. body/html 스타일
    const body = document.body;
    const bcs = window.getComputedStyle(body);
    results.body = {
      position: bcs.position,
      overflow: bcs.overflow,
      transform: bcs.transform,
    };

    // 7. DOM 구조 확인 - 드로어의 부모 체인
    if (drawer) {
      const parentChain = [];
      let el = drawer.parentElement;
      while (el && el !== document.documentElement) {
        const cs = window.getComputedStyle(el);
        const hasStackingContext =
          (cs.position !== 'static' && cs.zIndex !== 'auto') ||
          cs.opacity !== '1' ||
          cs.transform !== 'none' ||
          cs.willChange === 'transform' ||
          cs.filter !== 'none' ||
          cs.contain === 'layout' || cs.contain === 'paint' ||
          cs.isolation === 'isolate';

        parentChain.push({
          tag: el.tagName,
          className: (el.className || '').substring(0, 40),
          position: cs.position,
          zIndex: cs.zIndex,
          transform: cs.transform,
          opacity: cs.opacity,
          willChange: cs.willChange,
          contain: cs.contain,
          filter: cs.filter,
          isolation: cs.isolation,
          createsStackingContext: hasStackingContext,
        });
        el = el.parentElement;
      }
      results.parentChain = parentChain;
    }

    // 8. 가장 위에 있는 요소 확인 (드로어 위치에서)
    const elementAtDrawerPos = document.elementFromPoint(140, 400); // drawer center
    results.topElementAtDrawer = {
      tag: elementAtDrawerPos?.tagName,
      className: (elementAtDrawerPos?.className || '').substring(0, 60),
      id: elementAtDrawerPos?.id,
    };

    // 9. 드로어 영역 내 첫 번째 메뉴 아이템 위치
    const firstMenuItem = document.querySelector('.layout-leftpane--mobile-drawer .custom-menu-item');
    if (firstMenuItem) {
      results.firstMenuItem = {
        text: firstMenuItem.textContent?.trim().substring(0, 20),
        rect: firstMenuItem.getBoundingClientRect(),
        visible: firstMenuItem.getBoundingClientRect().width > 0 && firstMenuItem.getBoundingClientRect().height > 0,
      };
    }

    return results;
  });

  console.log(JSON.stringify(debug, null, 2));

  // 스크린샷
  const filePath = path.join(SCREENSHOT_DIR, 'drawer_open.png');
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`\n[OK] drawer_open.png`);

  // 드로어에 빨간 보더 추가해서 위치 확인
  await page.evaluate(() => {
    const drawer = document.querySelector('.layout-leftpane--mobile-drawer');
    if (drawer) {
      drawer.style.border = '5px solid red';
      drawer.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
    }
  });
  await new Promise(r => setTimeout(r, 500));
  const filePath2 = path.join(SCREENSHOT_DIR, 'drawer_highlighted.png');
  await page.screenshot({ path: filePath2, fullPage: false });
  console.log(`[OK] drawer_highlighted.png`);

  await browser.close();
}

main().catch(console.error);
