# PDF Worker MIME Type 이슈 해결 가이드

## 📋 문제 요약

**증상:**
- 개발 서버(localhost:5173)에서는 PDF 프리뷰가 정상 작동
- 프로덕션(aims.giize.com)에서는 PDF 프리뷰 실패
- 브라우저 콘솔 오류:
  ```
  Setting up fake worker failed: "Failed to fetch dynamically imported module:
  https://aims.giize.com/assets/pdf.worker.min--PgD6g2g.mjs"
  ```

**발생 원인:**
- nginx가 `.mjs` 파일을 잘못된 MIME type으로 서빙
- 실제 서빙: `Content-Type: application/octet-stream`
- 올바른 타입: `Content-Type: application/javascript`
- JavaScript 모듈은 올바른 MIME type이 없으면 브라우저가 로드를 거부

## 🔍 문제 진단 방법

### 1. 파일 존재 확인
```bash
ssh tars.giize.com
ls -lh ~/aims/frontend/aims-uix3/dist/assets/pdf.worker*
```

예상 결과:
```
-rw-r--r-- 1 rossi rossi 1011K Nov 24 13:24 pdf.worker.min--PgD6g2g.mjs
```

### 2. HTTP 헤더 확인
```bash
curl -I https://aims.giize.com/assets/pdf.worker.min--PgD6g2g.mjs
```

**문제가 있는 경우:**
```
HTTP/2 200
content-type: application/octet-stream  ❌ 잘못됨
```

**정상인 경우:**
```
HTTP/2 200
content-type: application/javascript  ✅ 올바름
```

### 3. 브라우저에서 확인
1. Chrome DevTools 열기 (F12)
2. Network 탭 → .mjs 파일 찾기
3. Headers → Response Headers → Content-Type 확인

## ✅ 해결 방법

### 방법 1: nginx 전역 MIME types 수정 (권장)

**이 방법의 장점:**
- ✅ 모든 사이트에 적용되어 일관성 유지
- ✅ 영구적인 해결책
- ✅ 향후 동일 문제 재발 방지

**실행 단계:**

1. **tars 서버 접속**
   ```bash
   ssh tars.giize.com
   ```

2. **mime.types 파일 수정**
   ```bash
   sudo nano /etc/nginx/mime.types
   ```

3. **8번째 줄 수정**

   **수정 전:**
   ```nginx
   application/javascript                           js;
   ```

   **수정 후:**
   ```nginx
   application/javascript                           js mjs;
   ```

4. **설정 테스트**
   ```bash
   sudo nginx -t
   ```

   예상 출력:
   ```
   nginx: configuration file /etc/nginx/nginx.conf test is successful
   ```

5. **nginx 재로드**
   ```bash
   sudo systemctl reload nginx
   ```

6. **확인**
   ```bash
   curl -I https://aims.giize.com/assets/pdf.worker.min--PgD6g2g.mjs | grep content-type
   ```

   예상 결과:
   ```
   content-type: application/javascript
   ```

### 방법 2: 개별 사이트 설정 수정 (임시방편)

**이 방법은 권장하지 않음** - 다른 사이트에서 동일 문제 재발 가능

```nginx
# /etc/nginx/sites-available/aims 파일에 추가
location / {
    root /var/www/aims;
    try_files $uri $uri/ /index.html;

    # .mjs 파일을 JavaScript로 서빙
    location ~* \.mjs$ {
        types { application/javascript mjs; }
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 기존 캐싱 설정...
}
```

## 🧪 테스트 방법

### 1. 브라우저 캐시 완전 삭제
- Chrome: Ctrl+Shift+Delete → "전체 기간" → "캐시된 이미지 및 파일" 체크 → 삭제

### 2. 하드 리프레시
- Chrome/Edge: Ctrl+Shift+R
- Firefox: Ctrl+F5

### 3. PDF 프리뷰 테스트
1. https://aims.giize.com 접속
2. 문서 라이브러리 → PDF 문서 클릭
3. 우측 프리뷰 패널에 PDF 렌더링 확인

### 4. 개발자 도구 확인
- Network 탭에서 `pdf.worker.min--*.mjs` 파일
- Status: 200
- Type: `application/javascript` 또는 `script`
- ❌ `application/octet-stream`이 아님

## 🔧 기술적 배경

### .mjs 파일이란?
- ES Module 형식의 JavaScript 파일
- `import`/`export` 문법 사용
- Node.js와 브라우저에서 모듈로 인식되도록 `.mjs` 확장자 사용

### 왜 MIME type이 중요한가?
- 브라우저는 보안상 이유로 JavaScript 모듈의 MIME type을 엄격히 검사
- `application/octet-stream`은 "다운로드할 바이너리 파일"로 인식
- `application/javascript`만 실행 가능한 스크립트로 인식

### Vite 빌드와의 관계
- Vite는 code splitting 시 `.mjs` 파일 생성
- pdf.js worker는 별도 chunk로 분리되어 `.mjs`로 빌드됨
- 개발 서버는 올바른 MIME type으로 서빙하지만, nginx는 기본 설정 필요

## 📊 영향 범위

**이 설정이 필요한 경우:**
- PDF.js 사용 (react-pdf, pdfjs-dist)
- Dynamic import 사용하는 대형 라이브러리
- Web Workers를 별도 모듈로 분리
- Vite/Webpack에서 `.mjs` chunk 생성

**영향받는 프로젝트:**
- AIMS UIX3 (현재)
- 향후 모든 Vite 기반 프로젝트

## 📝 체크리스트

배포 전 확인사항:
- [ ] 로컬 빌드 성공 (`npm run build`)
- [ ] `dist/assets/pdf.worker*.mjs` 파일 존재 확인
- [ ] tars 서버에 파일 배포 완료
- [ ] nginx mime.types에 `.mjs` 추가 완료
- [ ] nginx 설정 테스트 성공 (`sudo nginx -t`)
- [ ] nginx 재로드 완료 (`sudo systemctl reload nginx`)
- [ ] HTTP 헤더 확인 (Content-Type: application/javascript)
- [ ] 브라우저 캐시 삭제 후 테스트
- [ ] PDF 프리뷰 정상 작동 확인

## 🚨 트러블슈팅

### Q: nginx 재로드 후에도 여전히 octet-stream으로 나옴
**A:** 브라우저 캐시 문제. Ctrl+Shift+Delete로 완전 삭제 후 재시도

### Q: mime.types 파일 수정 권한 없음
**A:** `sudo` 필요. SSH 키 인증이 아닌 비밀번호 입력 필요

### Q: 다른 .mjs 파일도 같은 문제가 생길 수 있나?
**A:** 예. 이 해결책은 모든 .mjs 파일에 적용되므로 근본적으로 해결됨

### Q: 개발 서버에서는 왜 문제가 없나?
**A:** Vite dev server가 자동으로 올바른 MIME type 설정. nginx만 명시적 설정 필요

## 📚 관련 문서

- [Nginx MIME Types](http://nginx.org/en/docs/http/ngx_http_core_module.html#types)
- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [PDF.js Worker](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#worker)
- [Vite Build Options](https://vitejs.dev/config/build-options.html)

## 📅 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
| 2025-11-24 | 초안 작성 - PDF worker MIME type 이슈 및 해결책 | Claude |

---

**주의:** 이 문서는 프로덕션 환경 문제 해결을 위한 것입니다. 테스트 서버에서 먼저 검증 후 프로덕션에 적용하세요.
