/**
 * AIMS 모바일 반응형 자동 스크린샷
 * - iPhone 14 Pro (393x852) 뷰포트
 * - JWT 토큰 직접 생성 → localStorage 주입
 * - SPA 내부 네비게이션 클릭으로 각 화면 이동
 * - 결과: d:\aims\mobile\screenshots\
 */
import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://localhost:5177';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');
const VIEWPORT = { width: 393, height: 852, deviceScaleFactor: 3 };

const JWT_SECRET = '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4';
const USER = { _id: '695cfe260e822face7a78535', name: '곽승철', role: 'user' };

function generateToken() {
  return jwt.sign({ id: USER._id, name: USER.name, role: USER.role }, JWT_SECRET, { expiresIn: '1d' });
}

async function clickNavItem(page, text) {
  // LeftPane 네비게이션 항목 클릭
  const clicked = await page.evaluate((txt) => {
    const items = document.querySelectorAll('.left-pane-item, .nav-item, [class*="menu-item"], [class*="nav-link"], a, button, span');
    for (const item of items) {
      if (item.textContent && item.textContent.trim().includes(txt)) {
        item.click();
        return true;
      }
    }
    return false;
  }, text);
  return clicked;
}

async function main() {
  if (fs.existsSync(SCREENSHOT_DIR)) fs.rmSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const token = generateToken();
  console.log(`[START] viewport: ${VIEWPORT.width}x${VIEWPORT.height} @${VIEWPORT.deviceScaleFactor}x | user: ${USER.name}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // 1) 토큰 주입
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluate((tkn, userId) => {
    localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: tkn }, version: 0 }));
    localStorage.setItem('aims-current-user-id', userId);
    localStorage.setItem('aims_onboarding_completed', 'true');
    localStorage.setItem('aims_rightclick_guide_shown', 'true');
  }, token, USER._id);

  // 2) 홈으로 이동
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  // 캡처 함수
  async function capture(name) {
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    const size = (fs.statSync(filePath).size / 1024).toFixed(1);
    console.log(`  [OK] ${name}.png (${size}KB)`);
  }

  // 3) 홈 화면 (LeftPane + RightPane 보이는 상태)
  console.log('[1] 홈 화면');
  await capture('01_home');

  // 4) 전체 문서 보기
  console.log('[2] 전체 문서 보기');
  await clickNavItem(page, '전체 문서 보기');
  await new Promise(r => setTimeout(r, 4000));
  await capture('02_documents_all');

  // 5) 전체 고객 보기
  console.log('[3] 전체 고객 보기');
  await clickNavItem(page, '전체 고객 보기');
  await new Promise(r => setTimeout(r, 4000));
  await capture('03_customers_all');

  // 6) 문서 등록 (고객·계약·문서 등록)
  console.log('[4] 문서 등록');
  await clickNavItem(page, '고객·계약·문서 등록');
  await new Promise(r => setTimeout(r, 4000));
  await capture('04_document_registration');

  // 7) 문서 탐색기
  console.log('[5] 문서 탐색기');
  await clickNavItem(page, '문서 탐색기');
  await new Promise(r => setTimeout(r, 4000));
  await capture('05_document_explorer');

  await browser.close();

  const files = fs.readdirSync(SCREENSHOT_DIR);
  console.log(`\n[DONE] ${files.length}개 파일: ${files.join(', ')}`);
}

main().catch(console.error);
