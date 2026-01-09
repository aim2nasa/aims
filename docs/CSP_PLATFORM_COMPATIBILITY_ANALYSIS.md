# AIMS 플랫폼 호환성 및 CSP 분석 보고서

> 작성일: 2026-01-09
> 발단: iPad In-App Browser에서 고객 등록 기능 에러 발생

---

## 1. 발생한 문제

### 에러 상세
```
EvalError: Refused to evaluate a string as JavaScript because 'unsafe-eval'
is not an allowed source of script in the following Content Security Policy
directive: "default-src x-apple-ql-id: 'unsafe-inline'".
```

### 발생 환경
- **기기**: iPad
- **브라우저**: Safari View Controller (In-App Browser)
- **URL**: https://aims.giize.com/?view=customers-register
- **기능**: 새 고객 등록

### 원인 분석
Apple의 **Quick Look / Safari View Controller** 환경은 일반 Safari보다 엄격한 CSP(Content Security Policy)를 적용합니다.

`x-apple-ql-id:` 프로토콜은 Apple의 Quick Look 미리보기 환경을 의미하며, 이 환경에서는:
- `eval()` 완전 차단
- `new Function()` 완전 차단
- `unsafe-eval` CSP 지시문 무시됨

---

## 2. 근본 원인: zod 4.x

### 문제 코드 위치
```javascript
// node_modules/zod/v4/core/doc.js
class Doc {
  compile() {
    const F = Function;  // Function 생성자 참조
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join("\n"));  // ← CSP 위반!
  }
}
```

### 영향 범위
- **위치**: 메인 번들 (`index-*.js`)에 포함
- **영향**: **모든 페이지**에서 로드됨
- **결과**: In-App Browser 환경에서 AIMS 전체 기능 사용 불가

### 해결책
**zod 4.1.8 → zod 3.24.1 다운그레이드**

zod 3.x는 `Doc` 클래스가 없으므로 CSP 문제가 발생하지 않습니다.

```json
// package.json 변경
{
  "dependencies": {
    "zod": "^3.24.1"  // 기존: "^4.1.8"
  }
}
```

### 호환성 검증 완료
프로젝트의 모든 zod 스키마 파일 분석 결과, 사용된 기능:
- `z.object`, `z.string`, `z.enum`, `z.array`, `z.preprocess`
- `.partial()`, `.omit()`, `.passthrough()`
- `.safeParse()`, `.parse()`, `z.infer<>`

**→ 모두 zod 3.x에서 동일하게 지원됨. 코드 수정 불필요.**

---

## 3. 전체 플랫폼 호환성 분석

### 3.1 지원 대상 환경

| 플랫폼 | 브라우저/환경 | 우선순위 |
|--------|--------------|----------|
| **PC** | Chrome, Safari, Firefox, Edge | 필수 |
| **iPad** | Safari, In-App Browser | 필수 |
| **iPhone** | Safari, In-App Browser | 필수 |
| **Android** | Chrome, In-App Browser | 필수 |

### 3.2 CSP 위험 분석 (eval/new Function 사용)

| 라이브러리 | eval/Function 사용 | 상태 | 영향 범위 |
|-----------|-------------------|------|----------|
| axios | ❌ | ✅ 안전 | - |
| react | ❌ | ✅ 안전 | - |
| react-dom | ❌ | ✅ 안전 | - |
| react-router-dom | ❌ | ✅ 안전 | - |
| xlsx | ❌ | ✅ 안전 | - |
| zustand | ❌ | ✅ 안전 | - |
| **zod 4.x** | ✅ `Doc.compile()` | ⚠️ **위험** | **모든 페이지** |
| **pdfjs-dist** | ✅ 다수 | ⚠️ 잠재적 위험 | PDF 뷰어만 |

### 3.3 pdfjs-dist 상세 분석

**현재 상태:**
- 별도 청크 (`pdf-*.js`)로 분리됨
- PDF 보기 기능에서만 동적 로드
- Quick Look 환경에서 PDF 뷰어 사용 시 문제 발생 가능

**권장 조치:**
- 현재는 문제 없음 (메인 번들에 포함 안 됨)
- 향후 PDF 뷰어를 In-App Browser에서 사용해야 한다면:
  - `<iframe>` 방식으로 PDF 표시
  - 또는 서버사이드 PDF 렌더링 고려

### 3.4 기타 Web API 호환성

| API | 사용 여부 | 안전 처리 | 비고 |
|-----|----------|----------|------|
| `navigator.clipboard` | ✅ | ✅ try-catch 처리 | HTTPS 필수 |
| `navigator.vibrate` | ✅ | ✅ isSupported() 체크 | iOS Safari 미지원 |
| `localStorage` | ✅ | ⚠️ 일부만 보호 | 프라이빗 모드 주의 |

### 3.5 빌드 타겟 분석

**현재 설정:**
- Vite 7.x 기본값 사용 (ES2020 타겟)
- browserslist 미설정

**지원 브라우저:**
- Chrome 87+ (2020.11)
- Safari 14+ (2020.09)
- Firefox 78+ (2020.06)
- Edge 88+ (2021.01)

**권장 조치:**
- 현재 설정으로 대부분의 현대 브라우저 지원됨
- iOS 14+, Android 10+ 대응 가능
- 필요시 `vite.config.ts`에 명시적 타겟 설정 추가

---

## 4. 수정 계획

### 4.1 즉시 수정 필요 (Critical)

**zod 다운그레이드**
```bash
cd frontend/aims-uix3
# package.json에서 zod 버전 변경 후
rm -rf node_modules package-lock.json .vite
npm install
npm run build
```

### 4.2 검증 절차

```bash
# 빌드 후 메인 번들에서 new Function 사용 확인
grep -l "new Function" dist/assets/index-*.js
# 결과: 없어야 함

# pdf 청크만 Function 사용해야 함
grep -l "Function(" dist/assets/*.js
# 결과: pdf-*.js만 나와야 함
```

### 4.3 배포 및 테스트

```bash
# 서버 배포
ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'
```

**테스트 체크리스트:**
- [ ] PC Chrome에서 고객 등록
- [ ] PC Safari에서 고객 등록
- [ ] iPad Safari에서 직접 접속 → 고객 등록
- [ ] iPad 카카오톡에서 링크 탭 → In-App Browser에서 고객 등록
- [ ] iPad 메일 앱에서 링크 탭 → In-App Browser에서 고객 등록
- [ ] iPhone Safari에서 고객 등록
- [ ] iPhone In-App Browser에서 고객 등록

---

## 5. 향후 권장사항

### 5.1 의존성 관리

새로운 npm 패키지 추가 시 CSP 호환성 확인:
```bash
# 패키지 설치 전 eval/Function 사용 여부 확인
npm pack <package-name> --dry-run
tar -xzf <package>.tgz
grep -rn "new Function\|eval(" package/
```

### 5.2 CI/CD 파이프라인 추가

빌드 후 자동 검증 스크립트:
```bash
#!/bin/bash
# check-csp-safety.sh
UNSAFE_FILES=$(grep -l "new Function\|eval(" dist/assets/index-*.js 2>/dev/null)
if [ -n "$UNSAFE_FILES" ]; then
  echo "❌ CSP unsafe code detected in main bundle!"
  echo "$UNSAFE_FILES"
  exit 1
fi
echo "✅ CSP check passed"
```

### 5.3 에러 모니터링

프론트엔드 에러 리포터에 CSP 위반 감지 추가:
```javascript
document.addEventListener('securitypolicyviolation', (e) => {
  errorReporter.report({
    type: 'CSP_VIOLATION',
    directive: e.violatedDirective,
    blockedURI: e.blockedURI,
    sourceFile: e.sourceFile,
  });
});
```

---

## 6. 결론

| 항목 | 상태 | 조치 |
|------|------|------|
| zod 4.x CSP 문제 | 🔴 Critical | **즉시 다운그레이드 필요** |
| pdfjs-dist CSP 문제 | 🟡 Low | 별도 청크로 분리되어 있음, 모니터링 |
| 기타 라이브러리 | 🟢 Safe | 문제 없음 |
| 브라우저 호환성 | 🟢 Safe | 현대 브라우저 모두 지원 |
| Web API 호환성 | 🟢 Safe | 적절한 폴백 처리됨 |

**즉시 조치 필요: zod 4.1.8 → 3.24.1 다운그레이드**
