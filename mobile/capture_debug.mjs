/**
 * AIMS 모바일 드로어 메뉴 디버그 캡처
 * - iPhone 14 Pro (393x852)
 * - 햄버거 버튼 → 드로어 열기 → 메뉴 항목 확인
 */
import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://aims.giize.com';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots_debug');
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
  console.log(`[START] viewport: ${VIEWPORT.width}x${VIEWPORT.height} | URL: ${BASE_URL}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // 토큰 주입
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate((tkn, userId) => {
    localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: tkn }, version: 0 }));
    localStorage.setItem('aims-current-user-id', userId);
    localStorage.setItem('aims_onboarding_completed', 'true');
    localStorage.setItem('aims_rightclick_guide_shown', 'true');
  }, token, USER._id);

  // 홈으로 이동
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  async function capture(name) {
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    const size = (fs.statSync(filePath).size / 1024).toFixed(1);
    console.log(`  [OK] ${name}.png (${size}KB)`);
  }

  // 1) 홈 화면 초기 상태 (햄버거 버튼 확인)
  console.log('[1] 홈 화면 초기 상태');
  await capture('01_home_initial');

  // 2) DOM 상태 확인
  console.log('\n[2] DOM 디버그 정보:');
  const debugInfo = await page.evaluate(() => {
    const results = {};

    // isMobileView 확인 (window.innerWidth)
    results.innerWidth = window.innerWidth;
    results.innerHeight = window.innerHeight;

    // 햄버거 버튼 확인
    const hamburger = document.querySelector('.header-mobile-menu-btn');
    results.hamburgerExists = !!hamburger;
    if (hamburger) {
      const rect = hamburger.getBoundingClientRect();
      const style = window.getComputedStyle(hamburger);
      results.hamburgerRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      results.hamburgerDisplay = style.display;
      results.hamburgerVisibility = style.visibility;
      results.hamburgerOpacity = style.opacity;
    }

    // Header 확인
    const header = document.querySelector('.header-progressive');
    results.headerExists = !!header;
    if (header) {
      const rect = header.getBoundingClientRect();
      const style = window.getComputedStyle(header);
      results.headerRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      results.headerDisplay = style.display;
    }

    // LeftPane (드로어) 확인
    const drawer = document.querySelector('.layout-leftpane--mobile-drawer');
    results.drawerExists = !!drawer;
    if (drawer) {
      const style = window.getComputedStyle(drawer);
      results.drawerTransform = style.transform;
      results.drawerDisplay = style.display;
      results.drawerClasses = drawer.className;
    }

    // 일반 LeftPane (데스크톱용)
    const desktopLeftpane = document.querySelector('.layout-leftpane:not(.layout-leftpane--mobile-drawer)');
    results.desktopLeftpaneExists = !!desktopLeftpane;

    // CustomMenu 확인
    const customMenu = document.querySelector('.custom-menu');
    results.customMenuExists = !!customMenu;
    if (customMenu) {
      const menuItems = customMenu.querySelectorAll('.custom-menu-item');
      results.menuItemCount = menuItems.length;
      results.menuItemTexts = Array.from(menuItems).slice(0, 5).map(el => el.textContent?.trim());
    }

    // 백드롭 확인
    const backdrop = document.querySelector('.mobile-drawer-backdrop');
    results.backdropExists = !!backdrop;

    return results;
  });

  console.log(JSON.stringify(debugInfo, null, 2));

  // 3) 햄버거 버튼 클릭 시도
  console.log('\n[3] 햄버거 버튼 클릭 시도');
  const hamburgerClicked = await page.evaluate(() => {
    const btn = document.querySelector('.header-mobile-menu-btn');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log(`  햄버거 클릭: ${hamburgerClicked}`);

  await new Promise(r => setTimeout(r, 1000));
  await capture('02_after_hamburger_click');

  // 4) 드로어 상태 확인
  console.log('\n[4] 드로어 열림 상태 확인:');
  const drawerInfo = await page.evaluate(() => {
    const results = {};
    const drawer = document.querySelector('.layout-leftpane--mobile-drawer');
    results.drawerExists = !!drawer;
    if (drawer) {
      const style = window.getComputedStyle(drawer);
      results.drawerClasses = drawer.className;
      results.drawerTransform = style.transform;
      results.drawerOverflow = style.overflowY;
      results.drawerHeight = style.height;
      const rect = drawer.getBoundingClientRect();
      results.drawerRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }

    // 백드롭 확인
    const backdrop = document.querySelector('.mobile-drawer-backdrop');
    results.backdropExists = !!backdrop;

    // 메뉴 항목 확인
    const menuItems = document.querySelectorAll('.custom-menu-item');
    results.menuItemCount = menuItems.length;
    results.menuItems = Array.from(menuItems).map(el => ({
      text: el.textContent?.trim().substring(0, 30),
      visible: el.getBoundingClientRect().height > 0,
    }));

    return results;
  });

  console.log(JSON.stringify(drawerInfo, null, 2));

  // 5) 메뉴 항목 클릭 테스트 (전체 고객 보기)
  console.log('\n[5] 메뉴 항목 클릭 테스트');
  const menuClicked = await page.evaluate(() => {
    const items = document.querySelectorAll('.custom-menu-item');
    for (const item of items) {
      if (item.textContent?.includes('전체 고객 보기')) {
        item.click();
        return `Clicked: ${item.textContent.trim()}`;
      }
    }
    return 'Not found';
  });
  console.log(`  메뉴 클릭 결과: ${menuClicked}`);

  await new Promise(r => setTimeout(r, 3000));
  await capture('03_after_menu_click');

  await browser.close();

  const files = fs.readdirSync(SCREENSHOT_DIR);
  console.log(`\n[DONE] ${files.length}개 파일: ${files.join(', ')}`);
}

main().catch(console.error);
