# ACE Process 개선 계획 — 단계별 구현

> 작성일: 2026-04-01
> 목적: ACE Process 하네스 실용성 강화 (시간 단축 + 시각 검증 정확도 + 에이전트 효율화)

---

## 문제 요약

| 문제 | 원인 |
|------|------|
| 너무 느림 (30분~1시간+) | 단순 작업도 6단계 풀코스 |
| UI 검증 부정확 | LLM 눈으로 pixel 비교 = 한계 |
| 에이전트 낭비 | 매번 코드베이스 처음부터 탐색, 순차 실행 |

---

## 개선 개요 (5가지)

| # | 개선 | 효과 |
|---|------|------|
| 1 | 작업 크기별 경로 분리 (S/M/L) | 단순 작업 5~10분으로 단축 |
| 2 | Pixel Diff 도입 | 시각 검증 정확도 근본 해결 |
| 3 | 에이전트 병렬 실행 | 검증 30~40% 시간 단축 |
| 4 | 컨텍스트 패키지 전달 | 에이전트 중복 탐색 제거 |
| 5 | Validation Loop 경량화 | S/M 경로 검증 시간 단축 |

### 경로별 비교

```
S (CSS, 텍스트, 단순버그)  →  AC 1줄 → Alex → 빌드+Gini        = 5~10분
M (기능수정, 버그수정)     →  AC → Alex → Gini+E2E → Jude       = 15~25분
L (신규기능, 아키텍처)     →  현행 풀 ACE 6단계                  = 30분+
```

### Pixel Diff 검증 흐름

```
[기존]  스크린샷 → LLM이 눈으로 봄 → 부정확
[개선]  스크린샷 → Playwright pixel diff → 차이 정확히 검출 → LLM은 "의도된 변경인가?"만 판단
```

### 병렬 실행 조합

```
[기존]  Gini → 배포 → E2E → Mira  (순차)
[개선]  Gini + 단위테스트 동시 / E2E + Mira 동시
```

---

## Phase 1: 문서 수정 (즉시 적용)

### Step 1. SKILL.md에 크기 분류 기준 추가
- **파일:** `.claude/skills/ace-process/SKILL.md`
- **작업:**
  - S/M/L 판단 기준표 삽입
  - 각 경로별 단계 정의 (S는 4단계, M은 5단계, L은 현행 6단계)
  - S 경로: AC 1줄 → Alex 구현 → 빌드 + Gini → 완료
  - M 경로: AC → Alex → Gini + E2E → Jude → 완료
  - L 경로: 현행 풀 ACE 6단계 유지

### Step 2. SKILL.md에 병렬 실행 규칙 추가
- **파일:** `.claude/skills/ace-process/SKILL.md`
- **작업:**
  - Gini + 단위테스트 병렬 허용 명시
  - E2E + Mira 병렬 허용 명시
  - 병렬 가능/불가능 조합 명시 (의존 관계가 있는 것은 순차 유지)

### Step 3. SKILL.md에 Validation Loop 경로별 차등 적용
- **파일:** `.claude/skills/ace-process/SKILL.md`
- **작업:**
  - S: 빌드 + Gini만
  - M: 로컬 PASS 후 배포 1회
  - L: 현행 유지 (빌드 + 단위테스트 + Gini + 배포 + E2E)

### Step 4. SKILL.md에 컨텍스트 패키지 규격 추가
- **파일:** `.claude/skills/ace-process/SKILL.md`
- **작업:**
  - 단계 전환 시 전달할 정보 목록 정의
  - 규격: 변경 대상 파일 목록 + 경로, AC 목록, 이전 단계 산출물 요약, 관련 코드 스니펫
  - 에이전트가 코드베이스 재탐색 없이 바로 작업 시작 가능하도록

### Step 5. 에이전트 조건부 호출 규칙 추가
- **파일:** `.claude/skills/ace-process/SKILL.md`
- **작업:**
  - S: Gini만
  - M: Gini + Jude
  - L: Gini + Jude + Mira

---

## Phase 2: Pixel Diff 도입 (코드 구현)

### Step 1. Playwright 설정에 screenshot comparison 활성화
- **파일:** `frontend/aims-uix3/playwright.config.ts`
- **작업:**
  - `expect.toHaveScreenshot` 옵션 추가
  - threshold, maxDiffPixels 등 허용 오차 설정
  - 스크린샷 저장 경로 지정

### Step 2. visual-diff 헬퍼 유틸 생성
- **파일:** `frontend/aims-uix3/e2e/utils/visual-diff.ts` (신규)
- **작업:**
  - golden image 경로 관리 함수
  - diff 결과를 파일로 출력하는 함수
  - diff 이미지 저장 경로 규격 정의
  - Mira/Jude가 소비할 수 있는 diff 결과 포맷

### Step 3. golden image 초기 세트 캡처
- **저장 경로:** `frontend/aims-uix3/e2e/screenshots/`
- **작업:**
  - 주요 화면별 기준 스크린샷 촬영 (데스크톱 + 모바일 375px)
  - 업데이트 절차 문서화 (의도적 UI 변경 시 golden image 갱신 명령)
  - `npx playwright test --update-snapshots` 같은 갱신 커맨드 정리

### Step 4. Mira 에이전트 규칙 수정
- **파일:** `.claude/agents/mira-qa/AGENT.md`
- **작업:**
  - 검증 흐름 변경: pixel diff 1차 → 시각 판단 2차
  - pixel diff 결과 읽는 방법 명시
  - diff 없음 = 비시각적 변경으로 간주 허용
  - diff 있음 = 변경 영역을 집중 확인

### Step 5. Jude 에이전트 규칙 수정
- **파일:** `.claude/agents/jude-ac-auditor/AGENT.md`
- **작업:**
  - pixel diff 증거를 Evidence로 인정하는 규칙 추가
  - diff 없음 = 시각 변경 없음 → 시각 AC는 PASS로 간주 허용
  - diff 있음 = 의도된 변경인지 AC와 대조하여 판단

### Step 6. Mira 시각 판단 피드백 규칙 완화
- **파일:** `memory/feedback_mira_visual_judgment.md`
- **작업:**
  - "프로그래밍적 측정으로 PASS/FAIL 판단 금지" 규칙 완화
  - 변경: "pixel diff는 측정 도구로 허용. diff 결과 + 시각 확인을 종합하여 판단"

---

## 수정 대상 파일 전체 목록

| Phase | 파일 | 변경 유형 |
|-------|------|-----------|
| 1 | `.claude/skills/ace-process/SKILL.md` | 수정 (경로분류, 병렬, 경량화, 컨텍스트, 조건부호출) |
| 2 | `frontend/aims-uix3/playwright.config.ts` | 수정 (screenshot comparison 설정) |
| 2 | `frontend/aims-uix3/e2e/utils/visual-diff.ts` | 신규 (pixel diff 헬퍼) |
| 2 | `frontend/aims-uix3/e2e/screenshots/` | 신규 (golden image 디렉토리) |
| 2 | `.claude/agents/mira-qa/AGENT.md` | 수정 (pixel diff 검증 흐름) |
| 2 | `.claude/agents/jude-ac-auditor/AGENT.md` | 수정 (diff 증거 규칙) |
| 2 | `memory/feedback_mira_visual_judgment.md` | 수정 (규칙 완화) |
