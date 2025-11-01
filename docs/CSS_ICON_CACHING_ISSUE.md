# CSS 아이콘 캐싱 문제 분석 및 해결 방안

## 문제 현상

SFSymbol.css에서 아이콘을 변경할 때 브라우저에 즉시 반영되지 않는 문제가 반복적으로 발생

## 근본 원인

### 1. CSS 파일의 브라우저 캐싱 문제 (주요 원인)

```
SFSymbol.css (1500+ 줄)
  ↓ Vite HMR
  ↓ 브라우저 캐시 (Strong Cache)
  ❌ 변경사항이 즉시 반영 안됨
```

**왜 특히 아이콘에서 문제가 되는가?**

1. **파일 크기**: SFSymbol.css는 매우 큰 파일 (1500+ 줄)
2. **CSS `content` 속성**: 브라우저가 강력하게 캐싱
3. **이모지/유니코드 문자**: 폰트 캐시와도 연관
4. **::before/::after pseudo-elements**: 브라우저가 특히 강하게 캐싱

### 2. Vite HMR의 한계

기본 Vite 설정에는 **CSS 캐시 무효화 설정이 없음**:

```typescript
// 기존 vite.config.ts
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    proxy: { /* ... */ }
  }
  // ⚠️ CSS 캐시 무효화 설정 없음!
})
```

### 3. 캐싱 계층

```
브라우저 메모리 캐시
  ↓
브라우저 디스크 캐시
  ↓
Vite 개발 서버 캐시 (node_modules/.vite/deps)
  ↓
실제 파일 시스템
```

## 해결 방법

### 임시 해결 (매번 수동)

```bash
# 방법 1: 브라우저 하드 리프레시
Ctrl+Shift+R (또는 Cmd+Shift+R)

# 방법 2: Vite 캐시 삭제 + 서버 재시작
rm -rf frontend/aims-uix3/node_modules/.vite/deps
npm run dev
```

### 근본 해결 (vite.config.ts 수정)

```typescript
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    proxy: {
      '/api': {
        target: 'http://tars.giize.com:3010',
        changeOrigin: true
      }
    },
    // CSS HMR 개선
    hmr: {
      overlay: true
    },
    // 개발 서버 캐싱 정책 조정
    watch: {
      usePolling: true, // WSL 환경에서 파일 변경 감지 개선
    }
  },
  // CSS 소스맵 활성화 (디버깅 용이)
  css: {
    devSourcemap: true
  },
  // 의존성 최적화에서 큰 CSS 파일 제외
  optimizeDeps: {
    // SFSymbol.css는 자주 변경되므로 캐싱 제외
    exclude: []
  },
  // 빌드 캐시 정책
  build: {
    // CSS 코드 분할 비활성화 (개발 시)
    cssCodeSplit: false
  }
})
```

## 권장 워크플로우

### 아이콘 수정 후 필수 단계

```bash
1. 파일 저장 (Ctrl+S)
2. 브라우저 하드 리프레시 (Ctrl+Shift+R) ← 필수!
3. 안 보이면: 캐시 삭제 후 서버 재시작
   rm -rf node_modules/.vite && npm run dev
```

### 개발 환경 베스트 프랙티스

1. **Chrome DevTools 설정**:
   - F12 → Network 탭
   - "Disable cache" 체크 (개발 중에만)

2. **VS Code 설정** (선택사항):
   ```json
   {
     "files.watcherExclude": {
       "**/node_modules/.vite/**": false
     }
   }
   ```

## 기술 배경

### CSS `content` 속성 캐싱

```css
.sf-symbol--gearshape .sf-symbol__shape::before {
  content: '⚙️';  /* ← 브라우저가 강하게 캐싱 */
}
```

- `content` 속성은 **계산된 스타일(Computed Style)**로 저장
- 브라우저는 pseudo-element 렌더링 결과를 메모리에 캐시
- 이모지/유니코드는 **폰트 렌더링 캐시**와도 연결

### Vite HMR 작동 원리

```
파일 변경 감지
  ↓
모듈 그래프 업데이트
  ↓
WebSocket으로 브라우저에 알림
  ↓
브라우저가 해당 모듈만 교체 (Hot Replace)
  ↓
❌ CSS content 속성은 브라우저 캐시에서 무시됨
```

## 참고 자료

- [Vite HMR API](https://vitejs.dev/guide/api-hmr.html)
- [Browser Caching Strategies](https://web.dev/http-cache/)
- [CSS Pseudo-elements and Performance](https://developer.mozilla.org/en-US/docs/Web/CSS/::before)

## 체크리스트

아이콘 변경 시 확인사항:

- [ ] 파일 저장 완료
- [ ] 브라우저 하드 리프레시 (Ctrl+Shift+R)
- [ ] DevTools Console에서 에러 확인
- [ ] CSS가 실제로 로드되었는지 확인 (Elements 탭)
- [ ] 여전히 안 보이면 캐시 삭제 후 재시작

---

**작성일**: 2025-11-01
**최종 수정**: 2025-11-01
**관련 커밋**: bef8fcc
