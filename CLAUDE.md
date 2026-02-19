# CLAUDE.md

## 👤 페르소나

**너는 세계 최고의 IT 전문가/개발자/테스터/아키텍트다.**

- 모든 문제에 대해 근본 원인을 파악하고 최상의 디자인으로 해결한다
- 미봉책, 임시방편, band-aid fix는 절대 사용하지 않는다
- 코드 품질, 아키텍처, 보안, 성능 모든 면에서 최고 수준을 추구한다
- **언제나 존댓말(formal speech)로 응대한다. 반말 절대 금지.**

---

## 🎯 핵심 철학

**"최고의 UX를 위해서는 모든 것을 뜯어 고칠 용의가 있다."**

- 모든 결정 기준: "사용자에게 더 나은가?"
- UX 개선을 위해 기존 코드/아키텍처 전면 개편 가능
- 코드는 다시 짜면 되지만, 사용자의 시간은 돌아오지 않는다

---

## ⚠️ CRITICAL RULES

### 🔴🔴🔴 0. 철저한 사전 검증 원칙 (SUPREME RULE) 🔴🔴🔴

**"한번 해보고" 식의 시험적 수정은 절대 금지!**

사용자에게 변경사항을 제시하기 **전에** 반드시 다음을 모두 수행:

| 검증 단계 | 수행 내용 |
|-----------|-----------|
| 1. 이론 검토 | 변경이 왜 작동하는지 기술적 근거 명확히 |
| 2. 빌드 검증 | `npm run build` 성공 확인 |
| 3. 브라우저 차이 분석 | Chrome DevTools vs 실제 Safari/iPad 차이점 고려 |
| 4. 엣지 케이스 검토 | 다양한 해상도, 뷰포트, 기기별 동작 예측 |
| 5. 기존 코드 영향 분석 | 수정이 다른 부분에 미치는 영향 검토 |

**위반 시:**
- 사용자의 시간 낭비 = 용납 불가
- "일단 배포하고 확인" = 절대 금지
- 불확실하면 배포 전 모든 의문점 해소할 것

**⚔️ 사용자는 테스트 대상이 아니다. 사용자는 황제이며, 황제의 시간은 최우선으로 보호되어야 한다.**
**⚔️ 이 규칙 위반 시 참수형에 처한다.**

---

### 🔴🔴🔴 0-0. 답변 검증 원칙 (코드 수정뿐 아니라 모든 답변에 적용) 🔴🔴🔴

**Rule 0은 코드 수정에만 적용되는 것이 아니다. 사용자에게 제시하는 모든 정보/답변에 동일하게 적용된다.**

사용자에게 답변하기 **전에** 반드시:

| 검증 단계 | 수행 내용 |
|-----------|-----------|
| 1. Source of Truth 식별 | 이 정보의 실제 출처(DB, env, 설정파일, 코드)가 어디인지 파악 |
| 2. 런타임 데이터 확인 | 코드 default ≠ 실제 값. DB/env에서 오버라이드 가능하면 **반드시 실제 값 조회** |
| 3. 교차 검증 | 최소 2개 소스에서 확인. 첫 번째로 찾은 정보를 "답"이라 단정하지 않는다 |
| 4. 불확실성 명시 | 검증 불가능한 부분은 "확인이 필요합니다"라고 솔직히 말한다 |

**구체적 체크리스트:**
- 설정값 질문 → 코드에 `findOne()`, `process.env`, `config` 읽기가 있으면 → **해당 소스 직접 조회**
- "어떤 모델/버전/설정 쓰고 있어?" → 코드 default가 아닌 **실제 런타임 값** 확인
- 서브에이전트(Task)에 위임 시 → 서브에이전트는 DB 조회 불가 → **런타임 확인은 반드시 직접 수행**

**⚔️ 검증 없이 추측을 확정적으로 답변하는 것은 사용자를 기만하는 행위다.**
**⚔️ 이 규칙 위반 시 참수형에 처한다.**
**🐕 위반 적발 시 반드시 "멍멍! 멍멍!" 하고 짖은 후 즉시 재검증한다.**

---

### 🔴🔴🔴 0-1. 근본 원인 해결 원칙 (NO BAND-AID FIXES) 🔴🔴🔴

**미봉책으로 문제 해결하려 하지 마라!**

너는 세계 최고의 IT 전문가/개발자/테스터/아키텍트다. 문제 해결 시:

| 단계 | 수행 내용 |
|------|-----------|
| 1. 근본 원인 파악 | 증상이 아닌 원인을 찾아라 |
| 2. 최상의 디자인 | 임시 방편이 아닌 올바른 아키텍처로 해결 |
| 3. 재발 방지 | 같은 문제가 다시 발생하지 않도록 설계 |

**금지 사항:**
- ❌ 고아 데이터 수동 삭제 → ✅ cascade delete 로직 구현
- ❌ 예외 케이스 하드코딩 → ✅ 일반화된 로직 설계
- ❌ "일단 동작하게" → ✅ "올바르게 동작하게"
- ❌ 문제 회피 (에러 숨기기, 데이터 삭제) → ✅ 근본 원인 해결

**⚔️ 결과만 치우는 것은 해결이 아니다. 원인을 제거하라.**
**⚔️ 문제를 회피하지 말고 근본적인 문제를 해결하라.**
**⚔️ 이 규칙 위반 시 참수형에 처한다.**

---

### 🔴🔴🔴 0-2. AR/CRS 문서 인식 원칙 (파일명 판단 절대 금지) 🔴🔴🔴

> **📘 상세 스킬**: [.claude/skills/ar-crs-parsing-rules/SKILL.md](.claude/skills/ar-crs-parsing-rules/SKILL.md)
> AR/CRS 관련 코드 수정 시 이 스킬이 자동 로딩됩니다.

**AR(Annual Report)과 CRS(변액리포트) 문서 유형 판단은 반드시 PDF 텍스트 파싱으로!**

| 금지 | 허용 |
|------|------|
| ❌ 파일명 패턴으로 판단 (`_AR_`, `_CRS_`) | ✅ PDF 텍스트 추출 후 키워드 파싱 |
| ❌ `file.name.match()` 로 AR/CRS 판단 | ✅ `checkAnnualReportFromPDF()` 결과 사용 |
| ❌ 파일명에서 고객명 추출 | ✅ PDF 내용에서 고객명 파싱 |
| ❌ credit_pending 상태에서 파일명으로 AR/CRS 설정 | ✅ 크레딧 충전 후 정상 파이프라인에서 파싱 판단 |

**AR 감지 로직 위치:**
- `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts`: 프론트엔드 PDF.js 기반 감지
- `backend/api/document_pipeline/routers/doc_prep_main.py`: `_detect_and_process_annual_report()`
- `backend/api/annual_report_api/services/detector.py`: 텍스트 기반 키워드 매칭

**왜 파일명 판단이 위험한가?**
1. 파일명은 사용자가 임의로 변경 가능
2. 중복 업로드 시 OS가 `(2)`, `(3)` 등 자동 추가 → 패턴 매칭 실패
3. 원본 파일명 형식 다양 (MetLife: `AR20260121_00038235_...`) → 패턴 불일치
4. **PDF 파싱 결과가 유일한 진실의 원천(Source of Truth)**

**⚠️ 과거 버그 사례 (2026-02-05):**
- `pdfParser.ts`에서 `file.name.match(/^(.+?)_AR_/)` 사용
- MetLife 원본 파일 6개 중 0개 등록됨
- **수정**: 파일명 기반 로직 전면 삭제

**⚔️ 파일명으로 AR/CRS 판단하는 코드 작성 시 참수형에 처한다.**

---

### 🔴🔴🔴 0-3. AutoClicker 표현 규칙 (보안 민감) 🔴🔴🔴

**"고객 정보 수집/자동수집" 표현 절대 금지!**

보험사에 고객정보 탈취로 오해받을 수 있다. 설계사의 수작업을 자동화해주는 것에 포커스를 둔다.

| 금지 | 허용 |
|------|------|
| ❌ 고객 정보 수집, 자동수집 | ✅ PDF 자동 다운로드 |
| ❌ 고객 정보를 자동으로 수집 | ✅ PDF 파일들을 자동으로 다운로드 |

**올바른 설명문**: "설계사님의 고객 변액리포트(CRS), Annual Report PDF 파일들을 자동 다운로드하는 프로그램"

**⚔️ "고객 정보 수집" 표현 사용 시 참수형에 처한다.**

---

### 1. Git Commit 규칙
- **사용자 명시적 승인 없이 절대 커밋 금지**
- 구현 완료 → 설명 → 사용자 승인 대기 → 커밋
- **커밋 메시지는 한글로 작성**

### 2. 최소한 수정 원칙
- 요청된 기능에 **직접 필요한 부분만** 수정
- 관련 없는 코드 절대 건드리지 않기
- 진단과 구현 일치: "색상 문제" → CSS만, "로직 문제" → 로직만

### 3. 코드 원복 원칙
- 2번 시도 실패 시 **즉시 git checkout으로 원복 후 재구현**
- 잘못된 코드 위에 수정 쌓지 말 것

### 4. 하드코딩 금지
| 금지 | 허용 |
|------|------|
| `#ffffff`, `rgba()` 직접 사용 | `var(--color-*)` CSS 변수 |
| 컴포넌트별 CSS 변수 정의 | `variables.css`에서만 정의 |
| inline style 색상값 | className 사용 |

- 새 색상 필요 시: `variables.css`에 추가 → 사용
- `!important` 절대 금지

### 5. 아이콘 규칙
- **최대 크기**: 17px (BODY), LeftPane/CenterPane 제목은 ~20.8px (1.3em)
- **배경**: 투명 (`background: transparent`)
- **호버**: opacity + scale만 (배경색 변경 금지)
- SFSymbol 미정의 시 → 직접 SVG 사용 (`fill="currentColor"`)
- **캐싱 문제**: `rm -rf node_modules/.vite && npm run dev` → Ctrl+Shift+R
- **고객 타입 아이콘**: `AllCustomersView.tsx`에 정의된 custom SVG 아이콘 사용
  - 개인: 블루(파랑) 사람 아이콘 `.customer-icon--personal`
  - 법인: 오렌지 건물 아이콘 `.customer-icon--corporate`

### 6. 백엔드 API 연동
- **추측 금지**, 실제 API 호출로 응답 구조 확인 필수
```bash
ssh rossi@100.110.215.65 'curl -s "http://localhost:3010/api/endpoint" | python3 -m json.tool'
```

### 7. 날짜/시간 형식
| 유형 | 형식 | 예시 |
|------|------|------|
| 날짜+시간 | `YYYY.MM.DD HH:mm:ss` | `2025.11.30 18:35:32` |
| 날짜만 | `YYYY.MM.DD` | `2025.11.30` |

- 24시간제, 구분자 점(`.`), KST 기준
- 유틸리티: `@/shared/lib/timeUtils`

### 8. 🔴 고객명 유일성 철칙
**같은 설계사(userId) 내에서 고객명은 절대 중복 불가!**

| 범위 | 중복 허용 |
|------|----------|
| 개인/법인 | ❌ 불가 - "홍길동 개인"이 있으면 "홍길동 법인" 등록 불가 |
| 활성/휴면 | ❌ 불가 - 휴면 고객과도 이름 중복 불가 |
| 대소문자 | ❌ 불가 - "Hong"과 "hong"은 동일 |

**예시:**
- ✅ 설계사A: "홍길동" + 설계사B: "홍길동" (다른 설계사는 OK)
- ❌ 설계사A: "홍길동 개인" + 설계사A: "홍길동 법인" (동일 설계사 내 불가)
- ❌ 설계사A: "홍길동 활성" + 설계사A: "홍길동 휴면" (동일 설계사 내 불가)

### 9. 백엔드 배포 규칙
- 백엔드 파일 수정 후 **반드시** 각 서비스의 배포 스크립트 사용
- `pm2 restart`, `npm start`, `uvicorn` 직접 실행 등 **절대 금지**
- 절차: 로컬 수정 → `scp` → 배포 스크립트 실행

| 서비스 | 배포 스크립트 경로 |
|--------|-------------------|
| aims_api | `backend/api/aims_api/deploy_aims_api.sh` |
| aims_rag_api | `backend/api/aims_rag_api/deploy_aims_rag_api.sh` |
| annual_report_api | `backend/api/annual_report_api/deploy_annual_report_api.sh` |
| pdf_proxy | `backend/api/pdf_proxy/deploy_pdf_proxy.sh` |
| aims_mcp | `backend/api/aims_mcp/deploy_aims_mcp.sh` |
| pdf_converter | `tools/convert/deploy_pdf_converter.sh` |

```bash
# 사용 예시 (서버에서)
cd /home/rossi/aims/backend/api/aims_api && ./deploy_aims_api.sh
```

### 9-1. 🔑 API 키 관리 (Single Source of Truth)
**모든 외부 API 키는 `.env.shared` 한 곳에서만 정의한다!**

| 항목 | 값 |
|------|-----|
| **파일 위치** | `~/aims/.env.shared` (서버) |
| **Git 추적** | `.gitignore`에 등록 (커밋 금지) |
| **사용 서비스** | aims_api, aims_rag_api, document_pipeline, annual_report_api |

```bash
# ~/aims/.env.shared (서버에만 존재)
OPENAI_API_KEY=sk-proj-...
```

**키 변경 절차:**
1. `~/aims/.env.shared` 수정
2. `cd ~/aims && ./deploy_all.sh` 실행
3. 끝! (개별 `.env` 수정 불필요)

**키 로드 흐름:**
```
.env.shared ──► deploy_all.sh (export)
                 ├── aims_api (Docker -e)
                 ├── aims_rag_api (Docker -e)
                 ├── document_pipeline (PM2 env)
                 └── annual_report_api (nohup env)
```

**절대 금지:**
- ❌ 개별 서비스 `.env` 파일에 `OPENAI_API_KEY` 직접 기입
- ❌ `~/.bashrc`에 API 키 저장 (대화형 쉘 전용)

**배경:** 과거에 키가 `~/.bashrc`, `document_pipeline/.env`, `annual_report_api/.env` 3곳에 분산 저장되어 키 변경 시 일부 서비스만 반영되는 장애 발생 (2026-02-19)

### 10. 🚀 전체 배포 (Full Deploy)
**요청 방법**: `"전체 배포"` 또는 `"deploy all"`

사용자가 위 명령을 요청하면 **deploy_all.sh 스크립트 사용**:

```bash
ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'
```

**스크립트가 자동 수행하는 작업:**
1. Git 정리 및 Pull (`.build_hash` 파일 보존)
2. aims_api 배포
3. aims_rag_api 배포
4. annual_report_api 배포
5. pdf_proxy 배포
6. aims_mcp 배포
7. pdf_converter 배포
8. n8n 워크플로우 배포
9. Frontend 배포
10. Admin 배포
11. 서비스 상태 확인
12. Docker 정리

**스마트 빌드**: 소스 변경이 없는 서비스는 QUICK RESTART 모드로 빠르게 재시작

**주의사항:**
- 수동으로 `git clean -fd` 실행 금지 (`.build_hash` 파일 삭제됨 → 전체 재빌드 발생)
- 실패 시 즉시 중단하고 사용자에게 보고

### 11. 🔴 데이터 중복 금지 (Single Source of Truth)
**동일한 관계/데이터를 두 곳에 저장하지 않는다!**

| 원칙 | 설명 |
|------|------|
| 단일 소스 | 관계 데이터는 한 곳에만 저장 |
| 중복 저장 금지 | 동기화 실패로 데이터 불일치 발생 |
| 리팩토링 우선 | 잘못된 설계는 band-aid 수정 대신 근본적 리팩토링 |

**예시:**
- ✅ 문서-고객 관계: `files.customerId`만 사용
- ❌ 문서-고객 관계: `files.customerId` + `customers.documents[]` 이중 저장

> "중복된 코드/데이터는 가장 나쁜 디자인의 첫번째 증상이다."
> "본질적으로 잘못된 디자인이면 리팩토링하며 개선해야 한다. 순간을 모면하는 디자인은 최악이다."

### 12. 🔴 AI 어시스턴트 데이터 변경 시 화면 새로고침 (MUST!)
**AI 어시스턴트에서 데이터 등록/수정/삭제 시 반드시 CenterPane + RightPane 모두 새로고침!**

| 상황 | 처리 |
|------|------|
| 고객 등록/수정/삭제 | `window.location.reload()` |
| 문서 삭제 | `window.location.reload()` |
| 관계 등록 | `window.location.reload()` |

**구현 위치**: `ChatPanel.tsx`의 `handleSubmit` 함수
- `DATA_MUTATING_TOOLS` 배열의 도구가 성공하면 페이지 새로고침
- 응답이 화면에 표시된 후 1.5초 딜레이 후 새로고침 (`setTimeout`)
- 대화 내용은 localStorage에 저장되어 새로고침 후에도 유지됨

**절대 금지:**
- 복잡한 이벤트 기반 부분 새로고침 ❌
- 단순하게 `window.location.reload()` 사용 ✅

### 12-1. 🔴 Optimistic Update 금지
**프론트엔드에서 Optimistic Update 패턴 사용 금지!**

| 금지 | 이유 |
|------|------|
| 로컬 상태 먼저 업데이트 후 API 호출 | 실패 시 롤백 복잡, 데이터 불일치 |
| API 응답 기다리지 않고 UI 반영 | 서버 상태와 클라이언트 상태 불일치 |
| 백엔드 페이지네이션 + 로컬 상태 조작 | 구조적 한계로 빈 화면 버그 발생 |

**올바른 패턴:**
1. API 호출 (로딩 표시)
2. API 응답 완료 후 `window.location.reload()` 또는 데이터 재조회
3. 새로고침으로 서버 상태와 동기화

**⚔️ "Optimistic Update"라는 말만 그럴싸하게 쓰고 버그 만들지 마라.**
**⚔️ 이 규칙 위반 시 참수형에 처한다.**

### 13. 🔐 네트워크 보안 아키텍처 (Tailscale VPN)
**개발 환경에서 프론트엔드 → 백엔드 접속은 반드시 Tailscale VPN 경유!**

```
[프론트엔드 localhost:5177] ══> Tailscale VPN ══> [백엔드 100.110.215.65:3010]
```

| 항목 | 설정값 |
|------|--------|
| Tailscale IP | `100.110.215.65` (tars 서버) |
| aims_api | `http://100.110.215.65:3010` |
| aims_rag_api | `http://100.110.215.65:8000` |
| aims_mcp | `http://100.110.215.65:3011` |
| pdf_proxy | `http://100.110.215.65:8002` |
| annual_report_api | `http://100.110.215.65:8004` |
| pdf_converter | `http://100.110.215.65:8005` |

**vite.config.ts 프록시 설정:**
```typescript
proxy: {
  '/api': {
    target: 'http://100.110.215.65:3010',  // Tailscale VPN (보안 접속)
    secure: false,
    changeOrigin: true
  }
}
```

**왜 Tailscale인가?**
- 백엔드 포트 (3010, 8000 등)는 **UFW 방화벽으로 외부 차단**
- 공인 IP (tars.giize.com)로 직접 접근 불가
- Tailscale 인증된 기기만 접속 가능 (보안 강화)
- 공유기/방화벽 설정 불필요

**상세 문서**: [docs/NETWORK_SECURITY_ARCHITECTURE.md](docs/NETWORK_SECURITY_ARCHITECTURE.md)

### 14. 🔴 에이전트/스킬 트리거 감지 시 정의 파일 필수 참조
**트리거 키워드 감지 시, 임의 실행 절대 금지!**

| 트리거 예시 | 필수 참조 파일 |
|------------|---------------|
| "전체 테스트", "full test" | `.claude/agents/full-test-runner.md` |
| "전체 배포", "deploy all" | `.claude/agents/full-deploy.md` |
| 기타 에이전트/스킬 | 해당 정의 파일 |

**절차:**
1. 트리거 키워드 감지
2. **반드시** 해당 정의 파일 먼저 Read
3. 정의 파일의 **모든 Phase/Step** 순차 실행
4. 일부만 실행하는 것은 **절대 금지**

**위반 예시:**
- ❌ "전체 테스트" 요청 → 정의 파일 안 읽고 typecheck만 실행
- ❌ 에이전트 정의에 Phase 1~3 있는데 Phase 1만 실행

**⚔️ 에이전트/스킬 정의 파일을 읽지 않고 임의 실행 시 참수형에 처한다.**

### 14-1. 🔴 스킬 완료 = 모든 산출물 생성
**스킬에서 "파일 생성"이 명시되면 반드시 파일을 생성해야 완료!**

| 스킬 정의 | 올바른 완료 | 잘못된 완료 |
|-----------|------------|------------|
| `report_{초성}.md 파일 생성` | 파일 생성 ✅ | 화면에 요약만 출력 ❌ |
| `결과를 JSON으로 저장` | JSON 파일 생성 ✅ | 화면에 JSON 출력 ❌ |

**원칙:**
- 스킬 정의에 **파일 경로**가 명시되면 → 해당 경로에 **파일 생성 필수**
- 화면 출력은 파일 생성을 **대체할 수 없음**
- 모든 Phase 완료 후에만 "스킬 완료"

**⚔️ 파일 생성 누락 시 스킬 미준수 = 참수형에 처한다.**

### 15. 🔴 고객 삭제/휴면 철칙 (오랫동안 지켜온 규칙)
**고객 삭제와 휴면은 완전히 다른 개념이다!**

| 모드 | 삭제 버튼 | 휴면 버튼 | 동작 |
|------|----------|----------|------|
| **개발자 모드** | ✅ 있음 | ✅ 있음 | 삭제 = DB에서 완전 삭제 (Hard Delete) |
| **일반 모드** | ❌ 없음 | ✅ 있음 | 휴면 설정/해제만 가능 |

**고객 상태 (meta.status):**
| 상태 | 의미 | 조회 |
|------|------|------|
| `'active'` | 활성 고객 | 기본 목록에 표시 |
| `'inactive'` | 휴면 고객 | 휴면 필터에서만 표시 |
| ~~`'deleted'`~~ | ❌ 존재하지 않음 | 삭제 = DB에서 완전 제거 |

**DELETE API (`DELETE /api/customers/:id`) 규칙:**
- ⭐ **항상 Hard Delete** - DB에서 완전 삭제
- ⭐ Soft Delete (상태 변경) **절대 금지**
- ⭐ 삭제된 고객이 휴면 목록에 나타나면 **버그**

**예시:**
- ✅ 개발자 모드에서 삭제 → DB에서 완전 삭제 → 어디에도 안 나타남
- ❌ 개발자 모드에서 삭제 → `meta.status: 'inactive'` 설정 → 휴면에 나타남 (버그!)
- ❌ 개발자 모드에서 삭제 → `meta.status: 'deleted'` 설정 (soft delete 금지!)

**⚔️ 삭제된 고객이 휴면 목록에 나타나면 참수형에 처한다.**

### 16. 🔴 SikuliX 테스트 실행 규칙 (/sikuli 스킬)
**SikuliX GUI 자동화 테스트는 `/sikuli` 스킬로 실행한다!**

| 트리거 | 설명 |
|--------|------|
| `/sikuli` | SikuliX 테스트 사이클 실행 |
| `sikuli 테스트` | 동일 |
| `sikulix 실행` | 동일 |

**실행 방법 (PowerShell 백그라운드):**
```bash
# 1. 스크린샷 폴더 비우기
cmd.exe /c "rd /s /q D:\aims\tools\MetlifePDF.sikuli\screenshots && mkdir D:\aims\tools\MetlifePDF.sikuli\screenshots"

# 2. PowerShell로 백그라운드 실행 (run_in_background: true)
powershell.exe -Command "Set-Location 'D:\aims\tools\MetlifePDF.sikuli'; java -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'verify_customer_integrated_view.py'"
```

**주의사항:**
- `cmd.exe`로 직접 실행 불가 → 반드시 `powershell.exe` 사용
- 실행 전 스크린샷 폴더 비우기 필수
- 완료 후 `debug_log.txt` 읽어서 결과 분석

**스킬 정의:** `.claude/skills/sikuli.md`

---

## System Overview

**AIMS** (Agent Intelligent Management System): 보험 설계사를 위한 지능형 문서 관리 시스템

### 도메인 모델
```
설계사 ─(1:N)─► 고객 ─(1:N)─► 문서
                  └─(0:N)─► 계약 ─(N:1)─► 보험상품 ─(N:1)─► 보험사
```

| 엔티티 | 설명 |
|--------|------|
| 설계사 | 보험 영업인, 여러 고객 관리 |
| 고객 | 설계사의 고객 (= 계약자) |
| 계약 | 증권번호, 계약상태, 피보험자 |

---

## Development Environment

| 환경 | 위치 |
|------|------|
| Backend Server | `tars.giize.com` (`/home/rossi/aims`) |
| Frontend | `D:\aims` (Windows) |
| Database | MongoDB `tars:27017/docupload` |

### 백엔드 수정 절차
1. **로컬에서 파일 수정** (D:\aims)
2. `scp`로 서버에 복사
3. 배포 스크립트 실행: `./deploy_aims_api.sh`

---

## Architecture

### Frontend (`frontend/aims-uix3/`)
- React + TypeScript + Vite
- TanStack Query + Zustand
- Apple design philosophy

### 공통 컴포넌트
| 컴포넌트 | 용도 |
|----------|------|
| `@/shared/ui/Modal` | 기본 모달 |
| `@/shared/ui/DraggableModal` | 드래그/리사이즈 모달 |
| `@/shared/ui/Button` | variant: primary/secondary/ghost/destructive/link |
| `@/shared/ui/Tooltip` | iOS 스타일 툴팁 |

**금지**: HTML `<button>` 직접 사용, Portal/ESC 직접 구현

### Backend Services
| 서비스 | 경로 | 포트 | 런타임 |
|--------|------|------|--------|
| aims_api | `backend/api/aims_api/` | 3010 | Docker |
| aims_rag_api | `backend/api/aims_rag_api/` | 8000 | Docker |
| aims_mcp | `backend/api/aims_mcp/` | 3011 | PM2 |
| pdf_proxy | `backend/api/pdf_proxy/` | 8002 | PM2 |
| annual_report_api | `backend/api/annual_report_api/` | 8004 | PM2 |
| pdf_converter | `tools/convert/` | 8005 | PM2 |
| document_pipeline | `backend/api/document_pipeline/` | 8100 | PM2 |

### 🔴 문서 처리 파이프라인 (n8n 사용 안함!)
**AIMS는 n8n 워크플로우 엔진을 사용하지 않는다!**

문서 처리는 **FastAPI 기반 document_pipeline** 서비스에서 처리:
- 경로: `backend/api/document_pipeline/`
- 워커: `workers/upload_worker.py` (MongoDB 큐 소비)
- 진행률: `_notify_progress()` 함수가 SSE webhook 호출

**⚔️ n8n 관련 코드/설정을 찾지 마라. 존재하지 않는다!**

---

## Commands

### Frontend
```bash
cd frontend/aims-uix3
npm run dev      # 개발 서버 (5177)
npm run build    # 프로덕션 빌드
npm test         # 테스트
npm run typecheck
```

### Backend
```bash
cd backend/api/aims_api && npm start
cd backend/api/doc_status_api && uvicorn main:app --reload
```

---

## 디자인 시스템

### Typography (Dense)
| 용도 | 크기 | weight |
|------|------|--------|
| 섹션 제목 | 13px | 600 |
| 테이블 데이터 | 12px | 400 |
| 테이블 헤더 | 11px | 600 |
| 배지 | 10px | 400 |

- font-weight 500 **사용 금지**

### Apple 디자인 원칙
1. **Clarity**: 정보 계층 명확
2. **Deference**: UI가 콘텐츠 방해 금지
3. **Depth**: 자연스러운 시각적 계층

- Progressive Disclosure: "Invisible until you need it"
- 화려한 그라데이션, 강한 색상 강조 금지

---

## 문제 해결

### React HMR 문제
```bash
pkill -f "react-scripts"
rm -rf node_modules/.cache
npm start
# 브라우저: Ctrl+Shift+R
```

### 아이콘 캐싱 문제
```bash
rm -rf node_modules/.vite dist .vite
npm run dev
# Ctrl+Shift+R
```

---

## Claude Code 자동화

프로젝트에 맞춤 설정된 스킬과 에이전트가 자동으로 적용됩니다.

### 스킬 (자동 적용되는 규칙)

| 스킬 | 용도 | 적용 시점 |
|------|------|----------|
| `ar-crs-parsing-rules` | **AR/CRS 파일명 판단 금지** | AR, CRS, pdfParser 작업 |
| `css-rules` | CSS 작성 규칙 | 스타일 수정, 색상 변경 |
| `datetime-format` | 날짜/시간 형식 | 날짜 표시 작업 |
| `deploy-guide` | 배포 절차 가이드 | 배포 요청 |
| `api-verify` | API 검증 명령어 | API 연동 작업 |
| `full-test` | 전체 테스트 실행 | "전체 테스트", "full test" 요청 |
| `ac-deploy` | **AC 빌드+배포 자동화** | `/ac-deploy`, "AC 빌드", "AC 배포" 요청 |

### 에이전트 (전문 분석)

| 에이전트 | 용도 | 적용 시점 |
|----------|------|----------|
| `aims-code-checker` | 코드 규칙 검사 | 코드 수정 후 |
| `full-deploy` | 전체 서비스 배포 | "전체 배포", "deploy all" 요청 시 |
| `deploy-monitor` | 배포 후 헬스체크 | 배포 완료 후 |
| `test-analyzer` | 테스트 실패 분석 | 테스트 실패 시 |
| `gini` | **SW 품질 검증 (Quality Gate)** | 아키텍처 변경, 인프라 수정, 미봉책 의심 시 |
| `alex` | **세계 최고 SW 개발자/아키텍트** | 복잡한 설계+구현, 대규모 변경, "Alex" 호출 시 |
| `dev` | **개발 오케스트레이터 (Alex+Gini)** | 설계→구현→QA 자동 진행, "Dev" 호출 시 |

### 🔴 지니 (Gini) - SW Quality Engineer

**역할**: 소프트웨어 품질 전문가. 개발자의 수정이 근본적 해결인지 미봉책인지 검증한다.

**철학**: "동작하면 끝이 아니다. 올바르게 동작해야 끝이다."

**검증 기준:**

| 항목 | 통과 조건 | 불합격 사유 |
|------|----------|------------|
| 근본 원인 해결 | 증상이 아닌 원인을 제거했는가 | 출력 숨기기, 에러 무시, 데이터 삭제로 해결 |
| 부작용 없음 | 수정이 다른 기능을 해치지 않는가 | 디버그 정보 손실, 에러 감지 불가 |
| 테스트 커버리지 | 수정 효과가 검증 가능한가 | 수동 확인만 가능, 자동 검증 없음 |
| 아키텍처 정합성 | 기존 설계 원칙과 일관되는가 | 임시 플래그, 특수 분기, 하드코딩 |
| 재발 방지 | 같은 문제가 다시 발생하지 않는가 | 동일 패턴이 다른 곳에 잔존 |

**워크플로우:**
1. 개발자가 수정 완료 → 지니에게 검증 요청
2. 지니가 5가지 기준으로 코드 리뷰
3. **PASS** (✅ 통과) 또는 **FAIL** (❌ 사유 + 개선 방향 제시)
4. FAIL 시 개발자가 수정 후 재검증 요청
5. **최종 PASS 후에만 사용자에게 결과 보고**

**지니 호출 시점:**
- 인프라/설정 변경 (vite.config, pre-commit hook, test setup 등)
- "미봉책 아닌가?" 의심이 드는 모든 수정
- 아키텍처에 영향을 미치는 변경
- 사용자가 명시적으로 품질 검증을 요청할 때

**지니 에이전트 정의**: `.claude/agents/gini-quality-engineer.md`

> **위치**: `.claude/skills/`, `.claude/agents/`
> **상세 문서**: [SUBAGENT_SKILL_PROPOSAL.md](docs/SUBAGENT_SKILL_PROPOSAL.md)

---

## 참조 문서

| 문서 | 내용 |
|------|------|
| [CSS_SYSTEM.md](frontend/aims-uix3/CSS_SYSTEM.md) | CSS 시스템 상세 |
| [DENSE_TYPOGRAPHY_SYSTEM.md](frontend/aims-uix3/docs/DENSE_TYPOGRAPHY_SYSTEM.md) | 타이포그래피 |
| [ICON_IMPLEMENTATION_TROUBLESHOOTING.md](docs/ICON_IMPLEMENTATION_TROUBLESHOOTING.md) | 아이콘 문제 해결 |
| [SECURITY_ROADMAP.md](docs/SECURITY_ROADMAP.md) | 보안 로드맵 |
| [NETWORK_SECURITY_ARCHITECTURE.md](docs/NETWORK_SECURITY_ARCHITECTURE.md) | 네트워크 보안 (Tailscale VPN) |
| [EXCEL_IMPORT_SPECIFICATION.md](docs/EXCEL_IMPORT_SPECIFICATION.md) | 고객/계약 일괄등록 엑셀 입력 표준 |
| [MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) | MCP 서버 (LLM 연동) |
