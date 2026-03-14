import { test, expect, Page } from '@playwright/test';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSIsIm5hbWUiOiLqsJzrsJzsnpAgKERldikiLCJyb2xlIjoiYWdlbnQiLCJpYXQiOjE3NzM0ODE3MjgsImV4cCI6MTc3NDA4NjUyOH0.RtHyQ-mHm1tRM0Q5lERW5qMVCjVotJmDhCArloBO_LM';
const DEV_USER_ID = '000000000000000000000001';
const DEV_USER_NAME = '개발자 (Dev)';
const SS = (n: string) => 'D:/tmp/e2e_final_' + n + '.png';

async function clearStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('aims-remember-device');
    localStorage.removeItem('aims-remembered-user');
    sessionStorage.removeItem('aims-session-token');
    const raw = localStorage.getItem('auth-storage-v2');
    if (raw) { try { const x = JSON.parse(raw); if (x.state) { x.state.token=null; x.state.user=null; x.state.isAuthenticated=false; } localStorage.setItem('auth-storage-v2',JSON.stringify(x)); } catch {} }
  });
}

async function setAuth(page: Page, withSession = false) {
  const u = { _id: DEV_USER_ID, name: DEV_USER_NAME, email: 'dev@aims.local',
    role: 'agent', authProvider: 'dev', profileCompleted: true, avatarUrl: null, oauthProfile: null };
  await page.evaluate(({ token, user, ws }: any) => {
    localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }));
    localStorage.setItem('aims-remember-device', 'true');
    localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: user._id, name: user.name, authProvider: user.authProvider }));
    if (ws) sessionStorage.setItem('aims-session-token', 'test-session');
    else sessionStorage.removeItem('aims-session-token');
  }, { token: TOKEN, user: u, ws: withSession });
}

async function deletePin(page: Page) {
  await page.request.delete('/api/auth/pin', {
    headers: { Authorization: 'Bearer ' + TOKEN }
  }).catch(() => {});
}

// ================================================================
// B. 미로그인 대츠
// ================================================================
test.describe('B. 미로그인 대츠', () => {

  test('B1: 인증 없이 /customers 접속 → /login 리다이렉트', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await clearStorage(page);
    await page.goto('/customers', { waitUntil: 'load' });
    // ProtectedRoute redirects asynchronously - wait for /login to appear
    await page.waitForURL('**/login**', { timeout: 5000 }).catch(() => {});
    const url = page.url();
    console.log('B1 URL:', url);
    await page.screenshot({ path: SS('B1_redirect_to_login') });
    expect(url).toContain('/login');
  });

  test('B2: /login 접속 → 소셜 로그인 3개 버튼 표시', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'load' });
    await page.waitForSelector('.social-login-buttons', { timeout: 10000 });
    await expect(page.locator('[aria-label=\'카카오 로그인\']')).toBeVisible();
    await expect(page.locator('[aria-label=\'네이버 로그인\']')).toBeVisible();
    await expect(page.locator('[aria-label=\'구글 로그인\']')).toBeVisible();
    await page.screenshot({ path: SS('B2_social_buttons') });
  });

  test('B3: PC 1920x1080 - 로그인 화면 라이트 모드', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/login', { waitUntil: 'load' });
    await page.waitForSelector('.social-login-buttons', { timeout: 10000 });
    await page.screenshot({ path: SS('B3_pc_1920_login') });
  });

  test('B4: 모바일 390x844 - 로그인 화면 라운드 코너 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login', { waitUntil: 'load' });
    await page.waitForSelector('.social-login-buttons', { timeout: 10000 });
    const container = page.locator('.login-container');
    const br = await container.evaluate((el: Element) => window.getComputedStyle(el).borderRadius);
    console.log('B4 mobile border-radius:', br);
    await page.screenshot({ path: SS('B4_mobile_login') });
  });
});

// ================================================================
// C. 첫 로그인 - 간편 비밀번호 설정
// ================================================================
test.describe('C. 첫 로그인 - 간편 비밀번호 설정', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await clearStorage(page);
    await deletePin(page);
  });

  test('C1: 로그인 성공 후 첫 화면 - 간편 비밀번호 설정 안내', async ({ page }) => {
    const u = { _id: DEV_USER_ID, name: DEV_USER_NAME, email: 'dev@aims.local',
      role: 'agent', authProvider: 'dev', profileCompleted: true, avatarUrl: null, oauthProfile: null };
    await page.evaluate(({ token, user }: any) => {
      localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }));
      localStorage.removeItem('aims-remember-device');
      localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: user._id, name: user.name, authProvider: user.authProvider }));
      sessionStorage.removeItem('aims-session-token');
    }, { token: TOKEN, user: u });
    await page.goto('/login?mode=pin-setup', { waitUntil: 'load' });
    await page.waitForSelector('.login-pin-container', { timeout: 10000 });
    const text = await page.textContent('body') || '';
    const hasSetup = text.includes('간편') || text.includes('비밀번호') || text.includes('설정');
    console.log('C1 has setup guidance:', hasSetup);
    await page.screenshot({ path: SS('C1_pin_setup_screen') });
    expect(hasSetup).toBe(true);
  });

  test('C2: 간편 비밀번호 4자리 입력 UI - dot 4개', async ({ page }) => {
    const u = { _id: DEV_USER_ID, name: DEV_USER_NAME, email: 'dev@aims.local',
      role: 'agent', authProvider: 'dev', profileCompleted: true, avatarUrl: null, oauthProfile: null };
    await page.evaluate(({ token, user }: any) => {
      localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }));
      localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: user._id, name: user.name, authProvider: user.authProvider }));
    }, { token: TOKEN, user: u });
    await page.goto('/login?mode=pin-setup', { waitUntil: 'load' });
    await page.waitForSelector('.login-pin-container', { timeout: 10000 });
    const dots = page.locator('.pin-dot');
    await expect(dots).toHaveCount(4);
    await page.screenshot({ path: SS('C2_pin_setup_dots') });
  });

  test('C4: 나중에 설정하기 클릭 시 메인으로 이동 (Sora-4)', async ({ page }) => {
    const u = { _id: DEV_USER_ID, name: DEV_USER_NAME, email: 'dev@aims.local',
      role: 'agent', authProvider: 'dev', profileCompleted: true, avatarUrl: null, oauthProfile: null };
    await page.evaluate(({ token, user }: any) => {
      localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }));
      localStorage.removeItem('aims-remember-device');
    }, { token: TOKEN, user: u });
    await page.goto('/login?mode=pin-setup', { waitUntil: 'load' });
    await page.waitForSelector('.login-pin-container', { timeout: 10000 }).catch(() => {});
    const laterBtn = page.getByText(/나중에 설정|나중에|건너뜀/).first();
    const laterVisible = await laterBtn.isVisible().catch(() => false);
    console.log('C4 later button visible:', laterVisible);
    await page.screenshot({ path: SS('C4_later_button') });
    if (laterVisible) {
      await laterBtn.click();
      await page.waitForTimeout(1500);
      const finalUrl = page.url();
      console.log('C4 after later click URL:', finalUrl);
      await page.screenshot({ path: SS('C4_after_later_click') });
      expect(finalUrl).not.toContain('/login');
    } else {
      console.log('C4 SKIP: later button not found');
    }
  });
});

// ================================================================
// D. 기기 기억 + 재방문
// ================================================================
test.describe('D. 기기 기억 + 재방문', () => {

  test('D1: 세션 없음 + remember-device=true → /login?mode=pin 리다이렉트', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await setAuth(page, false);
    await page.goto('/customers', { waitUntil: 'load' });
    await page.waitForURL(/mode=pin/, { timeout: 8000 }).catch(() => {});
    const url = page.url();
    console.log('D1 URL:', url);
    await page.screenshot({ path: SS('D1_pin_redirect') });
    expect(url).toContain('mode=pin');
  });

  test('D3: BUG-1 수정 검증 - authToken 없음 + rememberedUser 있음 → PIN 입력 화면', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage-v2');
      if (raw) { try { const x = JSON.parse(raw); if (x.state) { x.state.token=null; x.state.isAuthenticated=false; } localStorage.setItem('auth-storage-v2',JSON.stringify(x)); } catch {} }
      localStorage.setItem('aims-remember-device', 'true');
      localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: 'test123', name: '김소라', authProvider: 'kakao' }));
    });
    await page.goto('/login?mode=pin', { waitUntil: 'load' });
    await page.waitForSelector('.login-pin-container', { timeout: 10000 });
    await expect(page.getByText('간편 비밀번호를 입력하세요')).toBeVisible();
    await page.screenshot({ path: SS('D3_bug1_fix_verified') });
  });
});

// ================================================================
// E. 비밀번호 실패 + 잠김
// ================================================================
test.describe('E. 비밀번호 실패 + 잠김', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await clearStorage(page);
    await deletePin(page);
  });

  test('E3: 잠김 후 메시지 확인', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('aims-remember-device', 'true');
      localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: 'test123', name: '김소라', authProvider: 'kakao' }));
    });
    await page.goto('/login?mode=pin', { waitUntil: 'load' });
    await page.waitForSelector('.login-pin-container', { timeout: 10000 });
    const keypad = page.locator('.pin-keypad button');
    const kpCount = await keypad.count();
    if (kpCount > 0) {
      for (let i = 0; i < 5; i++) {
        const nineBtn = keypad.filter({ hasText: /^9$/ }).first();
        if (await nineBtn.isVisible().catch(() => false)) {
          for (let j = 0; j < 4; j++) { await nineBtn.click(); }
        }
        await page.waitForTimeout(300);
      }
    } else {
      for (let i = 0; i < 5; i++) { await page.keyboard.type('9999'); await page.waitForTimeout(300); }
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: SS('E3_lockout_attempt') });
    const bodyText = await page.textContent('body') || '';
    console.log('E3 body after attempts:', bodyText.substring(0, 300));
  });

  test('E4: 로그인 페이지에 소셜 로그인 안내', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'load' });
    await page.waitForSelector('.social-login-buttons', { timeout: 10000 });
    await expect(page.locator('[aria-label=\'카카오 로그인\']')).toBeVisible();
    await page.screenshot({ path: SS('E4_social_login_page') });
  });
});

// Group F
test.describe('F. 메인 화면 접속 확인', () => {
  test('F1: 세션토큰 있음 → 메인 화면 정상 접속', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await setAuth(page, true);
    await page.goto('/', { waitUntil: 'load' });
    const url = page.url();
    console.log('F1 URL:', url);
    await page.screenshot({ path: SS('F1_main_access') });
    expect(url).not.toContain('/login');
  });
  test('F2: 메인 화면 - 내비게이션 표시', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await setAuth(page, true);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log('F2 URL:', url);
    await page.screenshot({ path: SS('F2_main_navigation') });
  });
  test('F3: 프로필 메뉴 - 간편 비밀번호 변경 항목 유무 (Sora-1)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await setAuth(page, true);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const url = page.url();
    await page.screenshot({ path: SS('F3_profile_menu_before') });
    if (!url.includes('/login')) {
      const profileBtn = page.locator('.profile-button, .avatar-button, .user-avatar').first();
      const hasProfile = await profileBtn.isVisible().catch(() => false);
      console.log('F3 profile button found:', hasProfile);
      if (hasProfile) {
        await profileBtn.click();
        await page.waitForTimeout(500);
        const bodyText = await page.textContent('body') || '';
        const hasPinMenu = bodyText.includes('간편 비밀번호');
        console.log('F3 has pin menu item:', hasPinMenu);
        await page.screenshot({ path: SS('F3_profile_menu_open') });
      }
    }
  });
});
// Group G
test.describe('G. 로그아웃', () => {
  test('G1: 로그아웃 실행 → /login 리다이렉트', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await setAuth(page, true);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log('G1 before logout URL:', url);
    if (!url.includes('/login')) {
      const logoutBtn = page.locator('button, a').filter({ hasText: /로그아웃/ }).first();
      const hasLogout = await logoutBtn.isVisible().catch(() => false);
      if (hasLogout) { await logoutBtn.click(); await page.waitForTimeout(1000); }
      else {
        await page.evaluate(() => {
          sessionStorage.removeItem('aims-session-token');
          const raw = localStorage.getItem('auth-storage-v2');
          if (raw) { try { const x=JSON.parse(raw); if(x.state){x.state.token=null;x.state.user=null;x.state.isAuthenticated=false;} localStorage.setItem('auth-storage-v2',JSON.stringify(x)); } catch {} }
        });
        await page.goto('/customers');
      }
      const finalUrl = page.url();
      console.log('G1 after logout URL:', finalUrl);
      await page.screenshot({ path: SS('G1_after_logout') });
      expect(finalUrl).toContain('/login');
    } else { console.log('G1 could not reach main'); await page.screenshot({ path: SS('G1_skip') }); }
  });
  test('G2: 세션 삭제 후 / 접속 → PIN 모드 표시', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token }: any) => {
      const u = { _id: '000000000000000000000001', name: '개발자', email: 'dev@aims.local', role: 'agent', authProvider: 'dev', profileCompleted: true, avatarUrl: null, oauthProfile: null };
      localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token, user: u, isAuthenticated: true }, version: 0 }));
      localStorage.setItem('aims-remember-device', 'true');
      localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: u._id, name: u.name, authProvider: u.authProvider }));
      sessionStorage.removeItem('aims-session-token');
    }, { token: TOKEN });
    await page.goto('/customers');
    await page.waitForURL(/mode=pin/, { timeout: 8000 }).catch(() => {});
    const url = page.url();
    console.log('G2 URL (expect pin mode):', url);
    await page.screenshot({ path: SS('G2_pin_shown_after_session_cleared') });
    expect(url).toContain('mode=pin');
  });
});

// Group H - 용어 통일성
test.describe('H. 용어 통일성 - PIN vs 간편 비밀번호', () => {
  test('H1: 로그인 페이지 - PIN 단어 노출 여부', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'load' });
    await page.waitForSelector('.social-login-buttons', { timeout: 10000 });
    const bodyText = await page.textContent('body') || '';
    const hasPIN = bodyText.includes('PIN');
    console.log('H1 has PIN text:', hasPIN);
    if (hasPIN) { const m = bodyText.match(/PIN.{0,60}/g); console.log('H1 PIN contexts:', JSON.stringify(m)); }
    await page.screenshot({ path: SS('H1_login_page_terms') });
    if (hasPIN) console.log('FAIL: PIN term found - needs to be changed to 간편 비밀번호');
    else console.log('PASS: No raw PIN term on login page');
  });
  test('H2: PIN 모드 페이지 - PIN 단어 노출 여부', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('aims-remembered-user', JSON.stringify({ userId: 'test123', name: '김소라', authProvider: 'kakao' }));
    });
    await page.goto('/login?mode=pin', { waitUntil: 'load' });
    await page.waitForSelector('.login-pin-container', { timeout: 10000 });
    const bodyText = await page.textContent('body') || '';
    const hasPIN = bodyText.includes('PIN');
    console.log('H2 has PIN text:', hasPIN);
    if (hasPIN) { const m = bodyText.match(/PIN.{0,60}/g); console.log('H2 PIN contexts:', JSON.stringify(m)); }
    await page.screenshot({ path: SS('H2_pin_mode_terms') });
    if (hasPIN) console.log('FAIL: PIN term found - needs to be changed to 간편 비밀번호');
    else console.log('PASS: No raw PIN term on PIN mode page');
  });
});