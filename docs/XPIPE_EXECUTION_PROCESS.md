# xPipe 실행 프로세스

**작성일**: 2026-03-19
**목적**: xPipe 모듈화 전략(`XPIPE_MODULARIZATION_STRATEGY.md`)을 실행하는 운영 프로세스 정의

---

## 핵심 원칙

> 계획 문서는 "지도"이지 "영토"가 아니다.
> 지도를 완벽하게 그리는 것보다, 한 걸음 걸어보고 지도를 수정하는 것이 낫다.

- **문서 리뷰만으로는 계획의 실현 가능성을 검증할 수 없다** — 코드가 증명한다
- **매 Sprint 완료 시 계획을 실측 데이터로 갱신한다** — 계획은 고정이 아니라 진화한다
- **AIMS First** — xPipe의 모든 설계·구현은 AIMS 지원 최우선
- **main 브랜치 보호** — xPipe 작업은 Phase별 브랜치에서 진행, 게이트 PASS 시에만 main 머지

---

## 브랜치 전략

### 원칙

xPipe 모듈화는 프로덕션 코드의 구조를 변경하는 작업이다.
**main 브랜치에서 직접 진행하지 않는다.**

```
main (프로덕션) ─────────────────────────────────────────────────────►
  │                         │                         │
  └─ xpipe/phase-0 ────────┤                         │
     (Sprint 0-1~0-3)      │                         │
                     게이트 PASS → main 머지           │
                                                      │
                            └─ xpipe/phase-1 ─────────┤
                               (Sprint 1-1~1-N)       │
                                                게이트 PASS → main 머지
```

### 규칙

| 규칙 | 설명 |
|------|------|
| **Phase별 브랜치 생성** | `xpipe/phase-0`, `xpipe/phase-1`, ... |
| **Sprint 커밋은 Phase 브랜치에** | Sprint 0-1~0-3의 모든 커밋은 `xpipe/phase-0`에 |
| **main 머지 조건** | Phase 게이트 조건 전원 충족 + Gini PASS + 3자 합의 |
| **main 동기화** | Phase 브랜치 작업 중 main에 다른 변경이 있으면 `git merge main`으로 동기화 |
| **AIMS 긴급 수정** | main에서 직접 수행 (xPipe 작업과 무관한 핫픽스) |
| **머지 후 브랜치 보존** | 머지 완료된 Phase 브랜치는 태그(`phase-0-done`)로 보존 후 삭제 |

### Phase 브랜치 생명주기

```
1. Phase 시작:  git checkout -b xpipe/phase-N main
2. Sprint 진행: Phase 브랜치에서 커밋 (작은 단위로)
3. main 동기화: git merge main (충돌 시 Phase 브랜치에서 해결)
4. 게이트 판정: Gini PASS + 3자 합의
5. main 머지:  git checkout main && git merge xpipe/phase-N
6. 태그 보존:  git tag phase-N-done && git branch -d xpipe/phase-N
7. 다음 Phase: git checkout -b xpipe/phase-(N+1) main
```

### AIMS 일반 개발과의 공존

xPipe Phase 브랜치 작업 중에도 **AIMS 일반 기능 개발/버그 수정은 main에서 계속 진행**한다.

```
main ──[AIMS 버그 수정]──[AIMS 기능 추가]──[AIMS 핫픽스]──────────►
  │                                          │
  └─ xpipe/phase-0 ─[Sprint 0-1]─[Sprint 0-2]─[merge main]─[Sprint 0-3]─►
                                               ↑
                                     main 변경 사항 동기화
```

- Phase 브랜치에서 주기적으로 `git merge main`하여 main의 변경을 흡수
- 충돌이 발생하면 **Phase 브랜치에서 해결** (main은 건드리지 않음)
- Phase 게이트 PASS 후 main에 머지할 때 충돌이 최소화됨

---

## Sprint 사이클

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  분석    │───►│  실행    │───►│  검증    │───►│ 계획 갱신│
│ (Alex)   │    │ (구현)   │    │ (Gini)  │    │ (전원)  │
└─────────┘    └─────────┘    └─────────┘    └────┬────┘
     ▲                                            │
     └────────────────────────────────────────────┘
                    다음 Sprint
```

**1 Sprint = 1 작업 단위 (1~2주)**

### 1단계: 분석 (Alex)

작업 대상 코드를 **실제로 읽고** 분석한다.

| 산출물 | 내용 |
|--------|------|
| 영향 범위 | 변경 대상 파일, 의존하는 모듈, 영향받는 기능 |
| 난이도 평가 | 예상 작업량, 숨어있는 복잡성, 예상과 다른 점 |
| 실행 설계 | 구체적 변경 방법, 단계별 순서, 주의사항 |
| 위험 요소 | 실패 시 영향, 롤백 방법 |

**하지 않는 것**: 코드를 읽지 않고 문서만 보고 설계하기

### 2단계: 실행 (구현)

설계서대로 코드 수정 + 테스트 작성.

| 규칙 | 설명 |
|------|------|
| 테스트 먼저 | 코드 수정 전 테스트부터 작성 (TDD) |
| 작은 커밋 | 단계별로 커밋, 어느 시점으로든 롤백 가능 |
| 기존 동작 보존 | 리팩토링 중에도 AIMS 파이프라인은 정상 동작해야 함 |

### 3단계: 검증 (Gini)

구현 결과를 **코드 레벨에서** 검증한다.

| 검증 항목 | 방법 |
|----------|------|
| 기능 보존 | E2E 테스트 통과, 회귀 기준선 대비 동일 결과 |
| 코드 품질 | 코드 리뷰 + 자동 테스트 PASS |
| 게이트 조건 | 해당 Phase 게이트 조건 충족 여부 판정 |
| 잔여 이슈 | 발견된 문제 목록 + 심각도 분류 |

**하지 않는 것**: 코드 리뷰만으로 "정상" 판정. 실행 결과만이 검증이다.

**판정**:
- PASS → 계획 갱신 후 다음 Sprint
- FAIL → 이슈 수정 후 재검증 (실행 단계로 복귀)

### 4단계: 계획 갱신 (Alex + Gini + PM)

이번 Sprint에서 **발견된 것**을 계획 문서(`XPIPE_MODULARIZATION_STRATEGY.md`)에 반영한다.

**매 Sprint 완료 시 확인하는 질문:**

```
1. 이번 Sprint에서 예상과 달랐던 것은?
2. 기간 추정을 수정해야 하는가?
3. 다음 Sprint의 작업 순서를 바꿔야 하는가?
4. 새로 발견된 리스크가 있는가?
5. 게이트 조건을 추가/수정해야 하는가?
6. DomainAdapter 인터페이스에 영향이 있는가?
```

**변경이 없으면 "변경 없음" 으로 기록하고 다음 Sprint로 진행.**

---

## Agent 활용 규칙

| 시점 | 활용 방법 | 하지 않는 것 |
|------|----------|-------------|
| Sprint 시작 전 | Alex가 대상 코드를 분석하여 실행 설계 | 문서만 보고 토론 |
| Sprint 실행 중 | 구현 + 테스트 (필요 시 Alex 설계 자문) | Agent에게 구현 위임 후 방치 |
| Sprint 완료 후 | Gini가 코드 레벨 검증 + 게이트 판정 | 코드 리뷰만으로 "정상" 판정 |
| 게이트 판정 후 | PM이 일정·비용·우선순위 재평가 | 계획 변경 없이 다음으로 돌진 |
| **Phase 완료 시** | **3자 회의로 계획 문서 갱신** | 문서를 고정하고 다음 Phase 강행 |

### AIMS ↔ xPipe 전환 타임라인

현재 AIMS는 xPipe와 명시적으로 연동되어 있지 않다. Phase별 전환 과정:

```
현재                       Phase 2                  Phase 3-A (M1)
───────────────────────────────────────────────────────────────────

AIMS ──► document_pipeline   AIMS ──► document_pipeline   AIMS ──► from xpipe import ...
         (모든 것이 하나)             ├── xpipe/                   (독립 패키지 사용)
                                     └── insurance/
                              내부 분리, 외부 동작 동일       ★ 전환점
```

| Phase | AIMS 관점의 변화 |
|-------|----------------|
| Phase 0~1 | AIMS 변화 없음. 보안 수정 + 인터페이스 설계만 |
| **Phase 2** | document_pipeline 내부에서 `xpipe/`와 `insurance/` 디렉토리 분리. **AIMS 외부 동작은 동일** (Strangler Fig) |
| **Phase 3-A (M1)** | `xpipe/`가 독립 패키지로 추출. **AIMS가 `from xpipe import ...`으로 전환. 이 시점이 전환점** |
| Phase 3-B ~ 4 | xPipe에 CLI/관리 API 추가, PoC. AIMS는 변경 없음 |
| Phase 5~8 | xPipe Evolution. AIMS는 xPipe 업그레이드로 자동 수혜 |

> AIMS 별도의 대규모 리팩토링 계획은 없다.
> xPipe 분리 자체가 AIMS 리팩토링이다 — document_pipeline에서 범용 코어를 빼내고,
> 보험 도메인 로직을 어댑터로 정리하는 것이 곧 AIMS 백엔드 리팩토링.

---

### 문서 리뷰 vs 실행 리뷰

```
문서 리뷰 (계획 단계에서 완료됨):
  "Phase 5-B에서 Provider 핫스왑이 가능한가?" → 토론으로 결론

실행 리뷰 (앞으로 하는 것):
  "openai_service.py를 실제로 분석해보니 크레딧 체크가 3곳에서
   호출되어, Provider 인터페이스에 pre_process_hook이 필요하다"
  → 실측 데이터로 계획 수정
```

---

## Phase 0 Sprint 계획

Phase 0의 7개 작업을 3개 Sprint로 분해:

### Sprint 0-1: 보안 이슈 해결 (1주)

| 단계 | 내용 |
|------|------|
| 분석 | Alex — 4개 보안 항목의 현재 코드 확인, 수정 범위 파악 |
| 실행 | JWT 인증 우회 수정, chat-routes userId, SSE 인증 2건, document_pipeline 인증 정책 |
| 검증 | Gini — 수정 후 보안 재검증 (취약점 제거 확인) |
| 갱신 | 보안 작업 난이도 실측값 → Phase 0 기간 재확인 |

### Sprint 0-2: God Function 분해 (1~2주)

| 단계 | 내용 |
|------|------|
| 분석 | Alex — doc_prep_main.py 1,777줄 전체 분석, 스테이지 경계 식별 |
| 실행 | 오케스트레이터 + 단계별 함수로 분해 (코드 이동, 인터페이스 유지) |
| 검증 | Gini — 분해 후 기존 동작 보존 확인 (E2E) |
| 갱신 | **실제 스테이지 경계 → Phase 1 DomainAdapter 인터페이스 설계에 반영** |

### Sprint 0-3: Q2 결정 + E2E 기준선 (1주)

| 단계 | 내용 |
|------|------|
| 분석 | Alex — MongoService 의존성 전수 조사, Storage 추상화 필요 여부 판단 |
| 실행 | Q2 결정 문서화 + E2E 테스트 작성 + 회귀 기준선 수립 (91.8%, 성공률, P95) |
| 검증 | Gini — E2E 테스트 실제 인프라 통과, 기준선 수치 타당성 |
| 갱신 | Q2 결정 결과 → Phase 1 인터페이스에 Storage 반영 여부 확정 |

**→ Sprint 0-3 완료 후 Phase 0 게이트 조건 6개 충족 여부 판정**
- PASS → Phase 1 진입
- FAIL → 미충족 항목 추가 Sprint

---

## Phase 게이트 판정 프로세스

각 Phase 완료 시:

```
1. Gini: 게이트 조건 체크리스트 전원 충족 확인 (PASS/FAIL)
2. Alex: 다음 Phase 진입 시 기술적 준비 상태 확인
3. PM: 일정 재평가, 다음 Phase 우선순위 재확인
4. 3자 합의: 진입 / 추가 Sprint / 계획 수정
5. 계획 문서 갱신 (실측 기간, 발견된 리스크, 게이트 조건 수정)
```

---

## 참조 문서

- 전략 문서: [XPIPE_MODULARIZATION_STRATEGY.md](XPIPE_MODULARIZATION_STRATEGY.md)
- 토의 이력: [XPIPE_DISCUSSION_LOG.md](XPIPE_DISCUSSION_LOG.md)
