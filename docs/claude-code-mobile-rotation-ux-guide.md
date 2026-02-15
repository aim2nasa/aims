# Claude Code로 모바일 화면 회전 UX 자체 피드백 루프 구현

## 개요

Claude Code가 **구현 → 확인 → 수정**을 반복하는 자체 피드백 루프를 만들어서,
aims-uix3의 모바일 화면 회전(portrait ↔ landscape) UX를 최적화하는 가이드입니다.

---

## 핵심 전략: Playwright + 스크린샷 피드백

Claude Code가 브라우저를 직접 띄워서 스크린샷을 찍고, 그 결과를 보고 스스로 수정하게 하는 방식입니다.

---

## 1단계: 테스트 환경 준비

```bash
# aims-uix3 프로젝트에서
npm install -D playwright @playwright/test
npx playwright install chromium
```

---

## 2단계: 화면 회전 테스트 스크립트 작성

`e2e/test-rotation.spec.js` 파일을 만들어두면 Claude Code가 이걸 활용합니다:

```javascript
// e2e/test-rotation.spec.js
const { test, expect } = require('@playwright/test');

const pages = ['/', '/customers', '/contracts', '/dashboard'];
const viewports = [
  { name: 'portrait', width: 390, height: 844 },   // iPhone 14
  { name: 'landscape', width: 844, height: 390 },
];

for (const page of pages) {
  for (const vp of viewports) {
    test(`${page} - ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }
      });
      const p = await context.newPage();
      await p.goto(`http://localhost:3000${page}`);
      await p.waitForLoadState('networkidle');
      await p.screenshot({
        path: `screenshots/${page.replace('/', 'home')}-${vp.name}.png`,
        fullPage: true
      });
    });
  }
}
```

---

## 3단계: Claude Code에 주는 프롬프트

이게 핵심입니다. Claude Code에게 **피드백 루프를 명시적으로 지시**해야 합니다:

```
aims-uix3의 모바일 화면 회전(portrait ↔ landscape) UX를 최적화해줘.

## 작업 방식 (반드시 따를 것)
1. **구현**: 화면 회전 대응 CSS/컴포넌트 수정
2. **검증**: npx playwright test e2e/test-rotation.spec.js 실행해서 스크린샷 촬영
3. **분석**: 생성된 스크린샷을 직접 열어서 다음을 확인
   - 가로 모드에서 레이아웃이 깨지는지
   - 네비게이션이 접근 가능한지
   - 테이블/리스트가 잘리지 않는지
   - 폰트 크기와 터치 타겟이 적절한지
4. **수정**: 문제 발견 시 코드 수정 후 2번부터 반복
5. **완료**: 모든 페이지가 portrait/landscape 모두 정상일 때까지 반복

## 주요 체크포인트
- 사이드바/네비게이션: 가로 모드에서 공간 효율적 배치
- 데이터 테이블: 가로 스크롤 또는 컬럼 재배치
- 모달/다이얼로그: 가로 모드에서 높이 넘침 방지
- 폼 입력: 키보드 + 가로 모드 조합 대응

최소 3회 이상 피드백 루프를 돌려줘.
```

---

## 4단계: CSS 미디어 쿼리 가이드

Claude Code가 참고할 수 있도록 프로젝트에 가이드를 넣어두면 좋습니다:

```css
/* 화면 회전 대응 기본 패턴 */

/* 가로 모드 + 모바일: 세로 공간이 부족한 상황 */
@media (orientation: landscape) and (max-height: 500px) {
  .app-header { height: 40px; }
  .sidebar { position: fixed; z-index: 100; }
  .content { padding-top: 40px; }
}

/* 세로 모드 모바일 */
@media (orientation: portrait) and (max-width: 430px) {
  .data-table { display: block; overflow-x: auto; }
}
```

---

## 5단계: 스크린샷 피드백 방법

Claude Code가 스크린샷을 "볼 수" 있어야 피드백 루프가 동작합니다.

### 방법 1: 스크린샷 직접 분석

Claude Code는 이미지 파일을 직접 볼 수 있으므로 생성된 PNG 파일을 열어서 시각적으로 확인 가능합니다.

### 방법 2: HTML 리포트 생성 (더 나은 방법)

```bash
npx playwright test --reporter=html
# 결과를 playwright-report/index.html로 생성
```

Claude Code가 HTML 리포트의 텍스트 결과(pass/fail)와 스크린샷 파일을 함께 분석하게 합니다.

---

## 주요 체크포인트 상세

| 항목 | Portrait (세로) | Landscape (가로) |
|------|----------------|-----------------|
| 사이드바/네비게이션 | 하단 탭바 또는 햄버거 메뉴 | 축소된 사이드바 또는 자동 숨김 |
| 데이터 테이블 | 카드형 레이아웃 또는 가로 스크롤 | 전체 컬럼 표시 |
| 모달/다이얼로그 | 전체 화면 또는 바텀시트 | 높이 제한 + 스크롤 |
| 폼 입력 | 풀 너비 입력 필드 | 2열 레이아웃 가능 |
| 헤더 | 표준 높이 | 축소 높이 (공간 확보) |

---

## 추가 팁

### CLAUDE.md에 컨텍스트 추가

프로젝트 루트의 `CLAUDE.md`에 다음을 추가하면 Claude Code가 항상 참고합니다:

```markdown
## 모바일 회전 UX 가이드라인
- 모든 페이지는 portrait/landscape 모두 지원해야 함
- 가로 모드에서 세로 공간 부족 주의 (max-height: 500px)
- 스크린샷 테스트: `npx playwright test e2e/test-rotation.spec.js`
- 스크린샷 저장 위치: `screenshots/` 디렉토리
```

### 디바이스 프리셋 확장

```javascript
// 다양한 디바이스 테스트
const devices = [
  { name: 'iPhone-SE', portrait: { w: 375, h: 667 }, landscape: { w: 667, h: 375 } },
  { name: 'iPhone-14', portrait: { w: 390, h: 844 }, landscape: { w: 844, h: 390 } },
  { name: 'Galaxy-S23', portrait: { w: 360, h: 780 }, landscape: { w: 780, h: 360 } },
  { name: 'iPad-Mini', portrait: { w: 768, h: 1024 }, landscape: { w: 1024, h: 768 } },
];
```

---

## 요약

> **핵심**: Playwright로 자동 스크린샷 → Claude Code가 결과 확인 → 코드 수정 → 재촬영...
> 이 루프를 프롬프트에서 명시적으로 지시하면 됩니다.
> Claude Code는 이미지 파일을 직접 볼 수 있으므로 시각적 피드백이 가능합니다.
