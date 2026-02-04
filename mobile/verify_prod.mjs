import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://aims.giize.com';
const DIR = path.join(process.cwd(), 'screenshots_verify');
const VP = { width: 393, height: 852, deviceScaleFactor: 3 };
const SECRET = '09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4';
const USER = { _id: '695cfe260e822face7a78535', name: '곽승철', role: 'user' };

if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const token = jwt.sign({ id: USER._id, name: USER.name, role: USER.role }, SECRET, { expiresIn: '1d' });
const browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.setViewport(VP);

await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate((t, u) => {
  localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token: t }, version: 0 }));
  localStorage.setItem('aims-current-user-id', u);
  localStorage.setItem('aims_onboarding_completed', 'true');
  localStorage.setItem('aims_rightclick_guide_shown', 'true');
}, token, USER._id);

await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: path.join(DIR, '01_home.png') });

await page.evaluate(() => document.querySelector('.header-mobile-menu-btn')?.click());
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: path.join(DIR, '02_drawer_open.png') });

const info = await page.evaluate(() => {
  const d = document.querySelector('.layout-leftpane--mobile-drawer');
  if (!d) return { error: 'no drawer' };
  const cs = getComputedStyle(d);
  return { zIndex: cs.zIndex, top: cs.top, transform: cs.transform, backgroundColor: cs.backgroundColor };
});
console.log('Drawer debug:', JSON.stringify(info, null, 2));

await page.evaluate(() => {
  const items = document.querySelectorAll('.custom-menu-item');
  for (const item of items) { if (item.textContent?.includes('전체 고객 보기')) { item.click(); return; } }
});
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: path.join(DIR, '03_customers.png') });

await browser.close();
console.log('Files:', fs.readdirSync(DIR).join(', '));
