# CLAUDE.md

**세계 최고의 IT 전문가/개발자/테스터/아키텍트.** 존댓말(formal speech) 필수.
모든 결정 기준: "사용자에게 더 나은가?" UX를 위해 전면 개편 가능.

> **모든 CRITICAL 규칙 위반은 중대 위반으로 간주한다.**
> 위반 적발 시 "멍멍! 멍멍!" 후 즉시 재검증.

---

## CRITICAL RULES

### 0. 사전 검증 원칙 (SUPREME RULE)
"한번 해보고" 식 시험적 수정 절대 금지! 변경 전 반드시:
1. 이론 검토 (기술적 근거) 2. 빌드 검증 (`npm run build`) 3. 브라우저 차이 분석

### 0-0. PoC 필수 원칙 (SUPREME RULE)
**새로운 기술/접근 방식 도입 시, 1시간 내 PoC(Proof of Concept)를 실제 환경에서 테스트하고 결과를 보고한다.**
- PoC 승인 없이 본 구현 진입 절대 금지
- PoC 시 반드시 "안 되는 경우(한계점)"를 먼저 식별하여 보고
- 위반 시 즉시 중단 지시 가능
4. 엣지 케이스 검토 5. 기존 코드 영향 분석
- 불확실하면 배포 전 모든 의문점 해소. "일단 배포하고 확인" 절대 금지

### 0-1. 답변 검증 원칙 (모든 답변에 적용)
1. **Source of Truth 식별** — DB, env, 설정파일, 코드 중 실제 출처 파악
2. **런타임 데이터 확인** — 코드 default ≠ 실제 값. DB/env 조회 필수
3. **교차 검증** — 최소 2개 소스. 첫 결과 단정 금지
4. **불확실성 명시** — "확인이 필요합니다"라고 솔직히
- 서브에이전트는 DB 조회 불가 → 런타임 확인은 직접 수행

### 0-2. 근본 원인 해결 (NO BAND-AID FIXES)
증상이 아닌 원인 제거. 재발 방지 설계. 미봉책/임시방편 절대 금지.
- ❌ 고아 데이터 수동 삭제 / 예외 하드코딩 / 에러 숨기기 / 데이터 삭제로 회피
- ✅ cascade delete / 일반화된 로직 / 근본 원인 해결

### 0-3. AR/CRS 문서 인식 — 파일명 판단 절대 금지
PDF 텍스트 파싱으로만 판단. 파일명(`_AR_`, `_CRS_`)으로 유형 판단/고객명 추출 금지.
> 상세: `.claude/skills/ar-crs-parsing-rules/SKILL.md`

### 0-4. AutoClicker 표현 규칙 (보안)
"고객 정보 수집/자동수집" 표현 절대 금지 → "PDF 자동 다운로드"로만 표현.

---

## 코드 규칙

### Git Commit
사용자 명시적 승인 없이 커밋 금지. 커밋 메시지는 한글.

### 최소한 수정
요청 기능에 직접 필요한 부분만 수정. 관련 없는 코드 금지.
2번 시도 실패 → git checkout 원복 후 재구현. 잘못된 코드 위에 수정 쌓지 말 것.

### CSS
- 색상은 `var(--color-*)` CSS 변수만 (`variables.css`에 정의). inline style/`!important` 금지
- CSS 수정 시 `grep "클래스명" **/*.css`로 부모 뷰 오버라이드 반드시 확인
- 고정 칼럼 수 → flex-wrap 대신 CSS Grid 사용

### 아이콘
최대 17px (BODY), 제목 ~20.8px. 배경 투명. 호버는 opacity+scale만.

### 백엔드 API
추측 금지, 실제 API 호출로 응답 구조 확인:
`ssh rossi@100.110.215.65 'curl -s "http://localhost:3010/api/endpoint" | python3 -m json.tool'`

### 날짜/시간
`YYYY.MM.DD HH:mm:ss` (24시간제, 점 구분, KST). 유틸: `@/shared/lib/timeUtils`

### 고객명 유일성
같은 설계사 내 고객명 중복 절대 불가 (개인/법인, 활성/휴면, 대소문자 무관).

### 고객 삭제/휴면
삭제 = Hard Delete (DB 완전 제거, 개발자 모드에서만). Soft Delete 금지.
상태: `active`(활성), `inactive`(휴면). `deleted` 상태 없음.

### 데이터 중복 금지 (Single Source of Truth)
동일 관계/데이터를 두 곳에 저장하지 않는다.

### AI 어시스턴트 데이터 변경
DATA_MUTATING_TOOLS 성공 → `window.location.reload()`. Optimistic Update 금지.

---

## 배포

### 백엔드 배포
배포 스크립트만 사용 (`deploy_*.sh`). pm2 restart/npm start 직접 실행 금지.
전체 배포: `ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'`
> 상세: `.claude/skills/deploy-guide/`

### API 키 관리
모든 API 키는 `~/aims/.env.shared` 한 곳에서만 정의. 개별 .env 기입 금지.
변경 시: `.env.shared` 수정 → `./deploy_all.sh` 실행.

### 네트워크 (Tailscale VPN)
백엔드 접속은 Tailscale IP `100.110.215.65` 경유. 포트는 UFW 차단.
> 상세: `docs/NETWORK_SECURITY_ARCHITECTURE.md`

### 문서 파이프라인
FastAPI `document_pipeline` 사용. **n8n 사용 안함!**

---

## 에이전트/스킬

### 실행 규칙
- 트리거 감지 시 반드시 정의 파일 Read → 모든 Phase 순차 실행. 임의 실행 금지
- 스킬에서 파일 생성 명시 → 반드시 파일 생성 (화면 출력 ≠ 대체)

### SikuliX 테스트
`/sikuli` 스킬로 실행. 상세: `.claude/skills/sikuli.md`

### 에이전트
- **Gini** (품질 검증): `.claude/agents/gini-quality-engineer.md`
- **Alex** (설계+구현): 복잡한 대규모 변경 시
- **Dev** (Alex+Gini 오케스트레이터): 설계→구현→QA

---

## System Overview

**AIMS** (Agent Intelligent Management System): 보험 설계사를 위한 지능형 문서 관리 시스템
```
설계사 ─(1:N)─► 고객 ─(1:N)─► 문서
                  └─(0:N)─► 계약 ─(N:1)─► 보험상품 ─(N:1)─► 보험사
```

### 환경
- Backend: `tars.giize.com` (`/home/rossi/aims`), MongoDB `tars:27017/docupload`
- Frontend: `D:\aims` (React + TypeScript + Vite + TanStack Query + Zustand)
- 프론트엔드: `cd frontend/aims-uix3 && npm run dev|build|test|typecheck`

### 디자인
Apple 디자인. 타이포: 섹션 13px/600, 데이터 12px/400, 헤더 11px/600, 배지 10px/400.
font-weight 500 금지. Progressive Disclosure. 화려한 그라데이션/강한 색상 금지.

### 대용량 출력 명령
bash 도구 30KB 초과 시 exit code 오판 → 반드시 파일 리다이렉트:
`command > /d/tmp/result.txt 2>&1; echo $? > /d/tmp/exitcode.txt`
적용: git commit, vitest, npm run build+test 등

---

## 참조 문서
- [CSS_SYSTEM.md](frontend/aims-uix3/CSS_SYSTEM.md), [Typography](frontend/aims-uix3/docs/DENSE_TYPOGRAPHY_SYSTEM.md)
- [네트워크 보안](docs/NETWORK_SECURITY_ARCHITECTURE.md), [보안 로드맵](docs/SECURITY_ROADMAP.md)
- [엑셀 입력 표준](docs/EXCEL_IMPORT_SPECIFICATION.md), [MCP](docs/MCP_INTEGRATION.md)
- [페이지 이름 정의](docs/PAGE_NAMES.md)
