# AIMS-UIX3 캐시 무효화 시스템 분석 보고서

**작성일**: 2025-11-10
**작성자**: Claude Code
**버전**: 1.0.0
**검토 범위**: Vite 빌드 시스템 캐시 무효화 전략

---

## 📋 요약 (Executive Summary)

AIMS-UIX3 프로젝트의 브라우저 캐싱 무효화 시스템을 분석한 결과, **프로덕션 환경에서는 완벽하게 hash 기반 캐시 무효화가 적용**되어 있으나, **개발 환경 캐싱 문제는 해결되지 않았습니다.**

**핵심 결론:**
- ✅ **프로덕션 빌드**: Hash 기반 캐싱으로 배포 시 즉시 반영
- ❌ **개발 환경**: CSS 변경 후 **여전히 수동 캐시 삭제 필요**
- ⚠️ **HMR 플러그인**: 변경 감지는 작동하지만 실제 브라우저 반영 실패
- ❌ **매번 필수**: Vite dev 캐시 삭제 (`rm -rf node_modules/.vite`) + 브라우저 하드 리프레시 (`Ctrl+Shift+R`)

---

## 🎯 분석 배경

### 참고 문서
- [Vite HMR 캐싱 이슈 및 해결 가이드](https://adjh54.tistory.com/70)
- [React + Vite 캐시 문제 대응 전략](https://hmr.txt)

### 주요 우려사항
1. **파일명 hash 부재 시**: 브라우저가 옛날 JS/CSS 계속 로드
2. **Service Worker 캐싱**: PWA 환경에서 새 코드 반영 안됨
3. **Vite Dev 캐시**: `node_modules/.vite` 캐시로 인한 오류 지속
4. **브라우저 강력 캐싱**: F5로는 반영 안되는 경우

---

## 🔍 분석 결과

### 1. **Production 빌드 - Hash 자동 적용 ✅**

#### 1.1 빌드 파일 확인
```bash
# dist/assets/ 실제 파일들
AccountSettingsView-DwTZuf8S.js     # hash: DwTZuf8S
DocumentSearchView-QnFOKP7v.js      # hash: QnFOKP7v
CustomerAllView-_38II8fW.js         # hash: _38II8fW
style-DpVtKAcz.css                  # hash: DpVtKAcz
```

#### 1.2 index.html 참조 확인
```html
<!-- dist/index.html -->
<script type="module" crossorigin src="/assets/index-BEty5ehk.js"></script>
<link rel="stylesheet" crossorigin href="/assets/style-DpVtKAcz.css">
```

#### 1.3 결론
- Vite 7.1.2가 **자동으로** 모든 파일에 hash 추가
- 코드 변경 시 hash 변경 → 브라우저가 새 파일 자동 로드
- **캐시 무효화 완벽하게 작동 중**

---

### 2. **vite.config.ts 설정 분석**

#### 2.1 변경 전 (암묵적 설정)
```typescript
build: {
  cssCodeSplit: false,
  chunkSizeWarningLimit: 1000
  // rollupOptions.output.entryFileNames 설정 없음
}
```

**문제점:**
- Vite 기본값에 의존 (암묵적)
- 다른 개발자가 캐시 무효화 전략을 명확히 알기 어려움
- 문서화 부재

#### 2.2 변경 후 (명시적 설정) ✅
```typescript
build: {
  cssCodeSplit: false,
  chunkSizeWarningLimit: 1000,
  // 명시적 hash 기반 캐시 무효화 (브라우저 캐싱 방지)
  rollupOptions: {
    output: {
      // 진입점 파일명에 hash 추가 (예: index-BEty5ehk.js)
      entryFileNames: 'assets/[name]-[hash].js',
      // 청크 파일명에 hash 추가 (예: DocumentSearchView-QnFOKP7v.js)
      chunkFileNames: 'assets/[name]-[hash].js',
      // 정적 에셋에 hash 추가 (예: style-DpVtKAcz.css)
      assetFileNames: 'assets/[name]-[hash].[ext]'
    }
  }
}
```

**개선 효과:**
- ✅ 캐시 무효화 전략이 코드에서 명시적으로 보임
- ✅ 다른 개발자가 즉시 이해 가능
- ✅ 유지보수성 향상

**기술적 효과:**
- 실질적 효과는 없음 (Vite 기본값과 동일)
- 코드 가독성과 문서화 측면에서 개선

---

### 3. **개발 환경 캐싱 대응**

#### 3.1 CSS 변경 감지 (반영 실패) ⚠️
```javascript
// vite-plugins/css-reload-plugin.js
export default function cssReloadPlugin() {
  return {
    name: 'css-reload-plugin',
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.css')) {
        console.log(`[CSS-Reload] ${file} changed - triggering full reload`)

        // tokens.css 변경 시 main.tsx 무효화
        if (file.includes('tokens.css')) {
          const mainModule = server.moduleGraph.getModuleById('\0vite/preload-helper.js')
          if (mainModule) {
            server.moduleGraph.invalidateModule(mainModule)
          }
        }

        // 전체 페이지 리로드 강제
        server.ws.send({
          type: 'full-reload',
          path: '*'
        })

        return []
      }
    }
  }
}
```

**플러그인 작동 범위:**
- ✅ CSS 파일 변경 감지 성공
- ✅ HMR WebSocket으로 리로드 명령 전송
- ❌ **브라우저에 실제 반영 실패** (캐시 때문에)

**실제 작동 결과:**
- 변경 감지: 성공 ✅
- 리로드 명령: 전송됨 ✅
- 브라우저 반영: **실패** ❌
- **플러그인 무용지물**

#### 3.2 미해결 이슈 ❌
1. **Vite dev server 캐시** (치명적)
   - `node_modules/.vite` 캐시가 변경사항 무시
   - **매번 수동 삭제 필수**: `rm -rf node_modules/.vite && npm run dev`
   - HMR 플러그인으로 해결 불가능

2. **브라우저 강력 캐싱** (치명적)
   - F5 새로고침으로 반영 안됨
   - **매번 하드 리프레시 필수**: `Ctrl+Shift+R`
   - HMR 플러그인으로 해결 불가능

**결론: 개발 환경 캐싱 문제 미해결**

---

### 4. **Service Worker (PWA) 확인**

#### 4.1 검색 결과
```bash
# Service Worker 파일 검색
find . -name "service-worker*.{js,ts}"
# 결과: No files found
```

#### 4.2 Web Manifest 확인
```bash
# Web Manifest 존재 확인
./public/site.webmanifest  ← 존재
./dist/site.webmanifest     ← 빌드 시 복사됨
```

#### 4.3 결론
- ✅ Service Worker 미사용 → PWA 캐시 문제 없음
- Web Manifest는 존재하지만 Service Worker 없이는 캐싱 이슈 없음

---

## 📊 캐시 무효화 시나리오별 대응 현황

| 시나리오 | 현재 상태 | 대응 방법 | 자동화 여부 |
|---------|----------|----------|-----------|
| **프로덕션 배포 후 브라우저가 옛날 JS 로드** | ✅ 해결됨 | hash 변경으로 자동 새 파일 로드 | ✅ 자동 |
| **프로덕션 배포 후 브라우저가 옛날 CSS 로드** | ✅ 해결됨 | hash 변경으로 자동 새 파일 로드 | ✅ 자동 |
| **CSS 변경 후 개발 서버에 반영 안됨** | ❌ **미해결** | css-reload-plugin 변경 감지만 함 | ❌ **수동** |
| **tokens.css 변경 후 반영 안됨** | ❌ **미해결** | 모듈 무효화 실패 | ❌ **수동** |
| **Vite dev server 캐시 문제** | ❌ **미해결** | `rm -rf node_modules/.vite` **매번 필요** | ❌ 수동 |
| **브라우저 강력 캐싱** | ❌ **미해결** | `Ctrl+Shift+R` **매번 필요** | ❌ 수동 |
| **Service Worker PWA 캐싱** | ✅ 해당없음 | Service Worker 미사용 | - |

---

## 🎯 참고 문서 권장사항 준수 여부

### 권장사항 체크리스트

| 항목 | 권장사항 | aims-uix3 상태 | 비고 |
|-----|---------|--------------|------|
| **1. 파일명 hash 추가** | `entryFileNames: '[name].[hash].js'` | ✅ 자동 적용 | Vite 7.1.2 기본값 |
| **2. index.html 매 배포 교체** | 배포마다 index.html 새로 생성 | ✅ 자동 교체 | Vite 빌드 시 자동 생성 |
| **3. Service Worker 버전 관리** | `skipWaiting()` 적용 | ✅ 해당없음 | Service Worker 미사용 |
| **4. Vite dev 캐시 삭제** | `rm -rf node_modules/.vite` | ⚠️ 수동 필요 | 자동화 안됨 |
| **5. 브라우저 강력 새로고침** | `Ctrl+Shift+R` 사용 | ⚠️ 수동 필요 | 사용자 액션 필요 |

---

## 💡 개선 권장사항

### 1. **개발 환경 캐시 자동 삭제 (선택사항)**

**현재 문제:**
- `node_modules/.vite` 캐시를 수동으로 삭제해야 함

**해결 방안 A: npm script 추가**
```json
// package.json
{
  "scripts": {
    "dev:clean": "npm run clean && vite",
    "clean": "rm -rf node_modules/.vite dist .vite"
  }
}
```

**해결 방안 B: 개발 시작 시 자동 삭제 (신중히 결정)**
```javascript
// vite-plugins/clean-cache-plugin.js
export default function cleanCachePlugin() {
  return {
    name: 'clean-cache-plugin',
    buildStart() {
      // 개발 서버 시작 시 캐시 삭제 (성능 트레이드오프 주의)
      const fs = require('fs')
      const path = require('path')

      const cacheDir = path.resolve(__dirname, '../node_modules/.vite')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
        console.log('[Clean Cache] Vite cache cleared')
      }
    }
  }
}
```

**주의사항:**
- 자동 삭제는 개발 서버 시작 시간을 늘림
- 트레이드오프 고려 필요

### 2. **브라우저 캐시 정책 명시 (선택사항)**

**HTTP 헤더 설정 (배포 서버):**
```nginx
# nginx 설정 예시
location /assets/ {
  # hash가 있는 파일은 영구 캐싱
  add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
  # index.html은 항상 최신 확인
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  add_header Pragma "no-cache";
  add_header Expires "0";
}
```

---

## 📈 성능 영향 분석

### 1. **프로덕션 빌드 크기**
```bash
# 현재 빌드 결과
dist/assets/style-DpVtKAcz.css           514.05 kB │ gzip:  67.93 kB
dist/assets/index-BEty5ehk.js            357.93 kB │ gzip: 108.64 kB
dist/assets/pdf-Bng9zr6N.js              350.51 kB │ gzip: 104.05 kB
dist/assets/pdf.worker.min--PgD6g2g.mjs  1,035.02 kB (외부 의존성)
```

**hash 추가로 인한 영향:**
- 파일 크기: 영향 없음 (hash는 파일명에만 추가)
- 네트워크 전송: 동일
- 로드 속도: 동일

### 2. **브라우저 캐싱 효율**
- **이전 방문 사용자**: 변경된 파일만 다운로드 (hash 비교)
- **캐시 히트율**: 변경되지 않은 청크는 100% 캐시 히트
- **초기 로드**: 캐시 없음, 전체 다운로드

### 3. **개발 환경 성능**
- **HMR 속도**: css-reload-plugin으로 인해 전체 리로드 (빠름)
- **빌드 속도**: 영향 없음

---

## 🔧 유지보수 가이드

### 개발자를 위한 캐시 문제 해결 순서

#### 문제: "코드 변경했는데 브라우저에 반영 안됨"

**1단계: 브라우저 캐시 확인**
```bash
# 크롬 브라우저에서
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

**2단계: Vite dev 캐시 삭제**
```bash
cd frontend/aims-uix3
rm -rf node_modules/.vite
npm run dev
```

**3단계: 전체 재설치 (최후 수단)**
```bash
cd frontend/aims-uix3
rm -rf node_modules dist .vite
npm install
npm run dev
```

### 배포 시 체크리스트

- [ ] `npm run build` 실행
- [ ] `dist/assets/` 파일들에 hash 확인
- [ ] `dist/index.html`에 hash 포함된 경로 확인
- [ ] 배포 후 브라우저에서 Ctrl+Shift+R로 강제 새로고침
- [ ] 개발자 도구 → Network 탭에서 새 파일 로드 확인

---

## 📚 참고 자료

### 내부 문서
- [vite.config.ts](../frontend/aims-uix3/vite.config.ts)
- [css-reload-plugin.js](../frontend/aims-uix3/vite-plugins/css-reload-plugin.js)
- [package.json](../frontend/aims-uix3/package.json)

### 외부 참고
- [Vite 공식 문서 - Asset Handling](https://vitejs.dev/guide/assets.html)
- [Vite 공식 문서 - Build Production](https://vitejs.dev/guide/build.html)
- [MDN - HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)

---

## 📝 변경 이력

| 날짜 | 변경 내용 | 작성자 |
|------|----------|--------|
| 2025-11-10 | 초안 작성 및 vite.config.ts 명시적 hash 설정 추가 | Claude Code |

---

## ⚠️ 최종 결론 (수정)

### 프로덕션 환경: 완벽 ✅
- Hash 기반 캐시 무효화 정상 작동
- 배포 시 즉시 반영
- 추가 작업 불필요

### 개발 환경: 해결 안됨 ❌
- CSS 변경 감지: 작동 ✅
- 실제 브라우저 반영: **실패** ❌
- **매번 수동 대응 필수**: Vite 캐시 삭제 + 서버 재시작 + 브라우저 하드 리프레시
- HMR 플러그인: 무용지물

### 종합 평가: 개발 환경 캐싱 미해결 ⭐⭐
프로덕션은 완벽하지만, **개발 환경에서 CSS 변경이 즉시 반영되지 않는 치명적 문제**가 남아있습니다.

**개발자는 여전히 매번 수동 캐시 삭제가 필요합니다.**

---

**본 문서는 AIMS 프로젝트의 캐시 무효화 시스템에 대한 공식 분석 보고서입니다.**
